import { expect, it } from "bun:test";
import { runResearchLane } from "../agent/lib/dispatch";

it("does not start or claim research when model credentials are missing", async () => {
	const keys = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "VERCEL"] as const;
	const saved = keys.map((key) => process.env[key]);
	for (const key of keys) delete process.env[key];
	let called = false;
	try {
		const count = await runResearchLane(async () => {
			called = true;
			return { id: "unexpected" };
		});
		expect(count).toBe(0);
		expect(called).toBe(false);
	} finally {
		keys.forEach((key, index) => {
			const value = saved[index];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		});
	}
});
