import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { z } from "zod";

const recordId = z.string().min(1);

const filename = z
	.string()
	.trim()
	.min(1, "El archivo necesita un nombre.")
	.max(
		IMPORT_DOCUMENT.filenameMaxLength,
		`Máximo ${IMPORT_DOCUMENT.filenameMaxLength} caracteres.`,
	);

export const documentUploadInput = z.object({
	eventId: recordId,
	filename,
	contentType: z.string().trim().min(1),
	size: z.number().int().min(0),
});

export const documentUploadOutput = z.object({
	pathname: z.string(),
	token: z.string(),
});

export const documentAttachInput = z.object({
	eventId: recordId,
	pathname: z.string().min(1),
	filename,
	labelId: recordId.nullable(),
});

export const documentIdInput = z.object({ id: recordId });

export const documentDownloadOutput = z.object({ url: z.url() });

export type DocumentUploadInput = z.infer<typeof documentUploadInput>;
export type DocumentUpload = z.infer<typeof documentUploadOutput>;
export type DocumentAttachInput = z.infer<typeof documentAttachInput>;
export type DocumentIdInput = z.infer<typeof documentIdInput>;
export type DocumentDownload = z.infer<typeof documentDownloadOutput>;
