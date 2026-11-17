import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { z } from "zod";

const labelName = z
	.string()
	.trim()
	.min(1, "La etiqueta necesita un nombre.")
	.max(
		IMPORT_DOCUMENT.labelNameMaxLength,
		`Máximo ${IMPORT_DOCUMENT.labelNameMaxLength} caracteres.`,
	);

const recordId = z.string().min(1);

const direction = z.enum(DocumentDirection);

export const documentLabelCreateInput = z.object({
	name: labelName,
	direction,
});

export const documentLabelUpdateInput = z.object({
	id: recordId,
	name: labelName,
	direction,
});

export const documentLabelIdInput = z.object({ id: recordId });

export const documentLabelRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	direction,
	archived: z.boolean(),
	fileCount: z.number(),
	stageCount: z.number(),
});

export const documentLabelListOutput = z.object({
	labels: z.array(documentLabelRowOutput),
	canManage: z.boolean(),
});

export type DocumentLabelCreateInput = z.infer<typeof documentLabelCreateInput>;
export type DocumentLabelUpdateInput = z.infer<typeof documentLabelUpdateInput>;
export type DocumentLabelIdInput = z.infer<typeof documentLabelIdInput>;
export type DocumentLabelList = z.infer<typeof documentLabelListOutput>;
