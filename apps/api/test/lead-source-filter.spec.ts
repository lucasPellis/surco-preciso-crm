import { describe, expect, it } from "bun:test";
import { leadSourceFilter } from "../src/trpc/list-input";

describe("leadSourceFilter", () => {
	it("adds no filter for an empty choice", () => {
		expect(leadSourceFilter<unknown>([])).toBeUndefined();
	});

	it("matches the chosen sources", () => {
		expect(leadSourceFilter<unknown>(["a", "b"])).toEqual({
			leadSourceId: { in: ["a", "b"] },
		});
	});

	it("matches unknown with the none value alone", () => {
		expect(leadSourceFilter<unknown>(["none"])).toEqual({ leadSourceId: null });
	});

	it("matches unknown together with chosen sources", () => {
		expect(leadSourceFilter<unknown>(["a", "none"])).toEqual({
			OR: [{ leadSourceId: { in: ["a"] } }, { leadSourceId: null }],
		});
	});
});
