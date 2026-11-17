const DAY_MS = 86_400_000;

export type ChatDateGroup = "Hoy" | "Ayer" | "Últimos 7 días";

export function chatDateGroup(
	lastMessageAt: string,
	now: number,
): ChatDateGroup | null {
	if (!now) return null;

	const daysAgo =
		Math.floor(now / DAY_MS) -
		Math.floor(new Date(lastMessageAt).getTime() / DAY_MS);
	if (daysAgo <= 0) return "Hoy";
	if (daysAgo === 1) return "Ayer";
	if (daysAgo <= 7) return "Últimos 7 días";
	return null;
}
