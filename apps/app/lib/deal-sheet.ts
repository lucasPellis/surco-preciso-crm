import { QUALIFICATION_KEYS } from "@crm/db/qualification";
import type { RecordFieldEntry } from "@/components/crm/fields/record-fields";
import { DEAL_SHEET } from "./deal-sheet-config";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SheetTabId = "overview" | "contacts" | "activity" | "agent";

export function sheetTabs(contactCount: number): SheetTabId[] {
	return [
		"overview",
		...(contactCount >= DEAL_SHEET.tabs.contactsMinimum
			? (["contacts"] as const)
			: []),
		"activity",
		...(DEAL_SHEET.tabs.agent ? (["agent"] as const) : []),
	];
}

function isAnswered(value: RecordFieldEntry["value"]): boolean {
	return value !== null && value !== "";
}

export function splitQualification(fields: RecordFieldEntry[]) {
	const questions = QUALIFICATION_KEYS.flatMap((key) =>
		fields.filter((field) => field.key === key),
	);
	const answered = questions.filter((field) => isAnswered(field.value)).length;

	return {
		questions,
		rest: fields.filter((field) => !QUALIFICATION_KEYS.includes(field.key)),
		answered,
		total: questions.length,
		complete: questions.length > 0 && answered === questions.length,
	};
}

export function daysInStage(stageChangedAt: string, now: Date): number {
	return Math.max(
		Math.floor((now.getTime() - new Date(stageChangedAt).getTime()) / DAY_MS),
		0,
	);
}

export function daysInStageLabel(stageChangedAt: string, now: Date): string {
	const days = daysInStage(stageChangedAt, now);
	return days === 0
		? DEAL_SHEET.copy.stage.sinceToday
		: DEAL_SHEET.copy.stage.days(days);
}

type SheetContact = {
	id: string;
	phone: string | null;
	createdAt: string;
};

export function orderContacts<Contact extends SheetContact>(
	contacts: Contact[],
	primaryContactId: string | null,
): Contact[] {
	const rank = (contact: Contact) =>
		contact.id === primaryContactId ? 0 : contact.phone ? 1 : 2;

	return [...contacts].sort(
		(a, b) =>
			rank(a) - rank(b) ||
			a.createdAt.localeCompare(b.createdAt) ||
			a.id.localeCompare(b.id),
	);
}
