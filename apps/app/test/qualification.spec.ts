import { describe, expect, it } from "bun:test";
import { QUALIFICATION } from "@crm/db/qualification";
import { qualificationBadge, qualificationGate } from "../lib/qualification";

describe("the qualification gate", () => {
	it("warns on a move to the qualified stage with unanswered questions", () => {
		expect(
			qualificationGate(QUALIFICATION.stageKey, { answered: 1, total: 4 }),
		).toEqual({ warn: true, missing: 3 });
	});

	it("does not warn when every question has an answer", () => {
		expect(
			qualificationGate(QUALIFICATION.stageKey, { answered: 4, total: 4 }).warn,
		).toBe(false);
	});

	it("does not warn on any other stage", () => {
		expect(qualificationGate("QUOTED", { answered: 0, total: 4 }).warn).toBe(
			false,
		);
	});

	it("does not warn when the deal has no questions defined", () => {
		expect(qualificationGate(QUALIFICATION.stageKey, null).warn).toBe(false);
	});
});

describe("the qualification badge", () => {
	it("shows answered over total and hides without questions", () => {
		expect(qualificationBadge({ answered: 2, total: 4 })).toBe("2/4");
		expect(qualificationBadge(null)).toBeNull();
	});
});
