import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { BadRequestException } from "@nestjs/common";
import type { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { companyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { dealListInput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deal-stages-spec";
const ownerId = `ds-owner-${suffix}`;
const retiredKey = `RETIRED_${suffix}`
	.toUpperCase()
	.replace(/[^A-Z0-9_]/g, "_");

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

const stamp = new ActivityStampService(db);
const conversion = new ConversionService(db);
const fieldsService = new FieldsService(db, {
	fieldBackfill: async () => undefined,
} as never);
const companies = new CompaniesService(
	db,
	agent,
	{
		queuedCompanies: async () => new Set<string>(),
	} as unknown as AgentQueueService,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fieldsService,
);
const dashboard = new DashboardService(db, conversion);

let companyId: string;

async function newDeal(name: string, stage?: string) {
	return deals.create({ name, companyId, ownerId, stage });
}

async function contactedAt(id: string) {
	const row = await db.deal.findUniqueOrThrow({
		where: { id },
		select: { firstContactedAt: true },
	});
	return row.firstContactedAt;
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: ownerId,
			name: "Stages Owner",
			email: `${ownerId}@example.test`,
		},
	});
	companyId = (
		await db.company.create({
			data: { name: `Stages ${suffix}` },
			select: { id: true },
		})
	).id;
	await db.pipelineStage.create({
		data: {
			key: retiredKey,
			name: "Retirada",
			kind: "OPEN",
			position: 99,
			archivedAt: new Date(),
		},
	});
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: ownerId } });
	await db.pipelineStage.deleteMany({ where: { key: retiredKey } });
});

describe("the stage list", () => {
	it("keeps the seven stages the enum had and adds the paused one", async () => {
		const stages = await deals.stages(false);

		expect(stages.map((stage) => [stage.key, stage.kind])).toEqual([
			["NEW", "OPEN"],
			["CONTACTED", "OPEN"],
			["QUALIFIED", "OPEN"],
			["QUOTED", "OPEN"],
			["NEGOTIATING", "OPEN"],
			["NO_RESPONSE", "PAUSED"],
			["WON", "WON"],
			["LOST", "LOST"],
		]);
		expect(stages.filter((stage) => stage.isEntry).map((s) => s.key)).toEqual([
			"NEW",
		]);
	});

	it("hides an archived stage unless asked", async () => {
		expect((await deals.stages(false)).some((s) => s.key === retiredKey)).toBe(
			false,
		);
		expect((await deals.stages(true)).some((s) => s.key === retiredKey)).toBe(
			true,
		);
	});

	it("allows one entry stage only", async () => {
		const second = async () =>
			db.pipelineStage.create({
				data: {
					key: `SECOND_${suffix}`,
					name: "Otra",
					kind: "OPEN",
					isEntry: true,
				},
			});

		await expect(second()).rejects.toThrow();
	});
});

describe("first contact", () => {
	it("starts empty on a new lead", async () => {
		const deal = await newDeal("Nuevo sin contacto");

		expect(await contactedAt(deal.id)).toBeNull();
	});

	it("is set when the deal leaves the entry stage for an open stage", async () => {
		const deal = await newDeal("Contactado");
		await deals.setStage({ id: deal.id, stage: "CONTACTED" }, ownerId);

		expect(await contactedAt(deal.id)).toBeInstanceOf(Date);
	});

	it("is set when the deal leaves the entry stage for a paused stage", async () => {
		const deal = await newDeal("Sin respuesta");
		await deals.setStage({ id: deal.id, stage: "NO_RESPONSE" }, ownerId);

		expect(await contactedAt(deal.id)).toBeInstanceOf(Date);
	});

	it("is never set by a loss", async () => {
		const deal = await newDeal("Perdido de entrada");
		await deals.setStage(
			{ id: deal.id, stage: "LOST", closedReason: "No le interesa" },
			ownerId,
		);
		await deals.setStage({ id: deal.id, stage: "CONTACTED" }, ownerId);

		expect(await contactedAt(deal.id)).toBeNull();
	});

	it("is set once and never moves", async () => {
		const deal = await newDeal("Una sola vez");
		await deals.setStage({ id: deal.id, stage: "CONTACTED" }, ownerId);
		const first = await contactedAt(deal.id);
		await db.deal.update({
			where: { id: deal.id },
			data: { stage: "NEW" },
		});
		await deals.setStage({ id: deal.id, stage: "QUALIFIED" }, ownerId);

		expect(await contactedAt(deal.id)).toEqual(first);
	});

	it("is not set when a deal is created outside the entry stage", async () => {
		const deal = await newDeal("Creado cotizado", "QUOTED");

		expect(await contactedAt(deal.id)).toBeNull();
	});
});

describe("choosing a stage", () => {
	it("refuses an unknown stage", async () => {
		const deal = await newDeal("Etapa inexistente");

		await expect(
			deals.setStage({ id: deal.id, stage: "NOPE" }, ownerId),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived stage when moving and when creating", async () => {
		const deal = await newDeal("Etapa archivada");

		await expect(
			deals.setStage({ id: deal.id, stage: retiredKey }, ownerId),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(newDeal("Crear archivada", retiredKey)).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await expect(
			deals.bulkSetStage({ ids: [deal.id], stage: retiredKey }, ownerId),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("still asks for a reason on every losing stage", async () => {
		const deal = await newDeal("Sin motivo");

		await expect(
			deals.setStage({ id: deal.id, stage: "LOST" }, ownerId),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});

describe("grouping by kind", () => {
	async function names(status: string) {
		const result = await deals.list(
			dealListInput.parse({ status, q: `Kind ${suffix}`, pageSize: 100 }),
		);
		return result.rows.map((row) => row.name);
	}

	it("counts only open stages as open and leaves paused ones out", async () => {
		const open = await newDeal(`Kind ${suffix} abierto`);
		const paused = await newDeal(`Kind ${suffix} pausado`);
		await deals.setStage({ id: paused.id, stage: "NO_RESPONSE" }, ownerId);
		const won = await newDeal(`Kind ${suffix} ganado`);
		await deals.setStage({ id: won.id, stage: "WON" }, ownerId);

		expect(await names("all")).toHaveLength(3);
		expect(await names("open")).toEqual([open.name]);
		expect(await names("closed")).toEqual([won.name]);
	});
});

describe("a deal in an archived stage", () => {
	it("can still be moved out of it", async () => {
		const deal = await db.deal.create({
			data: {
				name: "Vive en etapa retirada",
				companyId,
				ownerId,
				stage: retiredKey,
			},
			select: { id: true },
		});

		const result = await deals.setStage(
			{ id: deal.id, stage: "CONTACTED" },
			ownerId,
		);

		expect(result.changed).toBe(true);
		expect(result.stage).toBe("CONTACTED");
		expect(await contactedAt(deal.id)).toBeNull();
	});
});

describe("moving many deals", () => {
	it("sets first contact under the same rules as moving one", async () => {
		const first = await newDeal("Bulk uno");
		const second = await newDeal("Bulk dos");
		const lost = await newDeal("Bulk perdido");

		await deals.bulkSetStage(
			{ ids: [first.id, second.id], stage: "CONTACTED" },
			ownerId,
		);
		await deals.bulkSetStage(
			{ ids: [lost.id], stage: "LOST", closedReason: "No responde" },
			ownerId,
		);

		expect(await contactedAt(first.id)).toBeInstanceOf(Date);
		expect(await contactedAt(second.id)).toBeInstanceOf(Date);
		expect(await contactedAt(lost.id)).toBeNull();
	});
});

describe("open totals", () => {
	async function openDealCount() {
		const result = await companies.list(
			companyListInput.parse({ q: `Stages ${suffix}` }),
		);
		return result.rows.find((entry) => entry.id === companyId)?.openDealCount;
	}

	it("leave a paused deal out of the dashboard and the company list", async () => {
		const owner = `ds-totals-${suffix}`;
		await db.user.create({
			data: { id: owner, name: "Totals", email: `${owner}@example.test` },
		});

		try {
			await deals.create({ name: "Abierta", companyId, ownerId: owner });
			const paused = await deals.create({
				name: "Pausada",
				companyId,
				ownerId: owner,
			});
			const before = await openDealCount();
			await deals.setStage({ id: paused.id, stage: "NO_RESPONSE" }, owner);

			const summary = await dashboard.summary(owner, { scope: "me" });

			expect(summary.pipeline.totalDeals).toBe(1);
			expect(await openDealCount()).toBe((before ?? 0) - 1);
		} finally {
			await db.deal.deleteMany({ where: { ownerId: owner } });
			await db.user.deleteMany({ where: { id: owner } });
		}
	});
});
