import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";
import { type ChartColor, stageChartColor } from "@crm/ui/lib/chart-config";

const ORDER = [
	DealStage.NEW,
	DealStage.CONTACTED,
	DealStage.QUALIFIED,
	DealStage.QUOTED,
	DealStage.NEGOTIATING,
	DealStage.WON,
	DealStage.LOST,
] as const;

type DealStagePresentation = Record<
	DealStage,
	{ label: string; tone: StatusTone }
>;

const PRESENTATION: DealStagePresentation = {
	NEW: { label: "Nuevo", tone: "neutral" },
	CONTACTED: { label: "Contactado", tone: "neutral" },
	QUALIFIED: { label: "Calificado", tone: "info" },
	QUOTED: { label: "Cotizado", tone: "info" },
	NEGOTIATING: { label: "Negociando", tone: "warning" },
	WON: { label: "Ganado", tone: "success" },
	LOST: { label: "Perdido", tone: "error" },
};

export const OPEN_STAGES = ORDER.slice(0, 5) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [DealStage.LOST];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageChartColor(stage: DealStage): ChartColor {
	return stageChartColor(OPEN_STAGES.indexOf(stage));
}

export function dealStageLabel(stage: DealStage): string {
	return PRESENTATION[stage].label;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}
