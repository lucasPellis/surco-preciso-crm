export const FUNNEL_CARD = {
	copy: {
		taskFallback: "Tarea pendiente",
		taskToday: "Hoy",
		taskUpcoming: (day: string) => `Para el ${day}`,
		taskOverdue: (day: string) => `Vencida el ${day}`,
		phoneLabel: (phone: string) => `Llamar al ${phone}`,
	},
} as const;
