import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { Prisma } from "@crm/db";
import { OPEN_STAGE_FILTER } from "@crm/db/deal-stage";
import {
	IMPORT_ORDER,
	isoDay,
	lineProgress,
	receivedAfterDays,
	type ShippedPart,
	withLeadTimes,
} from "@crm/db/import-order";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { taskDayBoundaries, taskDueDay } from "../activities/task-due-date";
import { blankToNull, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { moveShipmentInTx } from "../imports/shipment-moves";
import {
	archivedFilter,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ImportOrderCreateInput,
	ImportOrderDetail,
	ImportOrderLineInput,
	ImportOrderList,
	ImportOrderListInput,
	ImportOrderOptions,
	ImportOrderRow,
	ImportOrderUpdateInput,
	ShipmentCreateInput,
	ShipmentMoveRequest,
	ShipmentUpdateInput,
} from "./import-orders.contracts";

const SORTABLE: OrderByColumns<Prisma.PurchaseOrderOrderByWithRelationInput> = {
	number: (dir) => ({ number: dir }),
	supplierName: (dir) => ({ supplierName: dir }),
	orderedAt: (dir) => ({ orderedAt: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	archivedAt: (dir) => ({ archivedAt: { sort: dir, nulls: "last" } }),
};

const STAGE_SELECT = {
	key: true,
	name: true,
	kind: true,
	tone: true,
} satisfies Prisma.ImportStageSelect;

const SHIPPED_SELECT = {
	quantity: true,
	shipment: { select: { stage: { select: { kind: true } } } },
} satisfies Prisma.ShipmentLineSelect;

const LIST_SELECT = {
	id: true,
	number: true,
	supplierName: true,
	orderedAt: true,
	archivedAt: true,
	createdAt: true,
	lines: {
		select: { quantity: true, shipmentLines: { select: SHIPPED_SELECT } },
	},
	_count: { select: { shipments: true } },
} satisfies Prisma.PurchaseOrderSelect;

const DETAIL_SELECT = {
	id: true,
	number: true,
	supplierName: true,
	orderedAt: true,
	notes: true,
	archivedAt: true,
	lines: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: {
			id: true,
			productId: true,
			quantity: true,
			unitCostUsd: true,
			dealId: true,
			product: { select: { sku: true, name: true } },
			deal: { select: { name: true } },
			shipmentLines: { select: SHIPPED_SELECT },
		},
	},
	shipments: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: {
			id: true,
			reference: true,
			trackingNumber: true,
			stageChangedAt: true,
			stage: { select: STAGE_SELECT },
			lines: {
				orderBy: { createdAt: "asc" },
				select: {
					orderLineId: true,
					quantity: true,
					orderLine: {
						select: { product: { select: { sku: true, name: true } } },
					},
				},
			},
			events: {
				orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
				select: {
					id: true,
					occurredAt: true,
					stage: { select: STAGE_SELECT },
				},
			},
		},
	},
} satisfies Prisma.PurchaseOrderSelect;

type ShippedRecord = Prisma.ShipmentLineGetPayload<{
	select: typeof SHIPPED_SELECT;
}>;

type ListRecord = Prisma.PurchaseOrderGetPayload<{
	select: typeof LIST_SELECT;
}>;

type LockedOrder = { id: string; orderedAt: Date; archivedAt: Date | null };

function partsOf(rows: readonly ShippedRecord[]): ShippedPart[] {
	return rows.map((row) => ({
		quantity: row.quantity,
		kind: row.shipment.stage.kind,
	}));
}

function toListRow(record: ListRecord): ImportOrderRow {
	const totals = record.lines.reduce(
		(sum, line) => {
			const progress = lineProgress(line.quantity, partsOf(line.shipmentLines));
			return {
				ordered: sum.ordered + line.quantity,
				shipped: sum.shipped + progress.shipped,
				received: sum.received + progress.received,
			};
		},
		{ ordered: 0, shipped: 0, received: 0 },
	);

	return {
		id: record.id,
		number: record.number,
		supplierName: record.supplierName,
		orderedAt: isoDay(record.orderedAt),
		lineCount: record.lines.length,
		orderedUnits: totals.ordered,
		shippedUnits: totals.shipped,
		receivedUnits: totals.received,
		shipmentCount: record._count.shipments,
		archivedAt: record.archivedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
	};
}

function lineData(line: ImportOrderLineInput) {
	return {
		productId: line.productId,
		quantity: line.quantity,
		unitCostUsd: new Prisma.Decimal(line.unitCostCents).dividedBy(100),
		dealId: line.dealId,
	};
}

@Injectable()
export class ImportOrdersService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		actingUserId: string,
		input: ImportOrderListInput,
	): Promise<ImportOrderList> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [records, total, role] = await Promise.all([
			this.db.purchaseOrder.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, { orderedAt: "desc" }),
				select: LIST_SELECT,
			}),
			this.db.purchaseOrder.count({ where }),
			workspaceRoleOf(actingUserId),
		]);

		return {
			rows: records.map(toListRow),
			total,
			facetCounts: {},
			canManage: canManageInventory(role),
		};
	}

	async options(): Promise<ImportOrderOptions> {
		const [products, deals] = await Promise.all([
			this.db.product.findMany({
				where: { archivedAt: null },
				orderBy: { sku: "asc" },
				take: IMPORT_ORDER.optionsLimit,
				select: { id: true, sku: true, name: true, referenceCostUsd: true },
			}),
			this.db.deal.findMany({
				where: { AND: [{ archivedAt: null }, OPEN_STAGE_FILTER] },
				orderBy: { updatedAt: "desc" },
				take: IMPORT_ORDER.optionsLimit,
				select: { id: true, name: true, company: { select: { name: true } } },
			}),
		]);

		return {
			products: products.map((product) => ({
				id: product.id,
				sku: product.sku,
				name: product.name,
				referenceCostCents: toCents(product.referenceCostUsd),
			})),
			deals: deals.map((deal) => ({
				id: deal.id,
				name: deal.name,
				companyName: deal.company.name,
			})),
		};
	}

	async detail(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		const [order, stages, role] = await Promise.all([
			this.db.purchaseOrder.findUnique({
				where: { id },
				select: DETAIL_SELECT,
			}),
			this.db.importStage.findMany({
				where: { archivedAt: null },
				orderBy: { position: "asc" },
				select: STAGE_SELECT,
			}),
			workspaceRoleOf(actingUserId),
		]);
		if (!order) {
			throw new NotFoundException("No existe una orden con ese id.");
		}
		const { startOfToday } = taskDayBoundaries(now);

		return {
			id: order.id,
			number: order.number,
			supplierName: order.supplierName,
			orderedAt: isoDay(order.orderedAt),
			notes: order.notes,
			archivedAt: order.archivedAt?.toISOString() ?? null,
			lines: order.lines.map((line) => {
				const progress = lineProgress(
					line.quantity,
					partsOf(line.shipmentLines),
				);
				return {
					id: line.id,
					productId: line.productId,
					sku: line.product.sku,
					productName: line.product.name,
					quantity: line.quantity,
					unitCostCents: line.unitCostUsd.times(100).toNumber(),
					dealId: line.dealId,
					dealName: line.deal?.name ?? null,
					shipped: progress.shipped,
					received: progress.received,
					remaining: progress.remaining,
				};
			}),
			shipments: order.shipments.map((shipment) => {
				const steps = shipment.events.map((event) => ({
					id: event.id,
					stage: event.stage,
					kind: event.stage.kind,
					occurredAt: event.occurredAt,
				}));
				return {
					id: shipment.id,
					reference: shipment.reference,
					trackingNumber: shipment.trackingNumber,
					stage: shipment.stage,
					stageChangedAt: isoDay(shipment.stageChangedAt),
					lines: shipment.lines.map((line) => ({
						orderLineId: line.orderLineId,
						sku: line.orderLine.product.sku,
						productName: line.orderLine.product.name,
						quantity: line.quantity,
					})),
					events: withLeadTimes(steps, startOfToday).map((step) => ({
						id: step.id,
						stage: step.stage,
						occurredAt: isoDay(step.occurredAt),
						days: step.days,
						running: step.running,
					})),
					orderToReceivedDays: receivedAfterDays(order.orderedAt, steps),
				};
			}),
			stages,
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ImportOrderCreateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const orderedAt = this.pastDay(input.orderedAt, now);

		const id = await this.withNumber(input.number, () =>
			this.db.$transaction(async (tx) => {
				await this.assertReferences(
					tx,
					input.lines.map((line) => line.productId),
					input.lines.flatMap((line) =>
						line.dealId === null ? [] : [line.dealId],
					),
				);
				const created = await tx.purchaseOrder.create({
					data: {
						number: input.number,
						supplierName: input.supplierName,
						orderedAt,
						notes: blankToNull(input.notes),
						lines: { create: input.lines.map(lineData) },
					},
					select: { id: true },
				});
				return created.id;
			}),
		);

		return this.detail(actingUserId, id, now);
	}

	async update(
		actingUserId: string,
		input: ImportOrderUpdateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const orderedAt = this.pastDay(input.orderedAt, now);

		await this.withNumber(input.number, () =>
			this.db.$transaction(async (tx) => {
				await this.lockOpenOrder(tx, input.id);
				const existing = await tx.purchaseOrderLine.findMany({
					where: { orderId: input.id },
					select: {
						id: true,
						productId: true,
						dealId: true,
						product: { select: { sku: true } },
						shipmentLines: { select: SHIPPED_SELECT },
					},
				});
				const current = new Map(existing.map((line) => [line.id, line]));
				const kept = new Set<string>();

				for (const line of input.lines) {
					if (line.id === undefined) continue;
					const before = current.get(line.id);
					if (!before) {
						throw new BadRequestException(
							"Una línea no pertenece a esta orden.",
						);
					}
					if (kept.has(line.id)) {
						throw new BadRequestException("Una línea aparece dos veces.");
					}
					kept.add(line.id);
					if (before.shipmentLines.length === 0) continue;
					if (before.productId !== line.productId) {
						throw new ConflictException(
							`La línea de ${before.product.sku} ya tiene envíos. No se puede cambiar el producto.`,
						);
					}
					const { shipped } = lineProgress(
						line.quantity,
						partsOf(before.shipmentLines),
					);
					if (line.quantity < shipped) {
						throw new ConflictException(
							`La línea de ${before.product.sku} ya tiene ${shipped} unidades enviadas. La cantidad no puede ser menor.`,
						);
					}
				}
				for (const line of existing) {
					if (!kept.has(line.id) && line.shipmentLines.length > 0) {
						throw new ConflictException(
							`La línea de ${line.product.sku} ya tiene envíos. No se puede quitar.`,
						);
					}
				}

				await this.assertReferences(
					tx,
					input.lines
						.filter(
							(line) =>
								line.id === undefined ||
								current.get(line.id)?.productId !== line.productId,
						)
						.map((line) => line.productId),
					input.lines.flatMap((line) =>
						line.dealId !== null &&
						(line.id === undefined ||
							current.get(line.id)?.dealId !== line.dealId)
							? [line.dealId]
							: [],
					),
				);

				const first = await tx.shipmentStageEvent.findFirst({
					where: { shipment: { orderId: input.id } },
					orderBy: { occurredAt: "asc" },
					select: { occurredAt: true },
				});
				if (first && orderedAt > first.occurredAt) {
					throw new BadRequestException(
						`La fecha de la orden no puede ser posterior al ${isoDay(first.occurredAt)}, la del primer envío.`,
					);
				}

				await tx.purchaseOrderLine.deleteMany({
					where: { orderId: input.id, id: { notIn: [...kept] } },
				});
				for (const line of input.lines) {
					if (line.id === undefined) continue;
					await tx.purchaseOrderLine.update({
						where: { id: line.id },
						data: lineData(line),
					});
				}
				const added = input.lines.filter((line) => line.id === undefined);
				if (added.length > 0) {
					await tx.purchaseOrderLine.createMany({
						data: added.map((line) => ({
							orderId: input.id,
							...lineData(line),
						})),
					});
				}
				await tx.purchaseOrder.update({
					where: { id: input.id },
					data: {
						number: input.number,
						supplierName: input.supplierName,
						orderedAt,
						notes: blankToNull(input.notes),
					},
				});
			}),
		);

		return this.detail(actingUserId, input.id, now);
	}

	async archive(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		return this.setArchived(actingUserId, id, new Date(), now);
	}

	async restore(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		return this.setArchived(actingUserId, id, null, now);
	}

	async createShipment(
		actingUserId: string,
		input: ShipmentCreateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const occurredAt = input.occurredAt
			? this.pastDay(input.occurredAt, now)
			: taskDayBoundaries(now).startOfToday;
		const lineIds = input.lines.map((line) => line.orderLineId);
		if (new Set(lineIds).size !== lineIds.length) {
			throw new BadRequestException(
				"Cada línea de la orden va una sola vez en el envío.",
			);
		}

		await this.db.$transaction(async (tx) => {
			const order = await this.lockOpenOrder(tx, input.orderId);
			if (occurredAt < order.orderedAt) {
				throw new BadRequestException(
					`La fecha no puede ser anterior al ${isoDay(order.orderedAt)}, la fecha de la orden.`,
				);
			}
			const entry = await tx.importStage.findFirst({
				where: { isEntry: true, archivedAt: null },
				select: { key: true },
			});
			if (!entry) {
				throw new ConflictException("No hay una etapa de entrada activa.");
			}
			const lines = await tx.purchaseOrderLine.findMany({
				where: { orderId: input.orderId, id: { in: lineIds } },
				select: {
					id: true,
					quantity: true,
					product: { select: { sku: true } },
					shipmentLines: { select: SHIPPED_SELECT },
				},
			});
			const byId = new Map(lines.map((line) => [line.id, line]));

			for (const requested of input.lines) {
				const line = byId.get(requested.orderLineId);
				if (!line) {
					throw new BadRequestException("Una línea no pertenece a esta orden.");
				}
				const { remaining } = lineProgress(
					line.quantity,
					partsOf(line.shipmentLines),
				);
				if (requested.quantity > remaining) {
					throw new ConflictException(
						`La línea de ${line.product.sku} tiene ${remaining} unidades pendientes. El envío pide ${requested.quantity}.`,
					);
				}
			}

			await tx.shipment.create({
				data: {
					orderId: input.orderId,
					reference: blankToNull(input.reference),
					trackingNumber: blankToNull(input.trackingNumber),
					stageKey: entry.key,
					stageChangedAt: occurredAt,
					lines: {
						create: input.lines.map((line) => ({
							orderLineId: line.orderLineId,
							quantity: line.quantity,
						})),
					},
					events: {
						create: {
							stageKey: entry.key,
							occurredAt,
							actorId: actingUserId,
						},
					},
				},
			});
		});

		return this.detail(actingUserId, input.orderId, now);
	}

	async updateShipment(
		actingUserId: string,
		input: ShipmentUpdateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const shipment = await this.db.shipment.findUnique({
			where: { id: input.id },
			select: { orderId: true },
		});
		if (!shipment) {
			throw new NotFoundException("No existe un envío con ese id.");
		}
		await this.db.shipment.update({
			where: { id: input.id },
			data: {
				reference: blankToNull(input.reference),
				trackingNumber: blankToNull(input.trackingNumber),
			},
		});

		return this.detail(actingUserId, shipment.orderId, now);
	}

	async moveShipment(
		actingUserId: string,
		input: ShipmentMoveRequest,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const occurredOn =
			input.occurredAt ?? isoDay(taskDayBoundaries(now).startOfToday);

		const moved = await this.db.$transaction((tx) =>
			moveShipmentInTx(
				tx,
				{
					shipmentId: input.shipmentId,
					targetKey: input.targetKey,
					occurredOn,
					actorId: actingUserId,
				},
				now,
			),
		);
		const shipment = await this.db.shipment.findUniqueOrThrow({
			where: { id: moved.shipmentId },
			select: { orderId: true },
		});

		return this.detail(actingUserId, shipment.orderId, now);
	}

	private async setArchived(
		actingUserId: string,
		id: string,
		archivedAt: Date | null,
		now: Date,
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const { count } = await this.db.purchaseOrder.updateMany({
			where: { id },
			data: { archivedAt },
		});
		if (count === 0) {
			throw new NotFoundException("No existe una orden con ese id.");
		}

		return this.detail(actingUserId, id, now);
	}

	private buildWhere(
		input: ImportOrderListInput,
	): Prisma.PurchaseOrderWhereInput {
		const search = input.q.trim();
		return {
			AND: [
				archivedFilter(input.archived),
				search === ""
					? {}
					: {
							OR: [
								{ number: { contains: search, mode: "insensitive" } },
								{ supplierName: { contains: search, mode: "insensitive" } },
							],
						},
			],
		};
	}

	private async lockOpenOrder(
		tx: Prisma.TransactionClient,
		orderId: string,
	): Promise<LockedOrder> {
		const [order] = await tx.$queryRaw<LockedOrder[]>`
			SELECT id, "orderedAt", "archivedAt"
			FROM purchase_order
			WHERE id = ${orderId}
			FOR UPDATE
		`;
		if (!order) {
			throw new NotFoundException("No existe una orden con ese id.");
		}
		if (order.archivedAt) {
			throw new ConflictException(
				"La orden está archivada. Restáurala antes de cambiarla.",
			);
		}
		return order;
	}

	private async assertReferences(
		tx: Prisma.TransactionClient,
		productIds: string[],
		dealIds: string[],
	): Promise<void> {
		const products = [...new Set(productIds)];
		const deals = [...new Set(dealIds)];
		if (products.length > 0) {
			const found = await tx.product.count({
				where: { id: { in: products }, archivedAt: null },
			});
			if (found !== products.length) {
				throw new BadRequestException(
					"Un producto de la orden no existe o está archivado.",
				);
			}
		}
		if (deals.length > 0) {
			const found = await tx.deal.count({
				where: {
					AND: [{ id: { in: deals }, archivedAt: null }, OPEN_STAGE_FILTER],
				},
			});
			if (found !== deals.length) {
				throw new BadRequestException(
					"Una oportunidad de la orden no existe o ya no está abierta.",
				);
			}
		}
	}

	private pastDay(day: string, now: Date): Date {
		const date = taskDueDay(day);
		if (date >= taskDayBoundaries(now).startOfTomorrow) {
			throw new BadRequestException("La fecha no puede ser posterior a hoy.");
		}
		return date;
	}

	private async withNumber<Result>(
		number: string,
		work: () => Promise<Result>,
	): Promise<Result> {
		try {
			return await work();
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ConflictException(
					`Ya existe una orden con el número ${number}.`,
				);
			}
			throw error;
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar las órdenes de compra.",
			);
		}
	}
}
