export const PROCESS_PATH = {
	stateLabels: {
		done: "Completada",
		current: "Etapa actual",
		pending: "Pendiente",
	},
} as const;

export type ProcessPathState = keyof typeof PROCESS_PATH.stateLabels;
