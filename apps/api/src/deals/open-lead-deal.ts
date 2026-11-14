import { ActivityType, type Prisma } from "@crm/db";
import { entryStage } from "@crm/db/deal-stage";
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
): Promise<{ id: string; stage: string }> {
	const entry = await entryStage(tx);
	const deal = await tx.deal.create({
		data: {
			name: lead.name,
			companyId: lead.companyId,
			ownerId: lead.ownerId,
			stage: entry.key,
			leadSourceId: lead.leadSourceId,
			lastActivityAt: lead.now,
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
			createdAt: lead.now,
			dueAt: new Date(
				startOfToday.getTime() + NEW_LEAD.followUpDueInDays * DEAL_BOARD.dayMs,
			),
			companyId: lead.companyId,
			contactId: lead.contactId,
			dealId: deal.id,
			createdById: lead.ownerId,
		},
	});

	await tx.contact.update({
		where: { id: lead.contactId },
		data: { lastActivityAt: lead.now },
	});
	await tx.company.updateMany({
		where: {
			id: lead.companyId,
			OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: lead.now } }],
		},
		data: { lastActivityAt: lead.now },
	});

	return { id: deal.id, stage: entry.key };
}
