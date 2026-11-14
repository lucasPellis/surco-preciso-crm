import { describe, expect, it } from "bun:test";
import {
	buildStageCatalog,
	idleLabel,
	type StageRow,
	stepperSteps,
} from "../lib/deal-stage";

function row(
	key: string,
	kind: StageRow["kind"],
	position: number,
	extra: Partial<StageRow> = {},
): StageRow {
	return {
		key,
		name: key.toLowerCase(),
		kind,
		tone: "NEUTRAL",
		position,
		isEntry: false,
		idleAfterHours: null,
		autoLoseAfterDays: null,
		archived: false,
		...extra,
	};
}

const rows: StageRow[] = [
	row("LOST", "LOST", 7, { tone: "ERROR" }),
	row("NEW", "OPEN", 0, { isEntry: true }),
	row("CONTACTED", "OPEN", 1),
	row("QUALIFIED", "OPEN", 2, { tone: "INFO" }),
	row("NO_RESPONSE", "PAUSED", 5),
	row("WON", "WON", 6, { tone: "SUCCESS" }),
	row("OLD", "OPEN", 3, { archived: true }),
];

const catalog = buildStageCatalog(rows);

describe("the stage catalog", () => {
	it("orders stages by position and hides archived ones from the options", () => {
		expect(catalog.options.map((option) => option.value)).toEqual([
			"NEW",
			"CONTACTED",
			"QUALIFIED",
			"NO_RESPONSE",
			"WON",
			"LOST",
		]);
	});

	it("reads closed and losing from the kind, not the key", () => {
		const custom = buildStageCatalog([
			row("ENTRY", "OPEN", 0, { isEntry: true }),
			row("DONE", "WON", 1),
			row("DROPPED", "LOST", 2),
			row("WAIT", "PAUSED", 3),
		]);

		expect(custom.isClosed("DONE")).toBe(true);
		expect(custom.isClosed("DROPPED")).toBe(true);
		expect(custom.isClosed("WAIT")).toBe(false);
		expect(custom.isLosing("DROPPED")).toBe(true);
		expect(custom.isLosing("DONE")).toBe(false);
	});

	it("keeps a paused stage out of the open rail", () => {
		expect(catalog.open.map((entry) => entry.key)).toEqual([
			"NEW",
			"CONTACTED",
			"QUALIFIED",
		]);
		expect(catalog.rail.map((entry) => entry.key)).toEqual([
			"NEW",
			"CONTACTED",
			"QUALIFIED",
			"WON",
		]);
	});

	it("labels an archived stage that deals still use", () => {
		expect(catalog.label("OLD")).toBe("old");
		expect(catalog.label("UNKNOWN")).toBe("UNKNOWN");
	});

	it("reads the tone from the stored tone, not the position", () => {
		expect(catalog.tone("NEW")).toBe("neutral");
		expect(catalog.tone("QUALIFIED")).toBe("info");
		expect(catalog.tone("WON")).toBe("success");
		expect(catalog.tone("LOST")).toBe("error");
		expect(catalog.tone("GHOST")).toBe("neutral");
		expect(
			buildStageCatalog([row("X", "OPEN", 0, { tone: "WARNING" })]).tone("X"),
		).toBe("warning");
	});
});

describe("idleLabel", () => {
	it("speaks in hours under a day", () => {
		expect(idleLabel(1)).toBe("Sin actividad hace 1 hora");
		expect(idleLabel(5)).toBe("Sin actividad hace 5 horas");
	});

	it("speaks in days from a day on", () => {
		expect(idleLabel(24)).toBe("Sin actividad hace 1 día");
		expect(idleLabel(120)).toBe("Sin actividad hace 5 días");
	});
});

describe("stepperSteps", () => {
	it("keeps the rail for an open stage on it", () => {
		expect(stepperSteps(catalog, "CONTACTED")).toEqual({
			steps: ["NEW", "CONTACTED", "QUALIFIED", "WON"],
			trailing: false,
		});
		expect(stepperSteps(catalog, "WON").trailing).toBe(false);
	});

	it("shows a lost deal as an extra outcome after the open stages", () => {
		expect(stepperSteps(catalog, "LOST")).toEqual({
			steps: ["NEW", "CONTACTED", "QUALIFIED"],
			trailing: true,
		});
	});

	it("shows a paused stage and an archived open stage as the current extra item", () => {
		expect(stepperSteps(catalog, "NO_RESPONSE").trailing).toBe(true);
		expect(stepperSteps(catalog, "OLD").trailing).toBe(true);
		expect(stepperSteps(catalog, "NO_RESPONSE").steps).toEqual(
			stepperSteps(catalog, "NEW").steps,
		);
	});
});
