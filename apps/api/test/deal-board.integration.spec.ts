import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { DEAL_BOARD } from "../src/deals/deals-config";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deal-board-spec";
const ownerId = `db-owner-${suffix}`;
const otherId = `db-other-${suffix}`;

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

function column(
	result: Awaited<ReturnType<typeof deals.board>>,
	stage: string,
) {
	const found = result.columns.find((entry) => entry.stage === stage);
	if (!found) throw new Error(`No column for ${stage}.`);
	return found;
}

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{ id: ownerId, name: "Board Owner", email: `${ownerId}@example.test` },
			{ id: otherId, name: "Board Other", email: `${otherId}@example.test` },
		],
	});
	companyId = (
		await db.company.create({
			data: { name: `Board ${suffix}` },
			select: { id: true },
		})
	).id;

	const old = new Date(Date.now() - DEAL_BOARD.closedWindowMs - 86_400_000);
	await db.deal.createMany({
		data: [
			{ name: "Nueva A", companyId, ownerId, stage: "NEW" },
			{ name: "Nueva B", companyId, ownerId, stage: "NEW" },
			{ name: "Ajena", companyId, ownerId: otherId, stage: "NEW" },
			{ name: "Cotizada", companyId, ownerId, stage: "QUOTED" },
			{
				name: "Dormida",
				companyId,
				ownerId,
				stage: "CONTACTED",
				stageChangedAt: new Date(Date.now() - 5 * 86_400_000),
			},
			{
				name: "Activa",
				companyId,
				ownerId,
				stage: "CONTACTED",
				stageChangedAt: new Date(Date.now() - 5 * 86_400_000),
				lastActivityAt: new Date(),
			},
			{
				name: "Ganada reciente",
				companyId,
				ownerId,
				stage: "WON",
				closedAt: new Date(),
			},
			{
				name: "Ganada vieja",
				companyId,
				ownerId,
				stage: "WON",
				closedAt: old,
			},
			{
				name: "Archivada",
				companyId,
				ownerId,
				stage: "NEW",
				archivedAt: new Date(),
			},
		],
	});
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
});

describe("the pipeline board", () => {
	it("has one column per stage, in pipeline order", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);

		expect(result.columns.map((entry) => entry.stage)).toEqual([
			"NEW",
			"CONTACTED",
			"QUALIFIED",
			"QUOTED",
			"NEGOTIATING",
			"WON",
			"LOST",
		]);
	});

	it("puts each deal in its stage and leaves archived ones out", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);

		expect(
			column(result, "NEW")
				.cards.map((card) => card.name)
				.sort(),
		).toEqual(["Nueva A", "Nueva B"]);
		expect(column(result, "QUOTED").total).toBe(1);
	});

	it("shows everyone's deals when asked", async () => {
		const result = await deals.board({ scope: "everyone" }, otherId);

		expect(
			column(result, "NEW").cards.some((card) => card.name === "Nueva A"),
		).toBe(true);
		expect(
			column(result, "NEW").cards.some((card) => card.name === "Ajena"),
		).toBe(true);
	});

	it("filters by owner", async () => {
		const result = await deals.board({ scope: "me" }, otherId);

		expect(column(result, "NEW").cards.map((card) => card.name)).toEqual([
			"Ajena",
		]);
		expect(column(result, "QUOTED").total).toBe(0);
	});

	it("flags a deal with no activity for days and nobody else", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);
		const cards = column(result, "CONTACTED").cards;

		expect(cards.find((card) => card.name === "Dormida")?.idleDays).toBe(5);
		expect(cards.find((card) => card.name === "Activa")?.idleDays).toBeNull();
		expect(
			column(result, "NEW").cards.every((card) => card.idleDays === null),
		).toBe(true);
		expect(
			column(result, "WON").cards.every((card) => card.idleDays === null),
		).toBe(true);
	});

	it("shows only recently closed deals in the closed columns", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);

		expect(column(result, "WON").cards.map((card) => card.name)).toEqual([
			"Ganada reciente",
		]);
	});
});
