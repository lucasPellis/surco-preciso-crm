import { formatDay } from "@crm/ui/lib/format";
import { FUNNEL_CARD } from "./funnel-card-config";

const DIACRITICS = /\p{Diacritic}/gu;

function comparable(value: string): string {
	return value.normalize("NFD").replace(DIACRITICS, "").trim().toLowerCase();
}

export function showCompanyLine(
	dealName: string,
	companyName: string,
): boolean {
	return comparable(dealName) !== comparable(companyName);
}

export function taskLine(task: {
	title: string | null;
	dueAt: string;
	overdue: boolean;
	upcoming?: boolean;
}) {
	const { copy } = FUNNEL_CARD;
	return {
		title: task.title?.trim() || copy.taskFallback,
		hint: task.overdue
			? copy.taskOverdue(formatDay(task.dueAt))
			: task.upcoming
				? copy.taskUpcoming(formatDay(task.dueAt))
				: copy.taskToday,
		overdue: task.overdue,
	};
}
