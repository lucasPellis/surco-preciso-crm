import {
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
import { IMPORT_STAGE } from "@crm/db/import-stage";
import { z } from "zod";
import { taskDueDayInput } from "../activities/task-due-date";

const stageName = z
	.string()
	.trim()
	.min(1, "La etapa necesita un nombre.")
	.max(
		IMPORT_STAGE.nameMaxLength,
		`Máximo ${IMPORT_STAGE.nameMaxLength} caracteres.`,
	);

const stageKeyInput = z.string().trim().min(1);

const processIdInput = z.string().min(1);

export const importStageProcessInput = z.object({ processId: processIdInput });

export const importStageCreateInput = z.object({
	processId: processIdInput,
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
});

export const importStageUpdateInput = z.object({
	key: stageKeyInput,
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
});

export const importStageReorderInput = z.object({
	processId: processIdInput,
	keys: z.array(stageKeyInput),
});

export const importStageArchiveInput = z.object({
	key: stageKeyInput,
	targetKey: stageKeyInput.optional(),
	occurredAt: taskDueDayInput.optional(),
});

export const importStageKeyInput = z.object({ key: stageKeyInput });

export const importStageRowOutput = z.object({
	key: z.string(),
	name: z.string(),
	kind: z.enum(ImportStageKind),
	tone: z.enum(PipelineStageTone),
	position: z.number(),
	isEntry: z.boolean(),
	archived: z.boolean(),
	shipmentCount: z.number(),
});

export const importStageSettingsOutput = z.object({
	process: z.object({
		id: z.string(),
		name: z.string(),
		countryCode: z.enum(ImportCountry).nullable(),
		archived: z.boolean(),
	}),
	stages: z.array(importStageRowOutput),
	canManage: z.boolean(),
});

export type ImportStageProcessInput = z.infer<typeof importStageProcessInput>;
export type ImportStageCreateInput = z.infer<typeof importStageCreateInput>;
export type ImportStageUpdateInput = z.infer<typeof importStageUpdateInput>;
export type ImportStageReorderInput = z.infer<typeof importStageReorderInput>;
export type ImportStageArchiveInput = z.infer<typeof importStageArchiveInput>;
export type ImportStageKeyInput = z.infer<typeof importStageKeyInput>;
export type ImportStageSettings = z.infer<typeof importStageSettingsOutput>;
