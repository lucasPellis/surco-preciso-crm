import { ImportCountry } from "@crm/db/enums";
import { IMPORT_PROCESS } from "@crm/db/import-process";
import { z } from "zod";

const processName = z
	.string()
	.trim()
	.min(1, "El proceso necesita un nombre.")
	.max(
		IMPORT_PROCESS.nameMaxLength,
		`Máximo ${IMPORT_PROCESS.nameMaxLength} caracteres.`,
	);

const recordId = z.string().min(1);

const countryCode = z.enum(ImportCountry).nullable();

export const importProcessCreateInput = z.object({
	name: processName,
	countryCode,
});

export const importProcessUpdateInput = z.object({
	id: recordId,
	name: processName,
	countryCode,
});

export const importProcessDuplicateInput = z.object({
	id: recordId,
	name: processName,
});

export const importProcessIdInput = z.object({ id: recordId });

export const importProcessRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	countryCode,
	archived: z.boolean(),
	stageCount: z.number(),
	orderCount: z.number(),
	activeShipmentCount: z.number(),
});

export const importProcessListOutput = z.object({
	processes: z.array(importProcessRowOutput),
	canManage: z.boolean(),
});

export type ImportProcessCreateInput = z.infer<typeof importProcessCreateInput>;
export type ImportProcessUpdateInput = z.infer<typeof importProcessUpdateInput>;
export type ImportProcessDuplicateInput = z.infer<
	typeof importProcessDuplicateInput
>;
export type ImportProcessIdInput = z.infer<typeof importProcessIdInput>;
export type ImportProcessList = z.infer<typeof importProcessListOutput>;
