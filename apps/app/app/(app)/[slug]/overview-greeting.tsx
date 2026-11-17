"use client";

import {
	PageShellDescription,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import { useQueryState } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreetingFallback() {
	return (
		<>
			<PageShellTitle>Bienvenido de nuevo</PageShellTitle>
			<PageShellDescription>
				Lo que has cerrado, lo que sigue en progreso y lo que requiere tu
				atención hoy.
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting() {
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	return (
		<>
			<PageShellTitle>Bienvenido de nuevo</PageShellTitle>
			<PageShellDescription>
				{scope === "me"
					? "Lo que has cerrado, lo que sigue en progreso y lo que requiere tu atención hoy."
					: "Lo que el equipo ha cerrado, lo que sigue en progreso y lo que requiere tu atención hoy."}
			</PageShellDescription>
		</>
	);
}
