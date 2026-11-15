import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_STAGE, isFixedImportStage } from "@crm/db/import-stage";
import { sameKeySet, uniqueStageKey } from "@crm/db/pipeline-stage";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
} from "../activities/task-due-date";
import { InjectDatabase } from "../database/database.constants";
import type {
	ImportStageArchiveInput,
	ImportStageCreateInput,
	ImportStageReorderInput,
	ImportStageSettings,
	ImportStageUpdateInput,
} from "./import-stages.contracts";
import { moveShipmentInTx } from "./shipment-moves";

type StageRecord = Prisma.ImportStageGetPayload<object>;

type PositionedStage = {
	position: number;
	isEntry: boolean;
	kind: ImportStageKind;
};

function nextIntermediatePosition(rows: PositionedStage[]): number {
	const last = rows
		.filter((row) => !isFixedImportStage(row))
		.reduce(
			(max, row) => Math.max(max, row.position),
			IMPORT_STAGE.firstIntermediatePosition - 1,
		);
	return last + 1;
}

@Injectable()
export class ImportStagesService {
	private readonly logger = new Logger(ImportStagesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async settings(actingUserId: string): Promise<ImportStageSettings> {
		const [rows, counts, role] = await Promise.all([
			this.db.importStage.findMany({ orderBy: { position: "asc" } }),
			this.db.shipment.groupBy({ by: ["stageKey"], _count: { _all: true } }),
			workspaceRoleOf(actingUserId),
		]);
		const perStage = new Map(
			counts.map((row) => [row.stageKey, row._count._all]),
		);

		return {
			stages: rows.map((row) => ({
				key: row.key,
				name: row.name,
				kind: row.kind,
				tone: row.tone,
				position: row.position,
				isEntry: row.isEntry,
				archived: row.archivedAt !== null,
				shipmentCount: perStage.get(row.key) ?? 0,
			})),
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ImportStageCreateInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.assertNameFree(tx, input.name);
			const all = await tx.importStage.findMany({
				select: { key: true, position: true, isEntry: true, kind: true },
			});
			const key = uniqueStageKey(
				input.name,
				new Set(all.map((row) => row.key)),
			);
			if (!key) {
				throw new BadRequestException(
					"El nombre necesita al menos una letra o un número.",
				);
			}
			await tx.importStage.create({
				data: {
					key,
					name: input.name,
					kind: ImportStageKind.IN_PROGRESS,
					tone: input.tone ?? IMPORT_STAGE.defaultTone,
					position: nextIntermediatePosition(all),
				},
			});
		});

		return this.settings(actingUserId);
	}

	async update(
		actingUserId: string,
		input: ImportStageUpdateInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			await this.assertNameFree(tx, input.name, stage.key);
			await tx.importStage.update({
				where: { key: stage.key },
				data: { name: input.name, tone: input.tone },
			});
		});

		return this.settings(actingUserId);
	}

	async reorder(
		actingUserId: string,
		input: ImportStageReorderInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT 1 FROM import_stage FOR UPDATE`;
			const active = await tx.importStage.findMany({
				where: { archivedAt: null },
			});
			const current = active
				.filter((row) => !isFixedImportStage(row))
				.map((row) => row.key);

			if (!sameKeySet(input.keys, current)) {
				throw new ConflictException(
					"Las etapas cambiaron mientras las ordenabas. Recarga e intenta de nuevo.",
				);
			}

			for (const [index, key] of input.keys.entries()) {
				await tx.importStage.update({
					where: { key },
					data: { position: IMPORT_STAGE.firstIntermediatePosition + index },
				});
			}
		});

		return this.settings(actingUserId);
	}

	async archive(
		actingUserId: string,
		input: ImportStageArchiveInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);
		const today = serializeTaskDueDay(
			taskDayBoundaries(new Date()).startOfToday,
		);
		const occurredOn = input.occurredAt ?? today;

		const moved = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			if (isFixedImportStage(stage)) {
				throw new BadRequestException("Una etapa fija no se puede archivar.");
			}
			if (stage.archivedAt) {
				throw new ConflictException("Esa etapa ya está archivada.");
			}

			const shipments = await tx.shipment.findMany({
				where: { stageKey: stage.key },
				orderBy: { createdAt: "asc" },
				select: { id: true },
			});

			if (shipments.length > 0) {
				if (!input.targetKey || !occurredOn) {
					throw new ConflictException(
						`Hay ${shipments.length} envíos en esta etapa. Elige a qué etapa pasan antes de archivarla.`,
					);
				}
				await this.assertTarget(tx, input.targetKey, stage.key);
				for (const shipment of shipments) {
					await moveShipmentInTx(tx, {
						shipmentId: shipment.id,
						targetKey: input.targetKey,
						occurredOn,
						actorId: actingUserId,
					});
				}
			}

			await tx.importStage.update({
				where: { key: stage.key },
				data: { archivedAt: new Date() },
			});

			return shipments.length;
		});

		this.logger.log({
			message: "Import stage archived",
			stage: input.key,
			shipmentsMoved: moved,
		});

		return this.settings(actingUserId);
	}

	async restore(
		actingUserId: string,
		key: string,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, key);
			if (!stage.archivedAt) {
				throw new ConflictException("Esa etapa no está archivada.");
			}
			const all = await tx.importStage.findMany({
				select: { position: true, isEntry: true, kind: true },
			});
			await tx.importStage.update({
				where: { key },
				data: { archivedAt: null, position: nextIntermediatePosition(all) },
			});
		});

		return this.settings(actingUserId);
	}

	private async lock(
		tx: Prisma.TransactionClient,
		key: string,
	): Promise<StageRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM import_stage WHERE "key" = ${key} FOR UPDATE
		`;
		const stage = await tx.importStage.findUnique({ where: { key } });
		if (!stage) {
			throw new NotFoundException("No existe una etapa con esa clave.");
		}
		return stage;
	}

	private async assertTarget(
		tx: Prisma.TransactionClient,
		targetKey: string,
		sourceKey: string,
	): Promise<void> {
		if (targetKey === sourceKey) {
			throw new BadRequestException("Elige otra etapa para los envíos.");
		}
		const target = await tx.importStage.findUnique({
			where: { key: targetKey },
		});
		if (
			!target ||
			target.archivedAt ||
			target.kind !== ImportStageKind.IN_PROGRESS
		) {
			throw new BadRequestException(
				"Los envíos solo pueden pasar a una etapa activa en curso.",
			);
		}
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptKey?: string,
	): Promise<void> {
		const existing = await tx.importStage.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				key: exceptKey ? { not: exceptKey } : undefined,
			},
			select: { key: true },
		});
		if (existing) {
			throw new ConflictException(`Ya existe una etapa llamada ${name}.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar las etapas de importación.",
			);
		}
	}
}
