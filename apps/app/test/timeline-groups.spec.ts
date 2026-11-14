import { describe, expect, it } from "bun:test";
import { groupStageChanges, stageMoveLabel } from "../lib/timeline-groups";

function entry(id: string, type: string, at = "2026-11-14T10:00:00Z") {
	return { id, type, occurredAt: at, createdAt: at };
}

const shape = (
	rows: ReturnType<typeof groupStageChanges<ReturnType<typeof entry>>>,
) =>
	rows.map((row) =>
		row.kind === "entry"
			? row.entry.id
			: `[${row.entries.map((item) => item.id).join(",")}]`,
	);

describe("grouping stage changes", () => {
	it("returns nothing for an empty list", () => {
		expect(groupStageChanges([])).toEqual([]);
	});

	it("keeps a single stage change as a normal row", () => {
		const rows = groupStageChanges([entry("a", "STAGE_CHANGE")]);

		expect(rows).toEqual([
			{ kind: "entry", entry: entry("a", "STAGE_CHANGE") },
		]);
	});

	it("groups a run of two or more and counts it", () => {
		const rows = groupStageChanges([
			entry("a", "STAGE_CHANGE"),
			entry("b", "STAGE_CHANGE"),
			entry("c", "STAGE_CHANGE"),
		]);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.kind === "stages" && rows[0].entries.length).toBe(3);
	});

	it("splits runs separated by another activity type and keeps the order", () => {
		const rows = groupStageChanges([
			entry("a", "STAGE_CHANGE"),
			entry("b", "STAGE_CHANGE"),
			entry("n", "NOTE"),
			entry("c", "STAGE_CHANGE"),
			entry("d", "STAGE_CHANGE"),
			entry("e", "CALL"),
			entry("f", "STAGE_CHANGE"),
		]);

		expect(shape(rows)).toEqual(["[a,b]", "n", "[c,d]", "e", "f"]);
	});

	it("leaves other types untouched", () => {
		const rows = groupStageChanges([entry("n", "NOTE"), entry("t", "TASK")]);

		expect(shape(rows)).toEqual(["n", "t"]);
	});

	it("picks the most recent move as the latest, whatever the order", () => {
		const rows = groupStageChanges([
			entry("old", "STAGE_CHANGE", "2026-11-01T10:00:00Z"),
			entry("new", "STAGE_CHANGE", "2026-11-14T10:00:00Z"),
		]);

		expect(rows[0]?.kind === "stages" && rows[0].latest.id).toBe("new");
	});
});

describe("the stage move label", () => {
	const label = (key: string) => key.toLowerCase();

	it("joins the two stage names", () => {
		expect(stageMoveLabel({ from: "NEW", to: "QUOTED" }, label)).toBe(
			"new → quoted",
		);
	});

	it("returns null for meta that is not a move", () => {
		expect(stageMoveLabel(null, label)).toBeNull();
		expect(stageMoveLabel({ from: 1 }, label)).toBeNull();
	});
});
