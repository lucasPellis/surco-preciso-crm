import { PipelineStageTone } from "@crm/db/enums";
import { INTERMEDIATE_KINDS, PIPELINE_STAGE } from "@crm/db/pipeline-stage";
import { z } from "zod";
import { dealStageOutput } from "./deals.contracts";

const stageName = z
	.string()
	.trim()
	.min(1, "A stage needs a name.")
	.max(
		PIPELINE_STAGE.nameMaxLength,
		`A name has at most ${PIPELINE_STAGE.nameMaxLength} characters.`,
	);

const idleHours = z
	.number()
	.int("Idle hours must be a whole number.")
	.min(1, "Idle hours must be at least 1.")
	.max(
		PIPELINE_STAGE.idleMaxHours,
		`Idle hours cannot be more than ${PIPELINE_STAGE.idleMaxHours}.`,
	);

const autoLoseDays = z
	.number()
	.int("Days must be a whole number.")
	.min(1, "Days must be at least 1.")
	.max(
		PIPELINE_STAGE.autoLoseMaxDays,
		`Days cannot be more than ${PIPELINE_STAGE.autoLoseMaxDays}.`,
	);

const stageKeyInput = z.string().trim().min(1);

export const createStageInput = z.object({
	name: stageName,
	kind: z.enum(INTERMEDIATE_KINDS),
	tone: z.enum(PipelineStageTone).optional(),
	idleAfterHours: idleHours.nullable().optional(),
	autoLoseAfterDays: autoLoseDays.nullable().optional(),
});

export const updateStageInput = z.object({
	key: stageKeyInput,
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
	idleAfterHours: idleHours.nullable().optional(),
	autoLoseAfterDays: autoLoseDays.nullable().optional(),
});

export const reorderStagesInput = z.object({
	keys: z.array(stageKeyInput),
});

export const archiveStageInput = z.object({
	key: stageKeyInput,
	targetKey: stageKeyInput.optional(),
});

export const restoreStageInput = z.object({ key: stageKeyInput });

export const stageSettingsRowOutput = dealStageOutput.extend({
	dealCount: z.number(),
});

export const stageSettingsOutput = z.object({
	stages: z.array(stageSettingsRowOutput),
	canManage: z.boolean(),
});

export type CreateStageInput = z.infer<typeof createStageInput>;
export type UpdateStageInput = z.infer<typeof updateStageInput>;
export type ReorderStagesInput = z.infer<typeof reorderStagesInput>;
export type ArchiveStageInput = z.infer<typeof archiveStageInput>;
export type StageSettings = z.infer<typeof stageSettingsOutput>;
