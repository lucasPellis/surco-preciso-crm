import { PipelineStageKind } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";
import { type ChartColor, stageChartColor } from "@crm/ui/lib/chart-config";
import type { RouterOutputs } from "@/lib/trpc/types";
import { STAGE_IDLE, STAGE_TONE_STATUS } from "./deal-stage-config";

export type StageRow = RouterOutputs["deals"]["stages"][number];

export type StageCatalog = ReturnType<typeof buildStageCatalog>;

function isClosedKind(kind: PipelineStageKind): boolean {
	return kind === PipelineStageKind.WON || kind === PipelineStageKind.LOST;
}

export function buildStageCatalog(rows: readonly StageRow[]) {
	const sorted = [...rows].sort((a, b) => a.position - b.position);
	const byKey = new Map(sorted.map((row) => [row.key, row]));
	const active = sorted.filter((row) => !row.archived);
	const open = active.filter((row) => row.kind === PipelineStageKind.OPEN);
	const rail = [
		...open,
		...active.filter((row) => row.kind === PipelineStageKind.WON).slice(0, 1),
	];

	function tone(key: string): StatusTone {
		const row = byKey.get(key);
		return row ? STAGE_TONE_STATUS[row.tone] : "neutral";
	}

	return {
		rows: sorted,
		open,
		rail,
		options: active.map((row) => ({
			value: row.key,
			label: row.name,
			kind: row.kind,
		})),
		label: (key: string) => byKey.get(key)?.name ?? key,
		tone,
		isClosed: (key: string) => {
			const row = byKey.get(key);
			return row ? isClosedKind(row.kind) : false;
		},
		isWon: (key: string) => byKey.get(key)?.kind === PipelineStageKind.WON,
		isLosing: (key: string) => byKey.get(key)?.kind === PipelineStageKind.LOST,
		chartColor: (key: string): ChartColor =>
			stageChartColor(open.findIndex((row) => row.key === key)),
	};
}

export function idleLabel(hours: number): string {
	if (hours >= STAGE_IDLE.hoursPerDay) {
		const days = Math.floor(hours / STAGE_IDLE.hoursPerDay);
		return `Sin actividad hace ${days} ${days === 1 ? "día" : "días"}`;
	}
	return `Sin actividad hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
}

export function stepperSteps(stages: StageCatalog, stage: string) {
	const rail = stages.rail.map((row) => row.key);

	if (stages.isClosed(stage) && !stages.isWon(stage)) {
		return { steps: stages.open.map((row) => row.key), trailing: true };
	}

	return { steps: rail, trailing: !rail.includes(stage) };
}
