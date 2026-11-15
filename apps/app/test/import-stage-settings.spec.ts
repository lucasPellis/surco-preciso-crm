import { describe, expect, it } from "bun:test";
import {
	applyImportStageOrder,
	type ImportStageRow,
	importArchiveTargets,
	splitImportStages,
	utcDay,
} from "../lib/import-stage-settings";

function row(
	key: string,
	kind: ImportStageRow["kind"],
	position: number,
	extra: Partial<ImportStageRow> = {},
): ImportStageRow {
	return {
		key,
		name: key,
		kind,
		tone: "NEUTRAL",
		position,
		isEntry: false,
		archived: false,
		shipmentCount: 0,
		...extra,
	};
}

const rows = [
	row("CANCELLED", "CANCELLED", 1001),
	row("RECEIVED", "RECEIVED", 1000),
	row("B", "IN_PROGRESS", 2),
	row("ORDERED", "IN_PROGRESS", 0, { isEntry: true }),
	row("A", "IN_PROGRESS", 1),
	row("OLD", "IN_PROGRESS", 3, { archived: true }),
];

describe("splitting the import stages", () => {
	it("separates the fixed rows, the intermediate rows and the archive", () => {
		const split = splitImportStages(rows);

		expect(split.entry?.key).toBe("ORDERED");
		expect(split.intermediate.map((stage) => stage.key)).toEqual(["A", "B"]);
		expect(split.received?.key).toBe("RECEIVED");
		expect(split.cancelled?.key).toBe("CANCELLED");
		expect(split.archived.map((stage) => stage.key)).toEqual(["OLD"]);
	});
});

describe("reordering the import stages", () => {
	it("swaps the positions of the intermediate rows only", () => {
		const next = applyImportStageOrder(rows, ["B", "A"]);

		expect(
			splitImportStages(next).intermediate.map((stage) => stage.key),
		).toEqual(["B", "A"]);
		expect(next.find((stage) => stage.key === "RECEIVED")?.position).toBe(1000);
		expect(next.find((stage) => stage.key === "OLD")?.position).toBe(3);
	});
});

describe("archive targets", () => {
	it("offers the active in-progress stages except the one being archived", () => {
		expect(importArchiveTargets(rows, "A").map((stage) => stage.key)).toEqual([
			"ORDERED",
			"B",
		]);
	});
});

describe("the UTC day", () => {
	it("returns the UTC calendar day of an instant", () => {
		expect(utcDay(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01");
		expect(utcDay(new Date("2026-03-01T23:59:59.999Z"))).toBe("2026-03-01");
	});

	it("is already tomorrow late in the evening in Argentina", () => {
		expect(utcDay(new Date("2026-03-01T22:30:00-03:00"))).toBe("2026-03-02");
	});
});
