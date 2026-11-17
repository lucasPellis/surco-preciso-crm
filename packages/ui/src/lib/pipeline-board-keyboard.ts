type Span = { left: number; right: number; width: number };

export function columnTargetX(
	columns: readonly Span[],
	card: { left: number; width: number },
	step: number,
): number | undefined {
	const ordered = [...columns].sort((a, b) => a.left - b.left);
	const centre = card.left + card.width / 2;
	const current = ordered.findIndex(
		(column) => centre >= column.left && centre <= column.right,
	);
	const target = ordered[current + step];
	if (current === -1 || !target) return undefined;
	return target.left + (target.width - card.width) / 2;
}
