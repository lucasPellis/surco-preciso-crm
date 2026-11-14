import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { taskDayBoundaries } from "../src/activities/task-due-date";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { dealDetailOutput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8);
const ownerId = `dds-owner-${suffix}`;
const DAY_MS = 86_400_000;
const { startOfToday } = taskDayBoundaries(new Date());
const day = (offset: number) =>
	new Date(startOfToday.getTime() + offset * DAY_MS);

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
	fieldBackfillRecords: async () => ({ queued: 0, merged: 0 }),
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

let companyId: string;
let dealId: string;
let primaryId: string;

const detail = async () =>
	expectOutput(dealDetailOutput, await deals.byId(dealId));

async function task(subject: string, dueAt: Date | null, done = false) {
	await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject,
			dueAt,
			completedAt: done ? new Date() : null,
			companyId,
			dealId,
			createdById: ownerId,
		},
	});
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: ownerId,
			name: "Sheet Owner",
			email: `${ownerId}@example.test`,
		},
	});
	companyId = (
		await db.company.create({
			data: { name: `Sheet company ${suffix}` },
			select: { id: true },
		})
	).id;
	dealId = (
		await db.deal.create({
			data: {
				name: `Sheet deal ${suffix}`,
				companyId,
				ownerId,
				stage: "CONTACTED",
				stageChangedAt: day(-10),
				lastActivityAt: day(-10),
			},
			select: { id: true },
		})
	).id;
	primaryId = (
		await db.contact.create({
			data: { firstName: "Ana", companyId, phone: "+5491100000001" },
			select: { id: true },
		})
	).id;
	await db.company.update({
		where: { id: companyId },
		data: { primaryContactId: primaryId },
	});
	await db.dealContact.create({ data: { dealId, contactId: primaryId } });
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.activity.deleteMany({ where: { companyId } });
	await db.company.update({
		where: { id: companyId },
		data: { primaryContactId: null },
	});
	await db.contact.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: ownerId } });
});

describe("the deal detail for the side sheet", () => {
	it("has no next task while the deal has no open task", async () => {
		expect((await detail()).nextTask).toBeNull();
	});

	it("returns the earliest open task and ignores done and undated ones", async () => {
		await task("Hecha", day(-5), true);
		await task("Sin fecha", null);
		await task("Futura", day(3));
		await task("Vencida", day(-2));

		const next = (await detail()).nextTask;

		expect(next?.title).toBe("Vencida");
		expect(next?.overdue).toBe(true);
		expect(next?.upcoming).toBe(false);
	});

	it("marks a task due after today as upcoming", async () => {
		await db.activity.deleteMany({ where: { dealId, subject: "Vencida" } });

		const next = (await detail()).nextTask;

		expect(next?.title).toBe("Futura");
		expect(next?.overdue).toBe(false);
		expect(next?.upcoming).toBe(true);
	});

	it("reports the idle hours of an open stage past its threshold", async () => {
		const idle = (await detail()).idleHours;

		expect(idle).not.toBeNull();
		expect(idle ?? 0).toBeGreaterThanOrEqual(24 * 10);
	});

	it("has no idle hours on a closed deal", async () => {
		await db.deal.update({ where: { id: dealId }, data: { stage: "WON" } });
		try {
			expect((await detail()).idleHours).toBeNull();
		} finally {
			await db.deal.update({
				where: { id: dealId },
				data: { stage: "CONTACTED" },
			});
		}
	});

	it("returns the phone and creation date of each contact and the company primary contact", async () => {
		const result = await detail();

		expect(result.company.primaryContactId).toBe(primaryId);
		expect(result.contacts[0]?.phone).toBe("+5491100000001");
		expect(result.contacts[0]?.createdAt).toBeString();
	});
});
