import { describe, expect, it } from "bun:test";
import { funnelListHref } from "../lib/funnel-navigation";

describe("funnel list navigation", () => {
	it("preserves existing filters and opens the list", () => {
		expect(funnelListHref("acme", { stage: "new", record: "deal:1" })).toBe(
			"/acme/funnel?stage=new&record=deal%3A1&view=list",
		);
	});

	it("forces the list when an old link contains another view", () => {
		expect(funnelListHref("acme", { view: "board" })).toBe(
			"/acme/funnel?view=list",
		);
	});
});
