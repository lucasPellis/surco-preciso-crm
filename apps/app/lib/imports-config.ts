import type { DocumentDirection, ImportCountry } from "@crm/db/enums";

export const IMPORTS_UI = {
	pageTitle: "Importaciones",
	locale: "es",
	copySuffix: " (copia)",
	countryLabels: {
		AR: "Argentina",
		PY: "Paraguay",
		BR: "Brasil",
	} satisfies Record<ImportCountry, string>,
	directionLabels: {
		IN: "Entrada",
		OUT: "Salida",
	} satisfies Record<DocumentDirection, string>,
	directionHints: {
		IN: "Lo recibimos de la fábrica, de DHL o de otros.",
		OUT: "Lo hacemos o lo presentamos nosotros.",
	} satisfies Record<DocumentDirection, string>,
} as const;
