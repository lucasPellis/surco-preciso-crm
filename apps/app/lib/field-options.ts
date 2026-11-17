export type OptionDraft = { id?: string; label: string };

export function normalizeLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ");
}

function sameLabel(a: string, b: string): boolean {
	return normalizeLabel(a).toLowerCase() === normalizeLabel(b).toLowerCase();
}

export function hasLabel(options: OptionDraft[], label: string): boolean {
	return options.some((option) => sameLabel(option.label, label));
}

export function addOption(
	options: OptionDraft[],
	label: string,
): OptionDraft[] {
	const clean = normalizeLabel(label);

	if (!clean || hasLabel(options, clean)) return options;

	return [...options, { label: clean }];
}

export function renameOption(
	options: OptionDraft[],
	index: number,
	label: string,
): OptionDraft[] {
	return options.map((option, at) =>
		at === index ? { ...option, label } : option,
	);
}

export function removeOption(
	options: OptionDraft[],
	index: number,
): OptionDraft[] {
	return options.filter((_, at) => at !== index);
}

export function cleanOptions(options: OptionDraft[]): OptionDraft[] {
	const seen: OptionDraft[] = [];

	for (const option of options) {
		const label = normalizeLabel(option.label);

		if (label && !hasLabel(seen, label)) seen.push({ ...option, label });
	}

	return seen;
}

export function optionsChanged(
	before: OptionDraft[],
	after: OptionDraft[],
): boolean {
	return (
		before.length !== after.length ||
		before.some(
			(option, at) =>
				option.id !== after[at]?.id || option.label !== after[at]?.label,
		)
	);
}

export function hasDuplicates(options: OptionDraft[]): boolean {
	return (
		cleanOptions(options).length !==
		options.filter((o) => normalizeLabel(o.label)).length
	);
}
