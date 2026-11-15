import type { ImportCountry } from "@crm/db/enums";

export const IMPORTS_UI = {
	pageTitle: "Importaciones",
	locale: "es",
	copySuffix: " (copia)",
	countryLabels: {
		AR: "Argentina",
		PY: "Paraguay",
		BR: "Brasil",
	} satisfies Record<ImportCountry, string>,
} as const;
