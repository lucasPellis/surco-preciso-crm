import { PipelineStageKind } from "@crm/db/enums";
import { isFixedStage } from "@crm/db/pipeline-stage";
import type { RouterOutputs } from "@/lib/trpc/types";

export type StageSettingsRow =
	RouterOutputs["deals"]["stageList"]["stages"][number];

const byPosition = (a: StageSettingsRow, b: StageSettingsRow) =>
	a.position - b.position;

export function splitStages(rows: readonly StageSettingsRow[]) {
	const sorted = [...rows].sort(byPosition);
	const active = sorted.filter((row) => !row.archived);

	return {
		entry: active.find((row) => row.isEntry),
		intermediate: active.filter((row) => !isFixedStage(row)),
		won: active.find((row) => row.kind === PipelineStageKind.WON),
		lost: active.find((row) => row.kind === PipelineStageKind.LOST),
		archived: sorted.filter((row) => row.archived),
	};
}

export function applyOrder(
	rows: readonly StageSettingsRow[],
	keys: readonly string[],
): StageSettingsRow[] {
	const slots = rows
		.filter((row) => !row.archived && !isFixedStage(row))
		.map((row) => row.position)
		.sort((a, b) => a - b);
	const position = new Map(keys.map((key, index) => [key, slots[index]]));

	return rows.map((row) => {
		const next = position.get(row.key);
		return next === undefined ? row : { ...row, position: next };
	});
}

export function archiveTargets(
	rows: readonly StageSettingsRow[],
	key: string,
): StageSettingsRow[] {
	return [...rows]
		.sort(byPosition)
		.filter(
			(row) =>
				row.key !== key &&
				!row.archived &&
				(row.kind === PipelineStageKind.OPEN ||
					row.kind === PipelineStageKind.PAUSED),
		);
}

export function wholeNumberOf(value: string): number | null | undefined {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	if (!/^\d+$/.test(trimmed)) return undefined;
	const hours = Number(trimmed);
	return hours >= 1 ? hours : undefined;
}
