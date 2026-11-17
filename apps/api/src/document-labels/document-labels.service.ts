import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	DocumentLabelCreateInput,
	DocumentLabelList,
	DocumentLabelUpdateInput,
} from "./document-labels.contracts";

type LabelRecord = Prisma.DocumentLabelGetPayload<object>;

@Injectable()
export class DocumentLabelsService {
	private readonly logger = new Logger(DocumentLabelsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(actingUserId: string): Promise<DocumentLabelList> {
		const [rows, role] = await Promise.all([
			this.db.documentLabel.findMany({
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					direction: true,
					archivedAt: true,
					_count: { select: { attachments: true, stages: true } },
				},
			}),
			workspaceRoleOf(actingUserId),
		]);

		return {
			labels: rows.map((row) => ({
				id: row.id,
				name: row.name,
				direction: row.direction,
				archived: row.archivedAt !== null,
				fileCount: row._count.attachments,
				stageCount: row._count.stages,
			})),
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: DocumentLabelCreateInput,
	): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.lockNames(tx);
			await this.assertNameFree(tx, input.name);
			await tx.documentLabel.create({
				data: { name: input.name, direction: input.direction },
			});
		});

		return this.list(actingUserId);
	}

	async update(
		actingUserId: string,
		input: DocumentLabelUpdateInput,
	): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.lockNames(tx);
			await this.lock(tx, input.id);
			await this.assertNameFree(tx, input.name, input.id);
			await tx.documentLabel.update({
				where: { id: input.id },
				data: { name: input.name, direction: input.direction },
			});
		});

		return this.list(actingUserId);
	}

	async archive(actingUserId: string, id: string): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (found.archivedAt) {
				throw new ConflictException("Esa etiqueta ya está archivada.");
			}
			await tx.documentLabel.update({
				where: { id },
				data: { archivedAt: new Date() },
			});
		});

		this.logger.log({ message: "Document label archived", label: id });

		return this.list(actingUserId);
	}

	async restore(actingUserId: string, id: string): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (!found.archivedAt) {
				throw new ConflictException("Esa etiqueta no está archivada.");
			}
			await tx.documentLabel.update({
				where: { id },
				data: { archivedAt: null },
			});
		});

		return this.list(actingUserId);
	}

	private async lockNames(tx: Prisma.TransactionClient): Promise<void> {
		await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('document_label_name'))::text`;
	}

	private async lock(
		tx: Prisma.TransactionClient,
		id: string,
	): Promise<LabelRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM document_label WHERE id = ${id} FOR UPDATE
		`;
		const found = await tx.documentLabel.findUnique({ where: { id } });
		if (!found) {
			throw new NotFoundException("No existe una etiqueta con ese id.");
		}
		return found;
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptId?: string,
	): Promise<void> {
		const existing = await tx.documentLabel.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				id: exceptId ? { not: exceptId } : undefined,
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`Ya existe una etiqueta llamada ${name}.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar las etiquetas de documentos.",
			);
		}
	}
}
