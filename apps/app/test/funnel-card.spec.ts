import { describe, expect, it } from "bun:test";
import { showCompanyLine, taskLine } from "../lib/funnel-card";

describe("showCompanyLine", () => {
	it("hides the company when the name repeats it", () => {
		expect(showCompanyLine("Campo Sur", "Campo Sur")).toBe(false);
	});

	it("ignores case, spaces and accents", () => {
		expect(showCompanyLine("  campo sur ", "CAMPO SUR")).toBe(false);
		expect(showCompanyLine("Cañuelas Agro", "Canuelas agro")).toBe(false);
	});

	it("keeps the company when the names differ", () => {
		expect(showCompanyLine("Campo Sur expansión", "Campo Sur")).toBe(true);
	});
});

describe("taskLine", () => {
	it("says today for a task due today", () => {
		expect(
			taskLine({ title: "Llamar", dueAt: "2026-11-14", overdue: false }),
		).toEqual({ title: "Llamar", hint: "Hoy", overdue: false });
	});

	it("says overdue with the day for a late task", () => {
		const line = taskLine({
			title: "Llamar",
			dueAt: "2026-11-10",
			overdue: true,
		});

		expect(line.overdue).toBe(true);
		expect(line.hint.startsWith("Vencida el ")).toBe(true);
	});

	it("falls back when the task has no title", () => {
		expect(
			taskLine({ title: "  ", dueAt: "2026-11-14", overdue: false }).title,
		).toBe("Tarea pendiente");
		expect(
			taskLine({ title: null, dueAt: "2026-11-14", overdue: false }).title,
		).toBe("Tarea pendiente");
	});
});
