import { randomUUID } from "node:crypto";
import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db } from "@crm/db";
import {
	DOCUMENT_PROBLEM_MESSAGES,
	documentFileProblem,
	documentPathname,
	IMPORT_DOCUMENT,
	isDocumentPathOf,
} from "@crm/db/import-document";
import { documentBlob } from "@crm/db/import-document-blob";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { ImportOrderDetail } from "../import-orders/import-orders.contracts";
import { ImportOrdersService } from "../import-orders/import-orders.service";
import type {
	DocumentAttachInput,
	DocumentDownload,
	DocumentUpload,
	DocumentUploadInput,
} from "./import-documents.contracts";

const NO_STORAGE =
	"Para guardar documentos falta configurar el almacenamiento de archivos (BLOB_READ_WRITE_TOKEN).";

type EventRef = { id: string; shipmentId: string; orderId: string };

@Injectable()
export class ImportDocumentsService {
	private readonly logger = new Logger(ImportDocumentsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(ImportOrdersService) private readonly orders: ImportOrdersService,
	) {}

	async uploadToken(
		actingUserId: string,
		input: DocumentUploadInput,
		now: Date = new Date(),
	): Promise<DocumentUpload> {
		await this.requireManager(actingUserId);
		this.requireStorage();
		const problem = documentFileProblem(input);
		if (problem) {
			throw new BadRequestException(DOCUMENT_PROBLEM_MESSAGES[problem]);
		}
		const event = await this.eventOf(input.eventId);
		const pathname = documentPathname({
			shipmentId: event.shipmentId,
			eventId: event.id,
			nonce: randomUUID(),
			filename: input.filename,
		});
		const token = await documentBlob.clientToken({
			pathname,
			contentType: input.contentType,
			validUntil: now.getTime() + IMPORT_DOCUMENT.uploadTokenTtlMs,
		});
		return { pathname, token };
	}

	async attach(
		actingUserId: string,
		input: DocumentAttachInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		this.requireStorage();
		const event = await this.eventOf(input.eventId);
		if (!isDocumentPathOf(input.pathname, event.shipmentId, event.id)) {
			throw new BadRequestException(
				"El archivo no pertenece a esa etapa del envío.",
			);
		}
		const saved = await this.db.attachment.findUnique({
			where: { pathname: input.pathname },
			select: { id: true },
		});
		if (saved) {
			throw new ConflictException("Ese archivo ya está guardado.");
		}
		const stored = await documentBlob.stat(input.pathname);
		if (!stored) {
			throw new BadRequestException(
				"El archivo no llegó al almacenamiento. Súbelo de nuevo.",
			);
		}
		const problem = documentFileProblem(stored);
		const refusal = problem
			? new BadRequestException(DOCUMENT_PROBLEM_MESSAGES[problem])
			: await this.labelRefusal(input.labelId);
		if (refusal) {
			await this.discard(input.pathname, null);
			throw refusal;
		}
		await this.db.attachment.create({
			data: {
				pathname: input.pathname,
				filename: input.filename,
				contentType: stored.contentType,
				size: stored.size,
				labelId: input.labelId,
				uploadedById: actingUserId,
				shipmentStageEventId: event.id,
			},
			select: { id: true },
		});

		return this.orders.detail(actingUserId, event.orderId, now);
	}

	async remove(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const found = await this.db.attachment.findUnique({
			where: { id },
			select: {
				pathname: true,
				shipmentStageEvent: {
					select: { shipment: { select: { orderId: true } } },
				},
			},
		});
		if (!found) {
			throw new NotFoundException("No existe ese documento.");
		}
		const { count } = await this.db.attachment.deleteMany({ where: { id } });
		if (count === 0) {
			throw new NotFoundException("No existe ese documento.");
		}
		await this.discard(found.pathname, id);
		this.logger.log({ message: "Import document removed", document: id });

		return this.orders.detail(
			actingUserId,
			found.shipmentStageEvent.shipment.orderId,
			now,
		);
	}

	async downloadUrl(
		_actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<DocumentDownload> {
		this.requireStorage();
		const found = await this.db.attachment.findUnique({
			where: { id },
			select: { pathname: true },
		});
		if (!found) {
			throw new NotFoundException("No existe ese documento.");
		}
		const url = await documentBlob.downloadUrl(
			found.pathname,
			now.getTime() + IMPORT_DOCUMENT.downloadUrlTtlMs,
		);
		return { url };
	}

	private async eventOf(eventId: string): Promise<EventRef> {
		const event = await this.db.shipmentStageEvent.findUnique({
			where: { id: eventId },
			select: {
				id: true,
				shipmentId: true,
				shipment: { select: { orderId: true } },
			},
		});
		if (!event) {
			throw new NotFoundException("No existe esa etapa del envío.");
		}
		return {
			id: event.id,
			shipmentId: event.shipmentId,
			orderId: event.shipment.orderId,
		};
	}

	private async labelRefusal(
		labelId: string | null,
	): Promise<BadRequestException | null> {
		if (!labelId) return null;
		const label = await this.db.documentLabel.findUnique({
			where: { id: labelId },
			select: { archivedAt: true },
		});
		if (!label) return new BadRequestException("Esa etiqueta no existe.");
		if (label.archivedAt) {
			return new BadRequestException(
				"Esa etiqueta está archivada. Elige otra o restáurala.",
			);
		}
		return null;
	}

	private async discard(
		pathname: string,
		documentId: string | null,
	): Promise<void> {
		try {
			await documentBlob.remove(pathname);
		} catch (error) {
			this.logger.warn({
				message: "Import document blob not removed",
				document: documentId,
				reason: error instanceof Error ? error.name : "unknown",
			});
		}
	}

	private requireStorage(): void {
		if (!documentBlob.enabled()) {
			throw new ConflictException(NO_STORAGE);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede subir o eliminar documentos.",
			);
		}
	}
}
