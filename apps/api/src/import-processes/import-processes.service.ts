import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_PROCESS, keyedStages } from "@crm/db/import-process";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	ImportProcessCreateInput,
	ImportProcessDuplicateInput,
	ImportProcessList,
	ImportProcessUpdateInput,
} from "./import-processes.contracts";

type ProcessRecord = Prisma.ImportProcessGetPayload<object>;

@Injectable()
export class ImportProcessesService {
	private readonly logger = new Logger(ImportProcessesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(actingUserId: string): Promise<ImportProcessList> {
		const [rows, inProgress, role] = await Promise.all([
			this.db.importProcess.findMany({
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					countryCode: true,
					archivedAt: true,
					_count: {
						select: {
							orders: true,
							stages: { where: { archivedAt: null } },
						},
					},
				},
			}),
			this.db.importStage.findMany({
				where: { kind: ImportStageKind.IN_PROGRESS },
				select: { processId: true, _count: { select: { shipments: true } } },
			}),
			workspaceRoleOf(actingUserId),
		]);
		const active = new Map<string, number>();
		for (const stage of inProgress) {
			active.set(
				stage.processId,
				(active.get(stage.processId) ?? 0) + stage._count.shipments,
			);
		}

		return {
			processes: rows.map((row) => ({
				id: row.id,
				name: row.name,
				countryCode: row.countryCode,
				archived: row.archivedAt !== null,
				stageCount: row._count.stages,
				orderCount: row._count.orders,
				activeShipmentCount: active.get(row.id) ?? 0,
			})),
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ImportProcessCreateInput,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.assertNameFree(tx, input.name);
			const taken = await this.takenKeys(tx);
			await tx.importProcess.create({
				data: {
					name: input.name,
					countryCode: input.countryCode,
					stages: { create: keyedStages(IMPORT_PROCESS.fixedStages, taken) },
				},
			});
		});

		return this.list(actingUserId);
	}

	async update(
		actingUserId: string,
		input: ImportProcessUpdateInput,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.lock(tx, input.id);
			await this.assertNameFree(tx, input.name, input.id);
			await tx.importProcess.update({
				where: { id: input.id },
				data: { name: input.name, countryCode: input.countryCode },
			});
		});

		return this.list(actingUserId);
	}

	async duplicate(
		actingUserId: string,
		input: ImportProcessDuplicateInput,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const source = await this.lock(tx, input.id);
			await this.assertNameFree(tx, input.name);
			const steps = await tx.importStage.findMany({
				where: { processId: source.id, archivedAt: null },
				orderBy: { position: "asc" },
				select: {
					name: true,
					kind: true,
					tone: true,
					position: true,
					isEntry: true,
				},
			});
			const taken = await this.takenKeys(tx);
			await tx.importProcess.create({
				data: {
					name: input.name,
					countryCode: source.countryCode,
					stages: { create: keyedStages(steps, taken) },
				},
			});
		});

		return this.list(actingUserId);
	}

	async archive(actingUserId: string, id: string): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (found.archivedAt) {
				throw new ConflictException("Ese proceso ya está archivado.");
			}
			const active = await tx.shipment.count({
				where: {
					stage: { processId: id, kind: ImportStageKind.IN_PROGRESS },
				},
			});
			if (active > 0) {
				throw new ConflictException(
					`Hay ${active} envíos en curso en este proceso. Pásalos a una etapa de recepción o de cancelación antes de archivarlo.`,
				);
			}
			await tx.importProcess.update({
				where: { id },
				data: { archivedAt: new Date() },
			});
		});

		this.logger.log({ message: "Import process archived", process: id });

		return this.list(actingUserId);
	}

	async restore(actingUserId: string, id: string): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (!found.archivedAt) {
				throw new ConflictException("Ese proceso no está archivado.");
			}
			await tx.importProcess.update({
				where: { id },
				data: { archivedAt: null },
			});
		});

		return this.list(actingUserId);
	}

	private async lock(
		tx: Prisma.TransactionClient,
		id: string,
	): Promise<ProcessRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM import_process WHERE id = ${id} FOR UPDATE
		`;
		const found = await tx.importProcess.findUnique({ where: { id } });
		if (!found) {
			throw new NotFoundException("No existe un proceso con ese id.");
		}
		return found;
	}

	private async takenKeys(tx: Prisma.TransactionClient): Promise<Set<string>> {
		const rows = await tx.importStage.findMany({ select: { key: true } });
		return new Set(rows.map((row) => row.key));
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptId?: string,
	): Promise<void> {
		const existing = await tx.importProcess.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				id: exceptId ? { not: exceptId } : undefined,
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`Ya existe un proceso llamado ${name}.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar los procesos de importación.",
			);
		}
	}
}
