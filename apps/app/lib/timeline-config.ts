export const TIMELINE_COPY = {
	showOlder: "Ver anteriores",
	pinnedDay: "Pendientes",
	stageGroup: {
		count: (count: number) => `${count} cambios de etapa`,
		latest: (move: string) => `Último: ${move}`,
	},
} as const;
