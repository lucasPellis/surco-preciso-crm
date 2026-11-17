import { describe, expect, it } from "bun:test";
import { ImportStageKind } from "../src/generated/prisma/enums";
import {
	countsTowardOrdered,
	daysBetween,
	formatOrderNumber,
	IMPORT_ORDER,
	isoDay,
	lineProgress,
	receivedAfterDays,
	splitCount,
	splitQuantities,
	withLeadTimes,
} from "../src/import-order";

const units = (count: number, quantity: number) =>
	Array.from({ length: count }, () => quantity);

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const TODAY = day("2026-03-01");

describe("line progress", () => {
	it("counts shipped and received units and what is left", () => {
		expect(
			lineProgress(10, [
				{ quantity: 4, kind: ImportStageKind.RECEIVED },
				{ quantity: 4, kind: ImportStageKind.IN_PROGRESS },
			]),
		).toEqual({ shipped: 8, received: 4, remaining: 2 });
	});

	it("frees the units of a cancelled shipment", () => {
		expect(
			lineProgress(10, [
				{ quantity: 6, kind: ImportStageKind.CANCELLED },
				{ quantity: 3, kind: ImportStageKind.IN_PROGRESS },
			]),
		).toEqual({ shipped: 3, received: 0, remaining: 7 });
		expect(countsTowardOrdered(ImportStageKind.CANCELLED)).toBe(false);
		expect(countsTowardOrdered(ImportStageKind.RECEIVED)).toBe(true);
		expect(countsTowardOrdered(ImportStageKind.IN_PROGRESS)).toBe(true);
	});

	it("leaves the whole line when nothing shipped", () => {
		expect(lineProgress(5, [])).toEqual({
			shipped: 0,
			received: 0,
			remaining: 5,
		});
	});
});

describe("days", () => {
	it("counts calendar days between two UTC days", () => {
		expect(daysBetween(day("2026-01-10"), day("2026-02-01"))).toBe(22);
		expect(daysBetween(day("2026-01-10"), day("2026-01-10"))).toBe(0);
		expect(isoDay(day("2026-03-01"))).toBe("2026-03-01");
	});
});

describe("lead times", () => {
	it("measures each stage until the next one and the open stage until today", () => {
		const steps = withLeadTimes(
			[
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-20") },
			],
			TODAY,
		);

		expect(steps.map(({ days, running }) => ({ days, running }))).toEqual([
			{ days: 10, running: false },
			{ days: 40, running: true },
		]);
	});

	it("stops the clock at a closed stage", () => {
		const steps = withLeadTimes(
			[
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
				{ kind: ImportStageKind.RECEIVED, occurredAt: day("2026-02-01") },
			],
			TODAY,
		);

		expect(steps.map(({ days, running }) => ({ days, running }))).toEqual([
			{ days: 22, running: false },
			{ days: null, running: false },
		]);
	});

	it("keeps the other fields of each step", () => {
		const [first] = withLeadTimes(
			[
				{
					kind: ImportStageKind.IN_PROGRESS,
					occurredAt: day("2026-02-28"),
					stageKey: "ORDERED",
				},
			],
			TODAY,
		);

		expect(first?.stageKey).toBe("ORDERED");
		expect(first?.days).toBe(1);
	});

	it("measures from the order day to the received day", () => {
		expect(
			receivedAfterDays(day("2026-01-05"), [
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
				{ kind: ImportStageKind.RECEIVED, occurredAt: day("2026-02-01") },
			]),
		).toBe(27);
		expect(
			receivedAfterDays(day("2026-01-05"), [
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
			]),
		).toBeNull();
	});
});

describe("IMPORT_ORDER", () => {
	it("keeps every limit positive", () => {
		const { numberPrefix: _prefix, ...limits } = IMPORT_ORDER;
		for (const value of Object.values(limits)) {
			expect(value).toBeGreaterThan(0);
		}
	});
});

describe("formatOrderNumber", () => {
	it("pads the sequence to four digits", () => {
		expect(formatOrderNumber(2026, 1)).toBe("OC-2026-0001");
		expect(formatOrderNumber(2026, 42)).toBe("OC-2026-0042");
	});

	it("grows past four digits", () => {
		expect(formatOrderNumber(2027, 9999)).toBe("OC-2027-9999");
		expect(formatOrderNumber(2027, 10000)).toBe("OC-2027-10000");
	});
});

describe("splitQuantities", () => {
	it("makes one shipment per unit", () => {
		expect(splitQuantities(10, 1)).toEqual({
			ok: true,
			quantities: units(10, 1),
		});
	});

	it("gives the rest to the last shipment", () => {
		expect(splitQuantities(10, 3)).toEqual({
			ok: true,
			quantities: [3, 3, 3, 1],
		});
		expect(splitQuantities(10, 5)).toEqual({ ok: true, quantities: [5, 5] });
	});

	it("makes one shipment when the size passes what is left", () => {
		expect(splitQuantities(4, 5)).toEqual({ ok: true, quantities: [4] });
	});

	it("allows the limit and refuses one more", () => {
		expect(splitQuantities(50, 1)).toEqual({
			ok: true,
			quantities: units(50, 1),
		});
		expect(splitQuantities(51, 1)).toEqual({ ok: false, error: "TOO_MANY" });
		expect(splitQuantities(51, 1, 60)).toEqual({
			ok: true,
			quantities: units(51, 1),
		});
		expect(splitCount(51, 1)).toBe(51);
		expect(IMPORT_ORDER.maxSplitShipments).toBe(50);
	});

	it("refuses a size that is not a positive whole number and a line with nothing left", () => {
		for (const size of [0, -1, 1.5]) {
			expect(splitQuantities(10, size)).toEqual({
				ok: false,
				error: "INVALID_SIZE",
			});
		}
		expect(splitQuantities(0, 1)).toEqual({ ok: false, error: "NOTHING_LEFT" });
	});
});
