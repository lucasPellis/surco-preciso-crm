export const DEAL_SHEET = {
	tabs: {
		agent: false,
		contactsMinimum: 2,
	},
	copy: {
		descriptionPlaceholder: "Describe la oportunidad",
		amountPlaceholder: "Sin monto",
		nextStep: {
			title: "Próximo paso",
			none: "No hay tareas pendientes.",
			add: "Agregar tarea",
			close: "Cancelar",
		},
		qualification: {
			title: (answered: number, total: number) =>
				`Calificación ${answered}/${total}`,
		},
		contact: {
			title: "Contacto",
			none: "Todavía no hay contactos en la oportunidad.",
			add: "Agregar contacto",
			call: "Llamar",
			phone: "teléfono",
			email: "correo",
			primary: "Principal",
		},
		stage: {
			sinceToday: "Hoy en esta etapa",
			days: (days: number) =>
				`${days} ${days === 1 ? "día" : "días"} en esta etapa`,
		},
		header: {
			opened: "Abierta",
			closed: "Cerrada",
			reason: "Motivo",
		},
	},
} as const;
