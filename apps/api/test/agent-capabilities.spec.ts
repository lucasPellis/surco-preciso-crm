import { describe, expect, it } from "bun:test";
import { readAgentCapabilities } from "../src/enrichment/agent-capabilities";

describe("agent capabilities bridge", () => {
	it("returns unknown when the bridge is absent or fails", async () => {
		expect(await readAgentCapabilities(null)).toEqual({ model: "unknown" });
		expect(
			await readAgentCapabilities(
				{ url: () => new URL("http://localhost"), secret: "x" },
				async () => {
					throw new Error("offline");
				},
			),
		).toEqual({ model: "unknown" });
	});
	it("parses the agent response and rejects invalid states", async () => {
		const bridge = { url: () => new URL("http://localhost"), secret: "x" };
		expect(
			await readAgentCapabilities(bridge, async () =>
				Response.json({ model: "unavailable" }),
			),
		).toEqual({ model: "unavailable" });
		expect(
			await readAgentCapabilities(bridge, async () =>
				Response.json({ model: "bad" }),
			),
		).toEqual({ model: "unknown" });
	});
});
