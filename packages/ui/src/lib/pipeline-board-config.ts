export const PIPELINE_BOARD = {
	drag: {
		mouseDistancePx: 6,
		touchDelayMs: 200,
		touchTolerancePx: 8,
	},
	keyboardStep: new Map([
		["ArrowRight", 1],
		["ArrowLeft", -1],
	]),
	copy: {
		roleDescription: "tarjeta movible",
		instructions:
			"Para mover la tarjeta, presiona Enter o Espacio. Usa las flechas izquierda y derecha para elegir la etapa. Presiona Enter para soltarla o Escape para cancelar.",
		move: (label: string) => `Mover ${label}`,
		picked: (label: string) => `Tomaste ${label}.`,
		over: (label: string, title: string) => `${label} está sobre ${title}.`,
		dropped: (label: string, title: string) => `Soltaste ${label} en ${title}.`,
		returned: (label: string) => `${label} volvió a su lugar.`,
		cancelled: (label: string) => `Cancelaste el movimiento de ${label}.`,
	},
} as const;
