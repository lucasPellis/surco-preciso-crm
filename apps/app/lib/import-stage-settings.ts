import { ImportStageKind } from "@crm/db/enums";
import { isFixedImportStage } from "@crm/db/import-stage";
import type { RouterOutputs } from "@/lib/trpc/types";

export type ImportStageRow =
	RouterOutputs["importStages"]["settings"]["stages"][number];

const byPosition = (a: ImportStageRow, b: ImportStageRow) =>
	a.position - b.position;

export function splitImportStages(rows: readonly ImportStageRow[]) {
	const sorted = [...rows].sort(byPosition);
	const active = sorted.filter((row) => !row.archived);

	return {
		entry: active.find((row) => row.isEntry),
		intermediate: active.filter((row) => !isFixedImportStage(row)),
		received: active.find((row) => row.kind === ImportStageKind.RECEIVED),
		cancelled: active.find((row) => row.kind === ImportStageKind.CANCELLED),
		archived: sorted.filter((row) => row.archived),
	};
}

export function applyImportStageOrder(
	rows: readonly ImportStageRow[],
	keys: readonly string[],
): ImportStageRow[] {
	const slots = rows
		.filter((row) => !row.archived && !isFixedImportStage(row))
		.map((row) => row.position)
		.sort((a, b) => a - b);
	const position = new Map(keys.map((key, index) => [key, slots[index]]));

	return rows.map((row) => {
		const next = position.get(row.key);
		return next === undefined ? row : { ...row, position: next };
	});
}

export function importArchiveTargets(
	rows: readonly ImportStageRow[],
	key: string,
): ImportStageRow[] {
	return [...rows]
		.sort(byPosition)
		.filter(
			(row) =>
				row.key !== key &&
				!row.archived &&
				row.kind === ImportStageKind.IN_PROGRESS,
		);
}

export function utcDay(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}
