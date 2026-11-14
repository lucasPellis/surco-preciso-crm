import {
	agentCapabilitiesSchema,
	type ModelCapability,
} from "@crm/validation/enrichment-queue";
import { AGENT_DISPATCH } from "../agent/agent-dispatch.config";
import type { Bridge } from "../agent/bridge";

export async function readAgentCapabilities(
	agent: Bridge | null,
	request: (input: URL, init: RequestInit) => Promise<Response> = fetch,
): Promise<{ model: ModelCapability }> {
	if (!agent) return { model: "unknown" };
	try {
		const response = await request(agent.url("/internal/crm/capabilities"), {
			headers: { authorization: `Bearer ${agent.secret}` },
			signal: AbortSignal.timeout(AGENT_DISPATCH.poke.timeoutMs),
		});
		if (!response.ok) return { model: "unknown" };
		const parsed = agentCapabilitiesSchema.safeParse(await response.json());
		return parsed.success ? parsed.data : { model: "unknown" };
	} catch {
		return { model: "unknown" };
	}
}
