import { ImportStageKind } from "./generated/prisma/enums";
import { isClosedImportKind } from "./import-stage";

const DAY_MS = 86_400_000;

export const IMPORT_ORDER = {
	numberMaxLength: 40,
	supplierNameMaxLength: 120,
	notesMaxLength: 2000,
	referenceMaxLength: 80,
	trackingNumberMaxLength: 80,
	maxLines: 100,
	maxQuantity: 1_000_000,
	optionsLimit: 500,
} as const;

export type ShippedPart = { quantity: number; kind: ImportStageKind };

export type LineProgress = {
	shipped: number;
	received: number;
	remaining: number;
};

export type StageStep = { kind: ImportStageKind; occurredAt: Date };

export type LeadTime = { days: number | null; running: boolean };

export function countsTowardOrdered(kind: ImportStageKind): boolean {
	return kind !== ImportStageKind.CANCELLED;
}

export function lineProgress(
	ordered: number,
	parts: readonly ShippedPart[],
): LineProgress {
	const shipped = parts
		.filter((part) => countsTowardOrdered(part.kind))
		.reduce((sum, part) => sum + part.quantity, 0);
	const received = parts
		.filter((part) => part.kind === ImportStageKind.RECEIVED)
		.reduce((sum, part) => sum + part.quantity, 0);

	return { shipped, received, remaining: ordered - shipped };
}

export function isoDay(value: Date): string {
	return value.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
	return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function withLeadTimes<Step extends StageStep>(
	steps: readonly Step[],
	today: Date,
): Array<Step & LeadTime> {
	return steps.map((step, index) => {
		const next = steps[index + 1];
		if (next) {
			return {
				...step,
				days: daysBetween(step.occurredAt, next.occurredAt),
				running: false,
			};
		}
		if (isClosedImportKind(step.kind)) {
			return { ...step, days: null, running: false };
		}
		return {
			...step,
			days: daysBetween(step.occurredAt, today),
			running: true,
		};
	});
}

export function receivedAfterDays(
	orderedAt: Date,
	steps: readonly StageStep[],
): number | null {
	const received = steps.find((step) => step.kind === ImportStageKind.RECEIVED);
	return received ? daysBetween(orderedAt, received.occurredAt) : null;
}
