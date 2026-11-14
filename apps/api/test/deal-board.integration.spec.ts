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

const customKey = `VISIT_${suffix}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

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

	await db.pipelineStage.create({
		data: {
			key: customKey,
			name: "Visita técnica",
			kind: "OPEN",
			position: 900,
			idleAfterHours: 48,
		},
	});

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
				name: "Nueva tarde",
				companyId,
				ownerId,
				stage: "NEW",
				stageChangedAt: new Date(Date.now() - 30 * 3_600_000),
			},
			{
				name: "Callada",
				companyId,
				ownerId,
				stage: "NO_RESPONSE",
				stageChangedAt: new Date(Date.now() - 30 * 86_400_000),
			},
			{
				name: "Custom 50h",
				companyId,
				ownerId,
				stage: customKey,
				stageChangedAt: new Date(Date.now() - 50 * 3_600_000),
			},
			{
				name: "Custom 47h",
				companyId,
				ownerId,
				stage: customKey,
				stageChangedAt: new Date(Date.now() - 47 * 3_600_000),
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
	if (companyId) await db.deal.deleteMany({ where: { companyId } });
	await db.pipelineStage.deleteMany({ where: { key: customKey } });
	if (companyId) await db.company.deleteMany({ where: { id: companyId } });
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
			"NO_RESPONSE",
			"WON",
			"LOST",
			customKey,
		]);
	});

	it("leaves an archived stage off the board", async () => {
		await db.pipelineStage.update({
			where: { key: customKey },
			data: { archivedAt: new Date() },
		});

		try {
			const result = await deals.board({ scope: "me" }, ownerId);
			expect(result.columns.some((entry) => entry.stage === customKey)).toBe(
				false,
			);
		} finally {
			await db.pipelineStage.update({
				where: { key: customKey },
				data: { archivedAt: null },
			});
		}
	});

	it("shows a custom stage in its position, after the seeded ones", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);
		const keys = result.columns.map((entry) => entry.stage);

		expect(keys.indexOf(customKey)).toBeGreaterThan(keys.indexOf("LOST"));
		expect(column(result, customKey).total).toBe(2);
	});

	it("puts each deal in its stage and leaves archived ones out", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);

		expect(
			column(result, "NEW")
				.cards.map((card) => card.name)
				.sort(),
		).toEqual(["Nueva A", "Nueva B", "Nueva tarde"]);
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

		expect(cards.find((card) => card.name === "Dormida")?.idleHours).toBe(120);
		expect(cards.find((card) => card.name === "Activa")?.idleHours).toBeNull();
		expect(
			column(result, "NEW")
				.cards.filter((card) => card.name !== "Nueva tarde")
				.every((card) => card.idleHours === null),
		).toBe(true);
		expect(
			column(result, "WON").cards.every((card) => card.idleHours === null),
		).toBe(true);
	});

	it("uses the idle hours of each stage", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);

		expect(
			column(result, "NEW").cards.find((card) => card.name === "Nueva tarde")
				?.idleHours,
		).toBe(30);
		const custom = column(result, customKey).cards;
		expect(custom.find((card) => card.name === "Custom 50h")?.idleHours).toBe(
			50,
		);
		expect(
			custom.find((card) => card.name === "Custom 47h")?.idleHours,
		).toBeNull();
	});

	it("never flags a paused deal", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);
		const card = column(result, "NO_RESPONSE").cards.find(
			(entry) => entry.name === "Callada",
		);

		expect(card).toBeDefined();
		expect(card?.idleHours).toBeNull();
	});

	it("shows only recently closed deals in the closed columns", async () => {
		const result = await deals.board({ scope: "me" }, ownerId);

		expect(column(result, "WON").cards.map((card) => card.name)).toEqual([
			"Ganada reciente",
		]);
	});
});
