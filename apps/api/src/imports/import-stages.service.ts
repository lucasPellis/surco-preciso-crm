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
	ImportStageExpectedLabelsInput,
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

	async settings(
		actingUserId: string,
		processId: string,
	): Promise<ImportStageSettings> {
		const [owner, rows, counts, role] = await Promise.all([
			this.db.importProcess.findUnique({
				where: { id: processId },
				select: { id: true, name: true, countryCode: true, archivedAt: true },
			}),
			this.db.importStage.findMany({
				where: { processId },
				orderBy: { position: "asc" },
				include: {
					documents: {
						where: { label: { archivedAt: null } },
						orderBy: [{ position: "asc" }, { label: { name: "asc" } }],
						select: { labelId: true },
					},
				},
			}),
			this.db.shipment.groupBy({
				by: ["stageKey"],
				where: { stage: { processId } },
				_count: { _all: true },
			}),
			workspaceRoleOf(actingUserId),
		]);
		if (!owner) {
			throw new NotFoundException("No existe un proceso con ese id.");
		}
		const perStage = new Map(
			counts.map((row) => [row.stageKey, row._count._all]),
		);

		return {
			process: {
				id: owner.id,
				name: owner.name,
				countryCode: owner.countryCode,
				archived: owner.archivedAt !== null,
			},
			stages: rows.map((row) => ({
				key: row.key,
				name: row.name,
				kind: row.kind,
				tone: row.tone,
				position: row.position,
				isEntry: row.isEntry,
				archived: row.archivedAt !== null,
				shipmentCount: perStage.get(row.key) ?? 0,
				expectedLabelIds: row.documents.map((document) => document.labelId),
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
			const owner = await tx.importProcess.findUnique({
				where: { id: input.processId },
				select: { id: true },
			});
			if (!owner) {
				throw new NotFoundException("No existe un proceso con ese id.");
			}
			await this.assertNameFree(tx, input.processId, input.name);
			const taken = await tx.importStage.findMany({ select: { key: true } });
			const siblings = await tx.importStage.findMany({
				where: { processId: input.processId },
				select: { position: true, isEntry: true, kind: true },
			});
			const key = uniqueStageKey(
				input.name,
				new Set(taken.map((row) => row.key)),
			);
			if (!key) {
				throw new BadRequestException(
					"El nombre necesita al menos una letra o un número.",
				);
			}
			await tx.importStage.create({
				data: {
					key,
					processId: input.processId,
					name: input.name,
					kind: ImportStageKind.IN_PROGRESS,
					tone: input.tone ?? IMPORT_STAGE.defaultTone,
					position: nextIntermediatePosition(siblings),
				},
			});
		});

		return this.settings(actingUserId, input.processId);
	}

	async update(
		actingUserId: string,
		input: ImportStageUpdateInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		const processId = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			await this.assertNameFree(tx, stage.processId, input.name, stage.key);
			await tx.importStage.update({
				where: { key: stage.key },
				data: { name: input.name, tone: input.tone },
			});
			return stage.processId;
		});

		return this.settings(actingUserId, processId);
	}

	async reorder(
		actingUserId: string,
		input: ImportStageReorderInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`
				SELECT 1 FROM import_stage WHERE "processId" = ${input.processId} FOR UPDATE
			`;
			const active = await tx.importStage.findMany({
				where: { processId: input.processId, archivedAt: null },
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

		return this.settings(actingUserId, input.processId);
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

		const result = await this.db.$transaction(async (tx) => {
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
				await this.assertTarget(tx, input.targetKey, stage);
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

			return { processId: stage.processId, moved: shipments.length };
		});

		this.logger.log({
			message: "Import stage archived",
			stage: input.key,
			shipmentsMoved: result.moved,
		});

		return this.settings(actingUserId, result.processId);
	}

	async restore(
		actingUserId: string,
		key: string,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		const processId = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, key);
			if (!stage.archivedAt) {
				throw new ConflictException("Esa etapa no está archivada.");
			}
			const siblings = await tx.importStage.findMany({
				where: { processId: stage.processId },
				select: { position: true, isEntry: true, kind: true },
			});
			await tx.importStage.update({
				where: { key },
				data: {
					archivedAt: null,
					position: nextIntermediatePosition(siblings),
				},
			});
			return stage.processId;
		});

		return this.settings(actingUserId, processId);
	}

	async setExpectedLabels(
		actingUserId: string,
		input: ImportStageExpectedLabelsInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		const processId = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			if (input.labelIds.length > 0) {
				const active = await tx.documentLabel.count({
					where: { id: { in: input.labelIds }, archivedAt: null },
				});
				if (active !== input.labelIds.length) {
					throw new BadRequestException(
						"Una etiqueta no existe o está archivada.",
					);
				}
			}
			await tx.importStageDocument.deleteMany({
				where: { stageKey: stage.key, label: { archivedAt: null } },
			});
			await tx.importStageDocument.createMany({
				data: input.labelIds.map((labelId, position) => ({
					stageKey: stage.key,
					labelId,
					position,
				})),
			});
			return stage.processId;
		});

		return this.settings(actingUserId, processId);
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
		source: StageRecord,
	): Promise<void> {
		if (targetKey === source.key) {
			throw new BadRequestException("Elige otra etapa para los envíos.");
		}
		const target = await tx.importStage.findUnique({
			where: { key: targetKey },
		});
		if (
			!target ||
			target.processId !== source.processId ||
			target.archivedAt ||
			target.kind !== ImportStageKind.IN_PROGRESS
		) {
			throw new BadRequestException(
				"Los envíos solo pueden pasar a una etapa activa en curso del mismo proceso.",
			);
		}
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		processId: string,
		name: string,
		exceptKey?: string,
	): Promise<void> {
		const existing = await tx.importStage.findFirst({
			where: {
				processId,
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
