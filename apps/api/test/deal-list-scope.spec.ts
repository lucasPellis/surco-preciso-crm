import { describe, expect, it } from "bun:test";
import { dealListScopeFilter } from "../src/deals/deal-list-scope";

describe("deal list scope", () => {
	it("restricts me to the current owner", () => {
		expect(dealListScopeFilter("me", "user-1")).toEqual({ ownerId: "user-1" });
	});

	it("does not restrict everyone", () => {
		expect(dealListScopeFilter("everyone", "user-1")).toEqual({});
	});
});
