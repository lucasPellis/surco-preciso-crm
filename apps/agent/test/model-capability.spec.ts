import { describe, expect, it } from "bun:test";
import { modelCapabilityFrom } from "../agent/lib/capabilities";

describe("model capability", () => {
	it("reports missing credentials on a local installation", () => {
		expect(modelCapabilityFrom({})).toBe("unavailable");
	});

	it("reports configured credentials without claiming they are valid", () => {
		expect(modelCapabilityFrom({ AI_GATEWAY_API_KEY: "key" })).toBe(
			"configured",
		);
		expect(modelCapabilityFrom({ VERCEL_OIDC_TOKEN: "token" })).toBe(
			"configured",
		);
	});

	it("does not classify a Vercel request-context credential as missing", () => {
		expect(modelCapabilityFrom({ VERCEL: "1" })).toBe("unknown");
	});

	it("treats blank credentials as missing", () => {
		expect(modelCapabilityFrom({ AI_GATEWAY_API_KEY: "  " })).toBe(
			"unavailable",
		);
	});
});
