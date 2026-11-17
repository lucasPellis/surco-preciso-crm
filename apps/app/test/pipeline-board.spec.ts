import { describe, expect, it } from "bun:test";
import { moveCard, type PipelineBoardData } from "../lib/pipeline-board";

const company = {
	id: "c",
	name: "Campo Sur",
	domain: null,
	iconUrl: null,
	iconDarkUrl: null,
	iconTone: null,
	logoUrl: null,
};

const owner = { id: "u", name: "Ana", email: "ana@example.test", image: null };

function card(id: string, stage: "NEW" | "QUOTED") {
	return {
		id,
		name: id,
		stage,
		currency: "USD",
		amountCents: null,
		company,
		owner,
		leadSource: null,
		stageChangedAt: "2026-11-14T00:00:00.000Z",
		lastActivityAt: null,
		idleHours: null,
	};
}

const board: PipelineBoardData = {
	reportingCurrency: "USD",
	closedWindowDays: 30,
	columns: [
		{
			stage: "NEW",
			total: 2,
			valueCents: null,
			cards: [card("a", "NEW"), card("b", "NEW")],
		},
		{
			stage: "QUOTED",
			total: 1,
			valueCents: null,
			cards: [card("c", "QUOTED")],
		},
	] as PipelineBoardData["columns"],
};

describe("moveCard", () => {
	it("moves a card to the top of another column and fixes both counts", () => {
		const moved = moveCard(board, "a", "QUOTED");

		expect(moved.columns[0]?.cards.map((entry) => entry.id)).toEqual(["b"]);
		expect(moved.columns[0]?.total).toBe(1);
		expect(moved.columns[1]?.cards.map((entry) => entry.id)).toEqual([
			"a",
			"c",
		]);
		expect(moved.columns[1]?.total).toBe(2);
		expect(moved.columns[1]?.cards[0]?.stage).toBe("QUOTED");
	});

	it("changes nothing when the card is dropped on its own column", () => {
		expect(moveCard(board, "a", "NEW")).toBe(board);
	});

	it("changes nothing for a card that is not on the board", () => {
		expect(moveCard(board, "zzz", "QUOTED")).toBe(board);
	});
});
