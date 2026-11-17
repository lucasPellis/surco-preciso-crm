import { describe, expect, it } from "bun:test";
import {
	copyName,
	countLabel,
	countryFromChoice,
	countryLabel,
	type ImportProcessRow,
	NO_COUNTRY,
	splitImportProcesses,
} from "../lib/import-process-settings";

function row(id: string, archived: boolean): ImportProcessRow {
	return {
		id,
		name: id,
		countryCode: null,
		archived,
		stageCount: 3,
		orderCount: 0,
		activeShipmentCount: 0,
	};
}

describe("splitting the processes", () => {
	it("separates active and archived processes and keeps the order", () => {
		const split = splitImportProcesses([
			row("A", false),
			row("B", true),
			row("C", false),
		]);

		expect(split.active.map((item) => item.id)).toEqual(["A", "C"]);
		expect(split.archived.map((item) => item.id)).toEqual(["B"]);
	});
});

describe("the name of a copy", () => {
	it("adds the copy suffix", () => {
		expect(copyName("Courier", 60)).toBe("Courier (copia)");
	});

	it("stays within the limit", () => {
		const name = copyName("x".repeat(60), 60);

		expect(name.length).toBe(60);
		expect(name.endsWith(" (copia)")).toBe(true);
	});
});

describe("the country", () => {
	it("reads a choice and labels a code", () => {
		expect(countryFromChoice("AR")).toBe("AR");
		expect(countryFromChoice(NO_COUNTRY)).toBeNull();
		expect(countryFromChoice("CL")).toBeNull();
		expect(countryLabel("BR")).toBe("Brasil");
		expect(countryLabel(null)).toBeNull();
	});
});

describe("counts", () => {
	it("uses the singular for one only", () => {
		expect(countLabel(1, "etapa", "etapas")).toBe("1 etapa");
		expect(countLabel(0, "etapa", "etapas")).toBe("0 etapas");
		expect(countLabel(3, "etapa", "etapas")).toBe("3 etapas");
	});
});
