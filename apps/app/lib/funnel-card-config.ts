export const FUNNEL_CARD = {
	copy: {
		taskFallback: "Tarea pendiente",
		taskToday: "Hoy",
		taskOverdue: (day: string) => `Vencida el ${day}`,
		phoneLabel: (phone: string) => `Llamar al ${phone}`,
	},
} as const;
