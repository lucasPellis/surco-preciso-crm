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
	withLeadTimes,
} from "../src/import-order";

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
