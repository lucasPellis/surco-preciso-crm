import { ImportStageKind } from "./generated/prisma/enums";
import { isClosedImportKind } from "./import-stage";

const SECOND_MS = 1_000;
const DAY_MS = 86_400 * SECOND_MS;

export const IMPORT_ORDER = {
	numberPrefix: "OC",
	numberPadding: 4,
	supplierNameMaxLength: 120,
	notesMaxLength: 2000,
	referenceMaxLength: 80,
	trackingNumberMaxLength: 80,
	maxLines: 100,
	maxQuantity: 1_000_000,
	optionsLimit: 500,
	maxSplitShipments: 50,
	splitTimeoutMs: 30 * SECOND_MS,
} as const;

export function formatOrderNumber(year: number, sequence: number): string {
	const padded = String(sequence).padStart(IMPORT_ORDER.numberPadding, "0");
	return `${IMPORT_ORDER.numberPrefix}-${year}-${padded}`;
}

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

export type SplitError = "INVALID_SIZE" | "NOTHING_LEFT" | "TOO_MANY";

export type Split =
	| { ok: true; quantities: number[] }
	| { ok: false; error: SplitError };

export function splitCount(remaining: number, perShipment: number): number {
	return Math.ceil(remaining / perShipment);
}

export function splitQuantities(
	remaining: number,
	perShipment: number,
	max: number = IMPORT_ORDER.maxSplitShipments,
): Split {
	if (!Number.isInteger(perShipment) || perShipment < 1) {
		return { ok: false, error: "INVALID_SIZE" };
	}
	if (remaining < 1) return { ok: false, error: "NOTHING_LEFT" };
	const count = splitCount(remaining, perShipment);
	if (count > max) return { ok: false, error: "TOO_MANY" };
	const last = remaining - perShipment * (count - 1);
	return {
		ok: true,
		quantities: Array.from({ length: count }, (_, index) =>
			index === count - 1 ? last : perShipment,
		),
	};
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
