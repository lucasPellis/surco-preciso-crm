import { ActivityType, type Prisma } from "@crm/db";
import { taskDayBoundaries } from "../activities/task-due-date";
import { DEAL_BOARD, NEW_LEAD } from "./deals-config";

export async function openLeadDeal(
	tx: Prisma.TransactionClient,
	lead: {
		name: string;
		companyId: string;
		contactId: string;
		ownerId: string;
		leadSourceId: string | null;
		now: Date;
	},
): Promise<string> {
	const deal = await tx.deal.create({
		data: {
			name: lead.name,
			companyId: lead.companyId,
			ownerId: lead.ownerId,
			leadSourceId: lead.leadSourceId,
			contacts: { create: { contactId: lead.contactId } },
		},
		select: { id: true },
	});

	const { startOfToday } = taskDayBoundaries(lead.now);
	await tx.activity.create({
		data: {
			type: ActivityType.TASK,
			subject: NEW_LEAD.followUpSubject,
			occurredAt: lead.now,
			dueAt: new Date(
				startOfToday.getTime() + NEW_LEAD.followUpDueInDays * DEAL_BOARD.dayMs,
			),
			companyId: lead.companyId,
			contactId: lead.contactId,
			dealId: deal.id,
			createdById: lead.ownerId,
		},
	});

	return deal.id;
}
