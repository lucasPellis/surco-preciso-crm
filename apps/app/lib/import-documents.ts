import { type DocumentDirection, ImportStageKind } from "@crm/db/enums";
import { documentChecklist } from "@crm/db/import-document";
import {
	formatDay,
	type ImportShipment,
	type ImportStageOption,
} from "@/lib/import-orders";
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";

export type DocumentLabelRow =
	RouterOutputs["documentLabels"]["list"]["labels"][number];
export type ShipmentDocument = ImportShipment["documents"][number];
export type ShipmentEvent = ImportShipment["events"][number];
export type ExpectedLabel = ImportStageOption["expectedLabels"][number];

export type StageChecklist = {
	key: string;
	name: string;
	present: ExpectedLabel[];
	missing: ExpectedLabel[];
};

export const NO_LABEL = "none";

const KB = 1024;
const MB = KB * KB;

const sizeFormat = new Intl.NumberFormat(IMPORTS_UI.locale, {
	maximumFractionDigits: 1,
});

export function splitDocumentLabels(rows: readonly DocumentLabelRow[]) {
	return {
		active: rows.filter((row) => !row.archived),
		archived: rows.filter((row) => row.archived),
	};
}

export function groupLabelsForStage(
	active: readonly DocumentLabelRow[],
	stage: ImportStageOption | undefined,
) {
	const expected = new Set(
		(stage?.expectedLabels ?? []).map((label) => label.id),
	);
	const byId = new Map(active.map((row) => [row.id, row]));
	return {
		stage: (stage?.expectedLabels ?? []).flatMap((label) => {
			const row = byId.get(label.id);
			return row ? [row] : [];
		}),
		other: active.filter((row) => !expected.has(row.id)),
	};
}

export function directionLabel(direction: DocumentDirection): string {
	return IMPORTS_UI.directionLabels[direction];
}

export function labelOptionText(label: {
	name: string;
	direction: DocumentDirection;
}): string {
	return `${label.name}, ${directionLabel(label.direction)}`;
}

export function labelFromChoice(value: string): string | null {
	return value === NO_LABEL ? null : value;
}

export function stageChecklists(
	stages: readonly ImportStageOption[],
	documents: readonly ShipmentDocument[],
): StageChecklist[] {
	return stages
		.filter(
			(stage) =>
				stage.kind !== ImportStageKind.CANCELLED &&
				stage.expectedLabels.length > 0,
		)
		.map((stage) => ({
			key: stage.key,
			name: stage.name,
			...documentChecklist(stage.expectedLabels, documents),
		}));
}

export function missingDocumentsText(
	stage: ImportStageOption | undefined,
	documents: readonly ShipmentDocument[],
): string | null {
	if (!stage) return null;
	const { missing } = documentChecklist(stage.expectedLabels, documents);
	if (missing.length === 0) return null;
	const names = missing.map((label) => label.name).join(", ");
	return `${missing.length === 1 ? "Falta" : "Faltan"}: ${names}. Puedes moverlo igual.`;
}

export function suggestedLabelId(
	stage: ImportStageOption | undefined,
	documents: readonly ShipmentDocument[],
): string | null {
	if (!stage) return null;
	return (
		documentChecklist(stage.expectedLabels, documents).missing[0]?.id ?? null
	);
}

export function eventChoiceText(event: ShipmentEvent): string {
	return `${event.stage.name}, ${formatDay(event.occurredAt)}`;
}

export function fileSizeLabel(bytes: number): string {
	if (bytes < MB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
	return `${sizeFormat.format(bytes / MB)} MB`;
}
