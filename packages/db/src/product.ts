export const PRODUCT = {
	skuMaxLength: 40,
	nameMaxLength: 120,
	brandMaxLength: 60,
	categoryMaxLength: 60,
	descriptionMaxLength: 2000,
} as const;

export function normalizeSku(value: string): string {
	return value.trim().toUpperCase().replace(/\s+/g, "-");
}
