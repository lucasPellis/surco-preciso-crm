export const FIELD_OPTIONS = {
	trigger: "Editar opciones",
	title: "Opciones",
	description: "Renombra, ordena, agrega o quita opciones de esta lista.",
	optionLabel: (index: number) => `Opción ${index + 1}`,
	remove: (label: string) => `Quitar ${label}`,
	addPlaceholder: "Nueva opción",
	add: "Agregar",
	duplicate: "Ya existe una opción con ese nombre.",
	removeHint:
		"Las respuestas ya guardadas con una opción quitada se conservan.",
	cancel: "Cancelar",
	save: "Guardar",
	failed: "No se pudieron guardar las opciones.",
} as const;
