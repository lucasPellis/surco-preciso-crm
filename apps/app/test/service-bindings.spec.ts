import { afterEach, describe, expect, test } from "bun:test";
import { agentServiceUrl, apiServiceUrl } from "../lib/service-bindings";

const originalApi = process.env.INTERNAL_API_URL;
const originalAgent = process.env.INTERNAL_AGENT_URL;

afterEach(() => {
	if (originalApi === undefined) delete process.env.INTERNAL_API_URL;
	else process.env.INTERNAL_API_URL = originalApi;
	if (originalAgent === undefined) delete process.env.INTERNAL_AGENT_URL;
	else process.env.INTERNAL_AGENT_URL = originalAgent;
});

describe("service bindings", () => {
	test("reads injected URLs at runtime", () => {
		process.env.INTERNAL_API_URL = "https://api.internal";
		process.env.INTERNAL_AGENT_URL = "https://agent.internal";
		expect(apiServiceUrl()).toBe("https://api.internal");
		expect(agentServiceUrl()).toBe("https://agent.internal");
	});
});
