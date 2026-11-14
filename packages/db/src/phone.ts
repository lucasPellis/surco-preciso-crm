export const PHONE = { minDigits: 7, maxDigits: 15 } as const;

export function normalizePhone(value: string): string | null {
	const trimmed = value.trim();
	const digits = trimmed.replace(/\D/g, "");
	if (digits === "") return null;
	return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function isPlausiblePhone(value: string): boolean {
	const normalized = normalizePhone(value);
	if (normalized === null) return true;
	const digits = normalized.replace(/\D/g, "").length;
	return digits >= PHONE.minDigits && digits <= PHONE.maxDigits;
}
