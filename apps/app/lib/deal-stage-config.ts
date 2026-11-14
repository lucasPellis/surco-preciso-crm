import type { StatusTone } from "@crm/ui/components/status-indicator";

export const STAGE_TONES = {
	open: ["neutral", "neutral", "info", "info"] as readonly StatusTone[],
	openOverflow: "warning" as StatusTone,
	paused: "neutral" as StatusTone,
	won: "success" as StatusTone,
	lost: "error" as StatusTone,
} as const;

export const STAGE_IDLE = {
	hoursPerDay: 24,
} as const;
