import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { BadRequestException } from "@nestjs/common";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deal-source-spec";
const userId = `ds-user-${suffix}`;

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

let dealId: string;
let companyId: string;
let activeId: string;
let archivedId: string;

beforeAll(async () => {
	await db.user.create({
		data: { id: userId, name: "Source Rep", email: `${userId}@example.test` },
	});
	const company = await db.company.create({
		data: { name: `Deal Source ${suffix}` },
		select: { id: true },
	});
	companyId = company.id;
	const deal = await db.deal.create({
		data: { name: "Source deal", companyId, ownerId: userId },
		select: { id: true },
	});
	dealId = deal.id;
	activeId = (
		await db.leadSource.create({
			data: { key: `ds-${suffix}-on`, name: `On ${suffix}` },
			select: { id: true },
		})
	).id;
	archivedId = (
		await db.leadSource.create({
			data: {
				key: `ds-${suffix}-off`,
				name: `Off ${suffix}`,
				archivedAt: new Date(),
			},
			select: { id: true },
		})
	).id;
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.leadSource.deleteMany({
		where: { id: { in: [activeId, archivedId] } },
	});
	await db.user.deleteMany({ where: { id: userId } });
});

describe("the source of a deal", () => {
	it("starts unknown, then a rep sets it", async () => {
		expect((await deals.byId(dealId)).leadSource).toBeNull();

		await deals.update(dealId, { leadSourceId: activeId });

		expect((await deals.byId(dealId)).leadSource?.id).toBe(activeId);
	});

	it("refuses an archived source", async () => {
		await expect(
			deals.update(dealId, { leadSourceId: archivedId }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("goes back to unknown when a rep clears it", async () => {
		await deals.update(dealId, { leadSourceId: null });

		expect((await deals.byId(dealId)).leadSource).toBeNull();
	});
});
