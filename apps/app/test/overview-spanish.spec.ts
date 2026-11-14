import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const root = new URL("../app/(app)/[slug]/", import.meta.url);

test("the overview uses Spanish interface copy", () => {
	const greeting = readFileSync(new URL("overview-greeting.tsx", root), "utf8");
	const sales = readFileSync(new URL("sales-dashboard.tsx", root), "utf8");
	const summary = readFileSync(new URL("dashboard-summary.tsx", root), "utf8");
	for (const [source, labels] of [
		[greeting, ["Bienvenido de nuevo", "el equipo"]],
		[sales, ["Oportunidades abiertas", "Tasa de cierre", "oportunidades"]],
		[
			summary,
			["Oportunidades en progreso", "Tareas vencidas", "Actividad reciente"],
		],
	] as const) {
		for (const label of labels) expect(source).toContain(label);
	}
});
