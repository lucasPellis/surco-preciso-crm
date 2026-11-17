import { PipelineStageKind, PipelineStageTone } from "./generated/prisma/enums";

export const PIPELINE_STAGE = {
	nameMaxLength: 40,
	idleMaxHours: 24 * 90,
	autoLoseMaxDays: 365,
	hoursPerDay: 24,
	firstIntermediatePosition: 1,
	fixedEndPosition: 1000,
	defaultTone: PipelineStageTone.NEUTRAL,
} as const;

export const PIPELINE_STAGE_TONES = Object.values(PipelineStageTone);

export const INTERMEDIATE_KINDS = [
	PipelineStageKind.OPEN,
	PipelineStageKind.PAUSED,
] as const;

type StageShape = { isEntry: boolean; kind: PipelineStageKind };

export function isFixedStage(stage: StageShape): boolean {
	return (
		stage.isEntry ||
		stage.kind === PipelineStageKind.WON ||
		stage.kind === PipelineStageKind.LOST
	);
}

export function isIntermediateStage(stage: StageShape): boolean {
	return !isFixedStage(stage);
}

export function stageKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export function uniqueStageKey(
	name: string,
	taken: ReadonlySet<string>,
): string {
	const base = stageKey(name);
	if (!base) return "";
	if (!taken.has(base)) return base;
	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${base}_${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
}

export function sameKeySet(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	if (new Set(left).size !== left.length) return false;
	const known = new Set(right);
	return left.every((key) => known.has(key));
}

export function hoursLabel(hours: number): string {
	if (hours % PIPELINE_STAGE.hoursPerDay === 0) {
		const days = hours / PIPELINE_STAGE.hoursPerDay;
		return `${hours} h = ${days} ${days === 1 ? "día" : "días"}`;
	}
	return `${hours} h`;
}
