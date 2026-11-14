import { describe, expect, it } from "bun:test";
import { QUALIFICATION_KEYS } from "@crm/db/qualification";
import type { RecordFieldEntry } from "../components/crm/fields/record-fields";
import {
	daysInStage,
	daysInStageLabel,
	orderContacts,
	sheetTabs,
	splitQualification,
} from "../lib/deal-sheet";
import { DEAL_SHEET } from "../lib/deal-sheet-config";
import { taskLine } from "../lib/funnel-card";

function field(
	key: string,
	value: RecordFieldEntry["value"] = null,
): RecordFieldEntry {
	return {
		id: key,
		key,
		label: key,
		type: "TEXT",
		showOnSheet: true,
		options: [],
		value,
	};
}

describe("which tabs show", () => {
	it("hides the contacts tab with fewer than two contacts", () => {
		expect(sheetTabs(0)).not.toContain("contacts");
		expect(sheetTabs(1)).not.toContain("contacts");
		expect(sheetTabs(2)).toContain("contacts");
	});

	it("keeps the agent tab behind the flag", () => {
		expect(DEAL_SHEET.tabs.agent).toBe(false);
		expect(sheetTabs(5)).not.toContain("agent");
		expect(sheetTabs(5)).toEqual(["overview", "contacts", "activity"]);
	});
});

describe("the qualification split", () => {
	const [first, second] = QUALIFICATION_KEYS;
	const fields = [
		field("monto_extra", "x"),
		field(second ?? "", "Contado"),
		field(first ?? "", null),
	];

	it("separates the questions from the other fields, in question order", () => {
		const split = splitQualification(fields);

		expect(split.questions.map((entry) => entry.key)).toEqual([
			first ?? "",
			second ?? "",
		]);
		expect(split.rest.map((entry) => entry.key)).toEqual(["monto_extra"]);
	});

	it("counts the answered questions", () => {
		const split = splitQualification(fields);

		expect(split.answered).toBe(1);
		expect(split.total).toBe(2);
		expect(split.complete).toBe(false);
	});

	it("is complete only when every question has an answer", () => {
		const done = splitQualification([
			field(first ?? "", "a"),
			field(second ?? "", "b"),
		]);

		expect(done.complete).toBe(true);
		expect(splitQualification([field("otro", "x")]).total).toBe(0);
		expect(splitQualification([field("otro", "x")]).complete).toBe(false);
	});

	it("treats an empty string as unanswered", () => {
		expect(splitQualification([field(first ?? "", "")]).answered).toBe(0);
	});
});

describe("days in the stage", () => {
	const now = new Date("2026-11-14T12:00:00Z");

	it("counts whole days and never goes below zero", () => {
		expect(daysInStage("2026-11-11T12:00:00Z", now)).toBe(3);
		expect(daysInStage("2026-11-14T08:00:00Z", now)).toBe(0);
		expect(daysInStage("2026-11-20T12:00:00Z", now)).toBe(0);
	});

	it("words the label in neutral Spanish", () => {
		expect(daysInStageLabel("2026-11-14T08:00:00Z", now)).toBe(
			"Hoy en esta etapa",
		);
		expect(daysInStageLabel("2026-11-13T12:00:00Z", now)).toBe(
			"1 día en esta etapa",
		);
		expect(daysInStageLabel("2026-11-09T12:00:00Z", now)).toBe(
			"5 días en esta etapa",
		);
	});
});

describe("the contact order", () => {
	const contacts = [
		{ id: "c", phone: null, createdAt: "2026-01-01T00:00:00Z" },
		{ id: "b", phone: "+54911", createdAt: "2026-03-01T00:00:00Z" },
		{ id: "a", phone: "+54922", createdAt: "2026-02-01T00:00:00Z" },
	];

	it("puts the company primary contact first", () => {
		expect(orderContacts(contacts, "b").map((entry) => entry.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});

	it("falls back to the earliest created contact with a phone", () => {
		expect(orderContacts(contacts, null).map((entry) => entry.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});
});

describe("the next step line", () => {
	it("reuses the funnel card wording and adds the upcoming hint", () => {
		expect(
			taskLine({ title: "Llamar", dueAt: "2026-11-14", overdue: false }).hint,
		).toBe("Hoy");
		expect(
			taskLine({
				title: "Llamar",
				dueAt: "2026-11-20",
				overdue: false,
				upcoming: true,
			}).hint,
		).toStartWith("Para el");
		expect(
			taskLine({
				title: "Llamar",
				dueAt: "2026-11-10",
				overdue: true,
				upcoming: false,
			}).hint,
		).toStartWith("Vencida");
	});
});

describe("the sheet placeholders", () => {
	it("never use a value that reads like saved data", () => {
		expect(Number.isNaN(Number(DEAL_SHEET.copy.amountPlaceholder))).toBe(true);
		expect(DEAL_SHEET.copy.descriptionPlaceholder.length).toBeLessThan(40);
	});
});
