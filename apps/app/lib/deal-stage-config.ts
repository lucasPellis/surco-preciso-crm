import type { PipelineStageTone } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

export const STAGE_TONE_STATUS = {
	NEUTRAL: "neutral",
	INFO: "info",
	WARNING: "warning",
	SUCCESS: "success",
	ERROR: "error",
} as const satisfies Record<PipelineStageTone, StatusTone>;

export const STAGE_TONE_LABELS = {
	NEUTRAL: "Neutro",
	INFO: "Azul",
	WARNING: "Amarillo",
	SUCCESS: "Verde",
	ERROR: "Rojo",
} as const satisfies Record<PipelineStageTone, string>;

export const STAGE_IDLE = {
	hoursPerDay: 24,
} as const;

export const STAGE_LOAD_ERROR = {
	toastId: "stages-load-error",
	title: "No se pudieron cargar las etapas.",
	retry: "Reintentar",
} as const;
