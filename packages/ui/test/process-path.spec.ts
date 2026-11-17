import { describe, expect, it } from "bun:test";
import {
	ProcessPath,
	type ProcessPathStep,
} from "@crm/ui/components/process-path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const STEPS: ProcessPathStep[] = [
	{ key: "a", label: "Pedido", state: "done", detail: "10 ene 2026" },
	{ key: "b", label: "Con DHL", state: "current", detail: "3 días" },
	{ key: "c", label: "Recibido", state: "pending", detail: null },
];

function render(steps: ProcessPathStep[] = STEPS): string {
	return renderToStaticMarkup(
		createElement(ProcessPath, { label: "Recorrido del envío 1", steps }),
	);
}

describe("ProcessPath", () => {
	it("lists the steps in order inside a labelled list", () => {
		const markup = render();

		expect(markup.startsWith("<ol")).toBe(true);
		expect(markup).toContain('aria-label="Recorrido del envío 1"');
		expect(markup.indexOf("Pedido")).toBeLessThan(markup.indexOf("Con DHL"));
		expect(markup.indexOf("Con DHL")).toBeLessThan(markup.indexOf("Recibido"));
	});

	it("marks only the current step", () => {
		const markup = render();
		const current = markup.match(/<li[^>]*aria-current="step"[^>]*>.*?<\/li>/);

		expect(markup.match(/aria-current="step"/g)?.length).toBe(1);
		expect(current?.[0]).toContain("Con DHL");
	});

	it("names each state for screen readers", () => {
		const markup = render();

		expect(markup).toContain('<span class="sr-only">Completada</span>');
		expect(markup).toContain('<span class="sr-only">Etapa actual</span>');
		expect(markup).toContain('<span class="sr-only">Pendiente</span>');
	});

	it("shows a detail only when the step has one", () => {
		const markup = render();

		expect(markup.match(/data-slot="process-path-detail"/g)?.length).toBe(2);
		expect(markup).toContain("3 días");
	});

	it("keeps the state on each step", () => {
		const markup = render();

		expect(markup).toContain('data-state="done"');
		expect(markup).toContain('data-state="current"');
		expect(markup).toContain('data-state="pending"');
	});
});
