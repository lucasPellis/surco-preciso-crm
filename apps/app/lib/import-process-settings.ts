import { ImportCountry } from "@crm/db/enums";
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";

export type ImportProcessRow =
	RouterOutputs["importProcesses"]["list"]["processes"][number];

export const NO_COUNTRY = "none";

export function splitImportProcesses(rows: readonly ImportProcessRow[]) {
	return {
		active: rows.filter((row) => !row.archived),
		archived: rows.filter((row) => row.archived),
	};
}

export function copyName(name: string, maxLength: number): string {
	const suffix = IMPORTS_UI.copySuffix;
	return `${name.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

export function countryFromChoice(value: string): ImportCountry | null {
	return (
		Object.values(ImportCountry).find((country) => country === value) ?? null
	);
}

export function countryLabel(country: ImportCountry | null): string | null {
	return country === null ? null : IMPORTS_UI.countryLabels[country];
}

export function countLabel(count: number, one: string, many: string): string {
	return count === 1 ? `1 ${one}` : `${count} ${many}`;
}
