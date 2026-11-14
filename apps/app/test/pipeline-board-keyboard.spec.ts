import { describe, expect, it } from "bun:test";
import { columnTargetX } from "@crm/ui/lib/pipeline-board-keyboard";

const columns = [
	{ left: 0, right: 288, width: 288 },
	{ left: 300, right: 588, width: 288 },
	{ left: 600, right: 888, width: 288 },
];

const card = { left: 8, width: 270 };

describe("columnTargetX", () => {
	it("centres the card in the next column to the right", () => {
		expect(columnTargetX(columns, card, 1)).toBe(309);
	});

	it("centres the card in the previous column to the left", () => {
		expect(columnTargetX(columns, { left: 309, width: 270 }, -1)).toBe(9);
	});

	it("stops at the first and the last column", () => {
		expect(columnTargetX(columns, card, -1)).toBeUndefined();
		expect(
			columnTargetX(columns, { left: 609, width: 270 }, 1),
		).toBeUndefined();
	});

	it("ignores a card whose centre is in no column", () => {
		expect(columnTargetX(columns, { left: 289, width: 10 }, 1)).toBeUndefined();
	});

	it("orders the columns by position", () => {
		const shuffled = [columns[2], columns[0], columns[1]].flatMap((column) =>
			column ? [column] : [],
		);
		expect(columnTargetX(shuffled, card, 1)).toBe(309);
	});
});
