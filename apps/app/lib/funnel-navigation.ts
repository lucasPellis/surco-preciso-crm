import { workspaceUrl } from "./workspace-url";

export function funnelListHref(
	slug: string,
	values: Record<string, string | string[] | undefined>,
): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(values)) {
		if (Array.isArray(value)) {
			for (const item of value) params.append(key, item);
		} else if (value !== undefined) {
			params.set(key, value);
		}
	}
	params.set("view", "list");
	return `${workspaceUrl(slug, "/funnel")}?${params}`;
}
