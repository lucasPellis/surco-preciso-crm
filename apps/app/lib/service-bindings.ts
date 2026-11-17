export function apiServiceUrl(): string {
	return (
		process.env.INTERNAL_API_URL?.trim() ||
		process.env.API_URL ||
		process.env.NEXT_PUBLIC_API_URL ||
		"http://localhost:3001"
	);
}

export function agentServiceUrl(): string {
	return (
		process.env.INTERNAL_AGENT_URL?.trim() ||
		process.env.AGENT_URL ||
		"http://127.0.0.1:2000"
	);
}
