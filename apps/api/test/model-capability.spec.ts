import { describe, expect, it } from "bun:test";
import { enrichmentQueueState } from "../src/enrichment/enrichment-copy";

describe("research queue model availability", () => {
	const now = new Date("2026-01-01T00:00:00Z");
	it("pauses only queued model-dependent work when credentials are unavailable", () => {
		expect(enrichmentQueueState(0, null, now, "identify", "unavailable")).toBe(
			"paused",
		);
		expect(enrichmentQueueState(0, null, now, "brand", "unavailable")).toBe(
			"queued",
		);
		expect(enrichmentQueueState(0, null, now, "identify", "unknown")).toBe(
			"queued",
		);
		expect(
			enrichmentQueueState(
				0,
				new Date("2026-01-01T00:01:00Z"),
				now,
				"identify",
				"unavailable",
			),
		).toBe("running");
	});
});
