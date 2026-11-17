import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { ImportStageKind, PipelineStageKind } from "@crm/db/enums";
import { IMPORT_ORDER } from "@crm/db/import-order";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import {
	type ImportOrderCreateInput,
	type ImportOrderDetail,
	type ImportOrderListInput,
	type ImportOrderUpdateInput,
	importOrderCreateInput,
	importOrderDetailOutput,
	importOrderListInput,
	importOrderListOutput,
	importOrderOptionsOutput,
	type ShipmentCreateInput,
	type ShipmentMoveRequest,
	type ShipmentSplitInput,
	type ShipmentUpdateInput,
	shipmentSplitInput,
} from "../src/import-orders/import-orders.contracts";
import { ImportOrdersService } from "../src/import-orders/import-orders.service";
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
const adminId = `io-admin-${suffix}`;
const memberId = `io-member-${suffix}`;
const prefix = `IO${suffix}`;
const NOW = new Date("2026-03-01T15:00:00.000Z");
const TODAY = "2026-03-01";
const ORDER_DAY = "2026-01-05";

const service = new ImportOrdersService(db);
const detailOf = (value: ImportOrderDetail) =>
	expectOutput(importOrderDetailOutput, value);
const orders = {
	list: async (userId: string, input: ImportOrderListInput) =>
		expectOutput(importOrderListOutput, await service.list(userId, input)),
	options: async () =>
		expectOutput(importOrderOptionsOutput, await service.options()),
	detail: async (userId: string, id: string) =>
		detailOf(await service.detail(userId, id, NOW)),
	create: async (userId: string, input: ImportOrderCreateInput) =>
		detailOf(await service.create(userId, input, NOW)),
	update: async (userId: string, input: ImportOrderUpdateInput) =>
		detailOf(await service.update(userId, input, NOW)),
	archive: async (userId: string, id: string) =>
		detailOf(await service.archive(userId, id, NOW)),
	restore: async (userId: string, id: string) =>
		detailOf(await service.restore(userId, id, NOW)),
	createShipment: async (userId: string, input: ShipmentCreateInput) =>
		detailOf(await service.createShipment(userId, input, NOW)),
	updateShipment: async (userId: string, input: ShipmentUpdateInput) =>
		detailOf(await service.updateShipment(userId, input, NOW)),
	moveShipment: async (userId: string, input: ShipmentMoveRequest) =>
		detailOf(await service.moveShipment(userId, input, NOW)),
	splitShipments: async (userId: string, input: ShipmentSplitInput) =>
		detailOf(await service.splitShipments(userId, input, NOW)),
};

let mainProcess: TestProcess;
let otherProcess: TestProcess;
let closedProcess: TestProcess;
let entryKey: string;
let receivedKey: string;
let cancelledKey: string;
let openStageKey: string;
let wonStageKey: string;
let productId: string;
let otherProductId: string;
let archivedProductId: string;
let companyId: string;
let openDealId: string;
let wonDealId: string;

type DraftLine = { productId?: string; quantity: number; dealId?: string };

function orderInput(
	lines: DraftLine[],
	overrides: Partial<ImportOrderCreateInput> = {},
): ImportOrderCreateInput {
	return {
		supplierName: "Proveedor de prueba",
		orderedAt: ORDER_DAY,
		notes: "",
		processId: mainProcess.id,
		lines: lines.map((line) => ({
			productId: line.productId ?? productId,
			quantity: line.quantity,
			unitCostCents: 12_345,
			dealId: line.dealId ?? null,
		})),
		...overrides,
	};
}

function sequenceOf(number: string): number {
	return Number(number.split("-")[2]);
}

function orderWith(quantity: number) {
	return orders.create(adminId, orderInput([{ quantity }]));
}

function listFor(q: string, archived = false) {
	return importOrderListInput.parse({ q, archived });
}

function firstLine(order: ImportOrderDetail) {
	const [line] = order.lines;
	if (!line) throw new Error("The order has no line.");
	return line;
}

function lineFor(order: ImportOrderDetail, product: string) {
	const line = order.lines.find((item) => item.productId === product);
	if (!line) throw new Error(`The order has no line for ${product}.`);
	return line;
}

function lastShipment(order: ImportOrderDetail) {
	const shipment = order.shipments.at(-1);
	if (!shipment) throw new Error("The order has no shipment.");
	return shipment;
}

function ship(
	order: ImportOrderDetail,
	quantity: number,
	occurredAt = "2026-01-10",
) {
	return orders.createShipment(adminId, {
		orderId: order.id,
		reference: "",
		trackingNumber: "",
		occurredAt,
		lines: [{ orderLineId: firstLine(order).id, quantity }],
	});
}

function splitInput(
	order: ImportOrderDetail,
	perShipment: number,
	overrides: Partial<ShipmentSplitInput> = {},
): ShipmentSplitInput {
	return {
		orderId: order.id,
		orderLineId: firstLine(order).id,
		perShipment,
		reference: "",
		occurredAt: "2026-01-10",
		...overrides,
	};
}

function split(
	order: ImportOrderDetail,
	perShipment: number,
	overrides: Partial<ShipmentSplitInput> = {},
) {
	return orders.splitShipments(
		adminId,
		splitInput(order, perShipment, overrides),
	);
}

function quantitiesOf(order: ImportOrderDetail) {
	return order.shipments.map((shipment) => shipment.lines[0]?.quantity);
}

function headerOf(order: ImportOrderDetail) {
	return {
		id: order.id,
		number: order.number,
		supplierName: order.supplierName,
		orderedAt: order.orderedAt,
		notes: "",
		processId: order.process.id,
	};
}

function sameLines(order: ImportOrderDetail) {
	return order.lines.map((line) => ({
		id: line.id,
		productId: line.productId,
		quantity: line.quantity,
		unitCostCents: line.unitCostCents,
		dealId: line.dealId,
	}));
}

async function setArchived(id: string, archived: boolean) {
	await db.importProcess.update({
		where: { id },
		data: { archivedAt: archived ? new Date() : null },
	});
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{
				id: adminId,
				name: "Import Order Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Order Member",
				email: `${memberId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `m-${adminId}`,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: `m-${memberId}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	mainProcess = await createTestProcess(`Pedidos ${suffix}`);
	otherProcess = await createTestProcess(`Pedidos ajenos ${suffix}`);
	closedProcess = await createTestProcess(`Pedidos cerrados ${suffix}`);
	entryKey = mainProcess.entryKey;
	receivedKey = mainProcess.receivedKey;
	cancelledKey = mainProcess.cancelledKey;
	const [openStage, wonStage] = await Promise.all([
		db.pipelineStage.findFirstOrThrow({
			where: { kind: PipelineStageKind.OPEN, archivedAt: null },
			select: { key: true },
		}),
		db.pipelineStage.findFirstOrThrow({
			where: { kind: PipelineStageKind.WON, archivedAt: null },
			select: { key: true },
		}),
	]);
	openStageKey = openStage.key;
	wonStageKey = wonStage.key;

	const product = async (sku: string, name: string, archivedAt: Date | null) =>
		(
			await db.product.create({
				data: { sku, name, archivedAt },
				select: { id: true },
			})
		).id;
	productId = await product(`${prefix}-A`, "Equipo A", null);
	otherProductId = await product(`${prefix}-B`, "Equipo B", null);
	archivedProductId = await product(
		`${prefix}-Z`,
		"Equipo archivado",
		new Date(),
	);

	companyId = (
		await db.company.create({
			data: { name: `Empresa ${suffix}` },
			select: { id: true },
		})
	).id;
	const deal = async (name: string, stage: string) =>
		(
			await db.deal.create({
				data: { name, companyId, ownerId: adminId, stage },
				select: { id: true },
			})
		).id;
	openDealId = await deal(`Oportunidad abierta ${suffix}`, openStageKey);
	wonDealId = await deal(`Oportunidad ganada ${suffix}`, wonStageKey);
});

afterAll(async () => {
	const processIds = [mainProcess.id, otherProcess.id, closedProcess.id];
	await db.shipment.deleteMany({
		where: { order: { processId: { in: processIds } } },
	});
	await db.purchaseOrder.deleteMany({
		where: { processId: { in: processIds } },
	});
	await removeTestProcesses([
		mainProcess.id,
		otherProcess.id,
		closedProcess.id,
	]);
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("creating an order", () => {
	it("creates the order with its lines and nothing shipped", async () => {
		const order = await orders.create(
			adminId,
			orderInput([
				{ quantity: 10, dealId: openDealId },
				{ productId: otherProductId, quantity: 3 },
			]),
		);

		expect(order.orderedAt).toBe(ORDER_DAY);
		expect(order.shipments).toEqual([]);
		expect(order.canManage).toBe(true);
		expect(lineFor(order, productId)).toMatchObject({
			sku: `${prefix}-A`,
			productName: "Equipo A",
			quantity: 10,
			unitCostCents: 12_345,
			dealId: openDealId,
			dealName: `Oportunidad abierta ${suffix}`,
			shipped: 0,
			received: 0,
			remaining: 10,
		});
		expect(lineFor(order, otherProductId)).toMatchObject({
			quantity: 3,
			dealId: null,
			remaining: 3,
		});
	});

	it("generates the number from the year of the creation day", async () => {
		const order = await orders.create(adminId, orderInput([{ quantity: 1 }]));

		expect(order.number).toMatch(/^OC-2026-\d{4,}$/);
	});

	it("numbers consecutive orders one after the other", async () => {
		const first = await orderWith(1);
		const second = await orderWith(1);

		expect(sequenceOf(second.number)).toBe(sequenceOf(first.number) + 1);
	});

	it("restarts the sequence for another year", async () => {
		const first = await service.create(
			adminId,
			orderInput([{ quantity: 1 }]),
			new Date("2031-03-01T15:00:00.000Z"),
		);
		const second = await service.create(
			adminId,
			orderInput([{ quantity: 1 }]),
			new Date("2031-03-01T15:00:00.000Z"),
		);

		expect(first.number).toBe("OC-2031-0001");
		expect(second.number).toBe("OC-2031-0002");
	});

	it("gives two concurrent creates different numbers", async () => {
		const [first, second] = await Promise.all([orderWith(1), orderWith(1)]);

		expect(first.number).not.toBe(second.number);
	});

	it("does not take the number from the input", () => {
		const parsed = importOrderCreateInput.parse({
			...orderInput([{ quantity: 1 }]),
			number: "X-1",
		});

		expect("number" in parsed).toBe(false);
	});

	it("refuses an order day after today", async () => {
		await expect(
			orders.create(
				adminId,
				orderInput([{ quantity: 1 }], { orderedAt: "2026-03-02" }),
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived product and a deal that is not open", async () => {
		await expect(
			orders.create(
				adminId,
				orderInput([{ productId: archivedProductId, quantity: 1 }]),
			),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			orders.create(adminId, orderInput([{ quantity: 1, dealId: wonDealId }])),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("validates the order at the boundary", () => {
		const valid = orderInput([{ quantity: 1 }]);
		const [line] = valid.lines;
		if (!line) throw new Error("No line.");

		expect(importOrderCreateInput.safeParse(valid).success).toBe(true);
		expect(
			importOrderCreateInput.safeParse({ ...valid, lines: [] }).success,
		).toBe(false);
		expect(
			importOrderCreateInput.safeParse({ ...valid, orderedAt: "2026-13-01" })
				.success,
		).toBe(false);
		for (const bad of [
			{ quantity: 0 },
			{ quantity: 1.5 },
			{ unitCostCents: -1 },
			{ unitCostCents: 1.5 },
		]) {
			expect(
				importOrderCreateInput.safeParse({
					...valid,
					lines: [{ ...line, ...bad }],
				}).success,
			).toBe(false);
		}
	});
});

describe("listing orders", () => {
	it("lists ordered, shipped and received units and hides archived orders", async () => {
		const order = await orderWith(10);
		const first = lastShipment(await ship(order, 4));
		await orders.moveShipment(adminId, {
			shipmentId: first.id,
			targetKey: receivedKey,
			occurredAt: "2026-02-01",
		});
		await ship(order, 3, "2026-02-02");

		const active = await orders.list(adminId, listFor(order.number));
		expect(active.total).toBe(1);
		expect(active.rows).toEqual([
			expect.objectContaining({
				id: order.id,
				orderedAt: ORDER_DAY,
				lineCount: 1,
				orderedUnits: 10,
				shippedUnits: 7,
				receivedUnits: 4,
				shipmentCount: 2,
				archivedAt: null,
			}),
		]);

		await orders.archive(adminId, order.id);
		expect((await orders.list(adminId, listFor(order.number))).total).toBe(0);
		expect(
			(await orders.list(adminId, listFor(order.number, true))).rows.map(
				(row) => row.id,
			),
		).toEqual([order.id]);
	});
});

describe("creating a shipment", () => {
	it("writes the first event in the entry stage on the chosen day", async () => {
		const order = await orderWith(10);

		const after = await ship(order, 4, "2026-01-12");

		const shipment = lastShipment(after);
		expect(shipment.stage.key).toBe(entryKey);
		expect(shipment.stageChangedAt).toBe("2026-01-12");
		expect(
			shipment.events.map((event) => [event.stage.key, event.occurredAt]),
		).toEqual([[entryKey, "2026-01-12"]]);
		expect(shipment.lines).toEqual([
			{
				orderLineId: firstLine(order).id,
				sku: `${prefix}-A`,
				productName: "Equipo A",
				quantity: 4,
			},
		]);
		expect(firstLine(after)).toMatchObject({ shipped: 4, remaining: 6 });
		const event = await db.shipmentStageEvent.findFirstOrThrow({
			where: { shipmentId: shipment.id },
			select: { actorId: true },
		});
		expect(event.actorId).toBe(adminId);
	});

	it("dates the first event today when no day is given", async () => {
		const order = await orderWith(1);

		const after = await orders.createShipment(adminId, {
			orderId: order.id,
			reference: "",
			trackingNumber: "",
			lines: [{ orderLineId: firstLine(order).id, quantity: 1 }],
		});

		const shipment = lastShipment(after);
		expect(shipment.stageChangedAt).toBe(TODAY);
		expect(shipment.events.map((event) => [event.days, event.running])).toEqual(
			[[0, true]],
		);
	});

	it("ships in batches and refuses more than what is left", async () => {
		const order = await orderWith(10);
		await ship(order, 4);
		await ship(order, 4);

		const third = await ship(order, 2);

		expect(firstLine(third)).toMatchObject({ shipped: 10, remaining: 0 });
		await expect(ship(order, 1)).rejects.toBeInstanceOf(ConflictException);
		await expect(ship(order, 1)).rejects.toMatchObject({
			message: expect.stringContaining("0 unidades pendientes"),
		});
	});

	it("refuses a day before the order, a day after today and an archived order", async () => {
		const order = await orderWith(2);

		await expect(ship(order, 1, "2026-01-04")).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await expect(ship(order, 1, "2026-03-02")).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await orders.archive(adminId, order.id);
		await expect(ship(order, 1)).rejects.toBeInstanceOf(ConflictException);
		expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
	});

	it("refuses a line of another order and a repeated line", async () => {
		const order = await orderWith(5);
		const other = await orderWith(5);

		await expect(
			orders.createShipment(adminId, {
				orderId: order.id,
				reference: "",
				trackingNumber: "",
				lines: [{ orderLineId: firstLine(other).id, quantity: 1 }],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			orders.createShipment(adminId, {
				orderId: order.id,
				reference: "",
				trackingNumber: "",
				lines: [
					{ orderLineId: firstLine(order).id, quantity: 1 },
					{ orderLineId: firstLine(order).id, quantity: 1 },
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("lets exactly one of two writers take the last units", async () => {
		const order = await orderWith(10);
		const line = firstLine(order);
		const request = (reference: string): ShipmentCreateInput => ({
			orderId: order.id,
			reference,
			trackingNumber: "",
			occurredAt: "2026-01-10",
			lines: [{ orderLineId: line.id, quantity: 6 }],
		});

		const results = await Promise.allSettled([
			service.createShipment(adminId, request("A"), NOW),
			service.createShipment(adminId, request("B"), NOW),
		]);

		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const reasons = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		expect(fulfilled.length).toBe(1);
		expect(reasons.length).toBe(1);
		expect(reasons[0]).toBeInstanceOf(ConflictException);
		const shipped = await db.shipmentLine.aggregate({
			where: { orderLineId: line.id },
			_sum: { quantity: true },
		});
		expect(shipped._sum.quantity).toBe(6);
	});

	it("frees the units of a cancelled shipment", async () => {
		const order = await orderWith(10);
		const wrong = lastShipment(await ship(order, 10));
		await orders.moveShipment(adminId, {
			shipmentId: wrong.id,
			targetKey: cancelledKey,
			occurredAt: "2026-01-11",
		});

		const again = await ship(order, 10, "2026-01-12");

		expect(firstLine(again)).toMatchObject({
			shipped: 10,
			received: 0,
			remaining: 0,
		});
		expect(again.shipments.length).toBe(2);
	});
});

describe("splitting a line into shipments", () => {
	it("creates one shipment per unit, each in the entry stage with its own event", async () => {
		const order = await orderWith(10);

		const after = await split(order, 1, {
			reference: "LOTE-7",
			occurredAt: "2026-01-12",
		});

		expect(after.shipments.length).toBe(10);
		for (const shipment of after.shipments) {
			expect(shipment).toMatchObject({
				reference: "LOTE-7",
				trackingNumber: null,
				stageChangedAt: "2026-01-12",
				stage: { key: entryKey },
			});
			expect(shipment.lines.map((line) => line.quantity)).toEqual([1]);
			expect(
				shipment.events.map((event) => [event.stage.key, event.occurredAt]),
			).toEqual([[entryKey, "2026-01-12"]]);
		}
		expect(firstLine(after)).toMatchObject({ shipped: 10, remaining: 0 });
		const events = await db.shipmentStageEvent.findMany({
			where: { shipment: { orderId: order.id } },
			select: { actorId: true },
		});
		expect(events.map((event) => event.actorId)).toEqual(
			Array.from({ length: 10 }, () => adminId),
		);
	});

	it("gives the rest to the last shipment", async () => {
		const order = await orderWith(10);

		const after = await split(order, 3);

		expect(quantitiesOf(after)).toEqual([3, 3, 3, 1]);
	});

	it("splits only what is left and makes one shipment when the size passes it", async () => {
		const order = await orderWith(10);
		await ship(order, 6);

		const after = await split(order, 5);

		expect(quantitiesOf(after)).toEqual([6, 4]);
		expect(firstLine(after)).toMatchObject({ shipped: 10, remaining: 0 });
		await expect(split(order, 1)).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses more shipments than the limit and writes nothing", async () => {
		const order = await orderWith(IMPORT_ORDER.maxSplitShipments + 1);

		await expect(split(order, 1)).rejects.toBeInstanceOf(BadRequestException);
		await expect(split(order, 1)).rejects.toMatchObject({
			message: expect.stringContaining(
				`El máximo es ${IMPORT_ORDER.maxSplitShipments}`,
			),
		});
		expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
	});

	it("splits the units that a cancelled shipment freed", async () => {
		const order = await orderWith(4);
		const wrong = lastShipment(await ship(order, 4));
		await orders.moveShipment(adminId, {
			shipmentId: wrong.id,
			targetKey: cancelledKey,
			occurredAt: "2026-01-11",
		});

		const after = await split(order, 1, { occurredAt: "2026-01-12" });

		expect(after.shipments.length).toBe(5);
		expect(firstLine(after)).toMatchObject({ shipped: 4, remaining: 0 });
	});

	it("refuses a day out of range, a line of another order and an archived order", async () => {
		const order = await orderWith(3);
		const other = await orderWith(3);

		await expect(
			split(order, 1, { occurredAt: "2026-01-04" }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			split(order, 1, { occurredAt: "2026-03-02" }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			split(order, 1, { orderLineId: firstLine(other).id }),
		).rejects.toBeInstanceOf(BadRequestException);
		await orders.archive(adminId, order.id);
		await expect(split(order, 1)).rejects.toBeInstanceOf(ConflictException);
		expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
	});

	it("never ships more than ordered when a split and a shipment race", async () => {
		const order = await orderWith(10);
		const line = firstLine(order);

		const results = await Promise.allSettled([
			service.splitShipments(adminId, splitInput(order, 1), NOW),
			service.createShipment(
				adminId,
				{
					orderId: order.id,
					reference: "",
					trackingNumber: "",
					occurredAt: "2026-01-10",
					lines: [{ orderLineId: line.id, quantity: 6 }],
				},
				NOW,
			),
		]);

		const [splitResult, shipResult] = results;
		expect(splitResult?.status).toBe("fulfilled");
		for (const result of results) {
			if (result.status === "rejected") {
				expect(result.reason).toBeInstanceOf(ConflictException);
			}
		}
		const shipped = await db.shipmentLine.aggregate({
			where: { orderLineId: line.id },
			_sum: { quantity: true },
		});
		expect(shipped._sum.quantity).toBe(10);
		const shipments = await db.shipment.count({ where: { orderId: order.id } });
		expect([
			{ ship: "fulfilled", shipments: 5 },
			{ ship: "rejected", shipments: 10 },
		]).toContainEqual({ ship: shipResult?.status, shipments });
	});

	it("validates the split at the boundary", () => {
		const valid = {
			orderId: "o-1",
			orderLineId: "l-1",
			perShipment: 1,
			reference: "",
		};

		expect(shipmentSplitInput.safeParse(valid).success).toBe(true);
		expect(
			shipmentSplitInput.safeParse({ ...valid, perShipment: 0 }).success,
		).toBe(false);
		expect(
			shipmentSplitInput.safeParse({ ...valid, perShipment: 1.5 }).success,
		).toBe(false);
		expect(
			shipmentSplitInput.safeParse({
				...valid,
				reference: "x".repeat(IMPORT_ORDER.referenceMaxLength + 1),
			}).success,
		).toBe(false);
	});
});

describe("moving a shipment", () => {
	it("moves on the chosen day and measures each stage", async () => {
		const order = await orderWith(5);
		const shipment = lastShipment(await ship(order, 5, "2026-01-10"));

		const moved = await orders.moveShipment(adminId, {
			shipmentId: shipment.id,
			targetKey: receivedKey,
			occurredAt: "2026-02-01",
		});

		const after = lastShipment(moved);
		expect(after.stage.kind).toBe(ImportStageKind.RECEIVED);
		expect(
			after.events.map((event) => [
				event.stage.key,
				event.occurredAt,
				event.days,
				event.running,
			]),
		).toEqual([
			[entryKey, "2026-01-10", 22, false],
			[receivedKey, "2026-02-01", null, false],
		]);
		expect(after.orderToReceivedDays).toBe(27);
		expect(firstLine(moved)).toMatchObject({ shipped: 5, received: 5 });
	});

	it("counts the open stage until today", async () => {
		const order = await orderWith(1);

		const shipment = lastShipment(await ship(order, 1, "2026-02-20"));

		expect(
			shipment.events.map((event) => [
				event.stage.key,
				event.occurredAt,
				event.days,
				event.running,
			]),
		).toEqual([[entryKey, "2026-02-20", 9, true]]);
		expect(shipment.orderToReceivedDays).toBeNull();
	});

	it("moves on today when no day is given and refuses a move after reception", async () => {
		const order = await orderWith(1);
		const shipment = lastShipment(await ship(order, 1));

		const moved = await orders.moveShipment(adminId, {
			shipmentId: shipment.id,
			targetKey: receivedKey,
		});

		expect(lastShipment(moved).stageChangedAt).toBe(TODAY);
		await expect(
			orders.moveShipment(adminId, {
				shipmentId: shipment.id,
				targetKey: cancelledKey,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("reports a missing shipment as not found", async () => {
		await expect(
			orders.moveShipment(adminId, {
				shipmentId: `no-such-shipment-${suffix}`,
				targetKey: receivedKey,
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});

describe("editing an order", () => {
	it("changes the header and replaces the lines that have no shipments", async () => {
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 4 }, { productId: otherProductId, quantity: 2 }]),
		);
		const kept = lineFor(order, productId);
		const dropped = lineFor(order, otherProductId);

		const updated = await orders.update(adminId, {
			...headerOf(order),
			supplierName: "Otro proveedor",
			orderedAt: "2026-01-06",
			notes: "Urgente",
			lines: [
				{
					id: kept.id,
					productId,
					quantity: 6,
					unitCostCents: 500,
					dealId: openDealId,
				},
				{
					productId: otherProductId,
					quantity: 1,
					unitCostCents: 0,
					dealId: null,
				},
			],
		});

		expect(updated).toMatchObject({
			supplierName: "Otro proveedor",
			orderedAt: "2026-01-06",
			notes: "Urgente",
		});
		expect(updated.lines.length).toBe(2);
		expect(lineFor(updated, productId)).toMatchObject({
			id: kept.id,
			quantity: 6,
			unitCostCents: 500,
			dealId: openDealId,
		});
		expect(lineFor(updated, otherProductId).quantity).toBe(1);
		expect(lineFor(updated, otherProductId).id).not.toBe(dropped.id);
	});

	it("refuses to lower a line below what shipped, change its product or remove it", async () => {
		const order = await orders.create(
			adminId,
			orderInput([
				{ quantity: 10 },
				{ productId: otherProductId, quantity: 2 },
			]),
		);
		const sent = lineFor(order, productId);
		const spare = lineFor(order, otherProductId);
		await orders.createShipment(adminId, {
			orderId: order.id,
			reference: "",
			trackingNumber: "",
			occurredAt: "2026-01-10",
			lines: [{ orderLineId: sent.id, quantity: 6 }],
		});
		const edit = (lines: ImportOrderUpdateInput["lines"]) =>
			orders.update(adminId, { ...headerOf(order), lines });
		const keepSpare = {
			id: spare.id,
			productId: otherProductId,
			quantity: 2,
			unitCostCents: 100,
			dealId: null,
		};

		await expect(
			edit([
				{
					id: sent.id,
					productId,
					quantity: 5,
					unitCostCents: 100,
					dealId: null,
				},
				keepSpare,
			]),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			edit([
				{
					id: sent.id,
					productId: otherProductId,
					quantity: 10,
					unitCostCents: 100,
					dealId: null,
				},
				keepSpare,
			]),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(edit([keepSpare])).rejects.toBeInstanceOf(ConflictException);

		const updated = await edit([
			{ id: sent.id, productId, quantity: 6, unitCostCents: 100, dealId: null },
		]);

		expect(
			updated.lines.map((line) => [line.id, line.quantity, line.remaining]),
		).toEqual([[sent.id, 6, 0]]);
	});

	it("refuses an order day after the first shipment", async () => {
		const order = await orderWith(3);
		await ship(order, 1, "2026-01-10");

		await expect(
			orders.update(adminId, {
				...headerOf(order),
				orderedAt: "2026-01-11",
				lines: [
					{
						id: firstLine(order).id,
						productId,
						quantity: 3,
						unitCostCents: 12_345,
						dealId: null,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("keeps a deal that closed after it was linked", async () => {
		const closing = await db.deal.create({
			data: {
				name: `Se cierra ${suffix}`,
				companyId,
				ownerId: adminId,
				stage: openStageKey,
			},
			select: { id: true },
		});
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 2, dealId: closing.id }]),
		);
		await db.deal.update({
			where: { id: closing.id },
			data: { stage: wonStageKey },
		});
		const line = firstLine(order);

		const kept = await orders.update(adminId, {
			...headerOf(order),
			lines: [
				{
					id: line.id,
					productId,
					quantity: 3,
					unitCostCents: 100,
					dealId: closing.id,
				},
			],
		});

		expect(firstLine(kept).dealId).toBe(closing.id);
		await expect(
			orders.update(adminId, {
				...headerOf(order),
				lines: [
					{
						id: line.id,
						productId,
						quantity: 3,
						unitCostCents: 100,
						dealId: wonDealId,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses to change an archived order and restores it", async () => {
		const order = await orderWith(1);
		const change = {
			...headerOf(order),
			supplierName: "Cambio",
			lines: [
				{
					id: firstLine(order).id,
					productId,
					quantity: 1,
					unitCostCents: 100,
					dealId: null,
				},
			],
		};

		const archived = await orders.archive(adminId, order.id);

		expect(archived.archivedAt).not.toBeNull();
		await expect(orders.update(adminId, change)).rejects.toBeInstanceOf(
			ConflictException,
		);
		const restored = await orders.restore(adminId, order.id);
		expect(restored.archivedAt).toBeNull();
		expect((await orders.update(adminId, change)).supplierName).toBe("Cambio");
	});
});

describe("shipment details", () => {
	it("saves the reference and the tracking number", async () => {
		const order = await orderWith(1);
		const shipment = lastShipment(await ship(order, 1));

		const saved = await orders.updateShipment(adminId, {
			id: shipment.id,
			reference: "BL-1",
			trackingNumber: " TRK-9 ",
		});

		expect(lastShipment(saved)).toMatchObject({
			reference: "BL-1",
			trackingNumber: "TRK-9",
		});
		const cleared = await orders.updateShipment(adminId, {
			id: shipment.id,
			reference: "",
			trackingNumber: "",
		});
		expect(lastShipment(cleared)).toMatchObject({
			reference: null,
			trackingNumber: null,
		});
	});
});

describe("the process of an order", () => {
	it("shows the process and only its active stages", async () => {
		const order = await orderWith(1);
		const own = await db.importStage.findMany({
			where: { processId: mainProcess.id, archivedAt: null },
			orderBy: { position: "asc" },
			select: { key: true },
		});

		expect(order.process).toEqual({
			id: mainProcess.id,
			name: mainProcess.name,
			archived: false,
		});
		expect(order.stages.map((stage) => stage.key)).toEqual(
			own.map((stage) => stage.key),
		);
	});

	it("starts a shipment in the entry stage of the order's process", async () => {
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 2 }], { processId: otherProcess.id }),
		);

		const shipment = lastShipment(await ship(order, 1));

		expect(shipment.stage.key).toBe(otherProcess.entryKey);
	});

	it("changes the process until the first shipment", async () => {
		const order = await orderWith(2);

		const moved = await orders.update(adminId, {
			...headerOf(order),
			processId: otherProcess.id,
			lines: sameLines(order),
		});
		expect(moved.process.id).toBe(otherProcess.id);
		await ship(moved, 1);

		await expect(
			orders.update(adminId, {
				...headerOf(moved),
				processId: mainProcess.id,
				lines: sameLines(moved),
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await orders.detail(adminId, order.id)).process.id).toBe(
			otherProcess.id,
		);
	});

	it("refuses a move to a stage of another process", async () => {
		const order = await orderWith(1);
		const shipment = lastShipment(await ship(order, 1));

		await expect(
			orders.moveShipment(adminId, {
				shipmentId: shipment.id,
				targetKey: otherProcess.receivedKey,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived process for a new order and a new shipment", async () => {
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 2 }], { processId: closedProcess.id }),
		);
		await setArchived(closedProcess.id, true);
		try {
			await expect(
				orders.create(
					adminId,
					orderInput([{ quantity: 1 }], { processId: closedProcess.id }),
				),
			).rejects.toBeInstanceOf(ConflictException);
			await expect(ship(order, 1)).rejects.toBeInstanceOf(ConflictException);
			const kept = await orders.update(adminId, {
				...headerOf(order),
				notes: "Sigue en su proceso",
				lines: sameLines(order),
			});
			expect(kept.process).toEqual({
				id: closedProcess.id,
				name: closedProcess.name,
				archived: true,
			});
		} finally {
			await setArchived(closedProcess.id, false);
		}
	});

	it("refuses a process that does not exist", async () => {
		await expect(
			orders.create(
				adminId,
				orderInput([{ quantity: 1 }], {
					processId: `no-such-process-${suffix}`,
				}),
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});

describe("picker options", () => {
	it("offers active processes only, each with its active stages in order", async () => {
		await setArchived(closedProcess.id, true);
		try {
			const options = await orders.options();

			expect(options.processes).toContainEqual({
				id: mainProcess.id,
				name: mainProcess.name,
				countryCode: null,
				stages: [
					{
						key: mainProcess.entryKey,
						name: "Pedido",
						kind: ImportStageKind.IN_PROGRESS,
					},
					{
						key: mainProcess.receivedKey,
						name: "Recibido",
						kind: ImportStageKind.RECEIVED,
					},
					{
						key: mainProcess.cancelledKey,
						name: "Cancelado",
						kind: ImportStageKind.CANCELLED,
					},
				],
			});
			expect(options.processes.map((item) => item.id)).not.toContain(
				closedProcess.id,
			);
		} finally {
			await setArchived(closedProcess.id, false);
		}
	});

	it("offers active products and open deals only", async () => {
		const options = await orders.options();

		const products = options.products.map((product) => product.id);
		expect(products).toContain(productId);
		expect(products).not.toContain(archivedProductId);
		expect(options.deals).toContainEqual({
			id: openDealId,
			name: `Oportunidad abierta ${suffix}`,
			companyName: `Empresa ${suffix}`,
		});
		expect(options.deals.map((deal) => deal.id)).not.toContain(wonDealId);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const order = await orderWith(2);
		const shipment = lastShipment(await ship(order, 1));

		expect((await orders.detail(memberId, order.id)).canManage).toBe(false);
		expect((await orders.list(memberId, listFor(order.number))).canManage).toBe(
			false,
		);
		const writes = [
			() => service.create(memberId, orderInput([{ quantity: 1 }]), NOW),
			() =>
				service.update(
					memberId,
					{
						...headerOf(order),
						lines: [
							{
								id: firstLine(order).id,
								productId,
								quantity: 2,
								unitCostCents: 100,
								dealId: null,
							},
						],
					},
					NOW,
				),
			() => service.archive(memberId, order.id, NOW),
			() => service.restore(memberId, order.id, NOW),
			() =>
				service.createShipment(
					memberId,
					{
						orderId: order.id,
						reference: "",
						trackingNumber: "",
						lines: [{ orderLineId: firstLine(order).id, quantity: 1 }],
					},
					NOW,
				),
			() =>
				service.splitShipments(
					memberId,
					{
						orderId: order.id,
						orderLineId: firstLine(order).id,
						perShipment: 1,
						reference: "",
					},
					NOW,
				),
			() =>
				service.updateShipment(
					memberId,
					{ id: shipment.id, reference: "X", trackingNumber: "" },
					NOW,
				),
			() =>
				service.moveShipment(
					memberId,
					{ shipmentId: shipment.id, targetKey: receivedKey },
					NOW,
				),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
