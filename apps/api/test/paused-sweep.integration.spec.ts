import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { ActivityType, db, type Prisma } from "@crm/db";
import { PIPELINE_STAGE } from "@crm/db/pipeline-stage";
import { workspaceSlug } from "@crm/db/workspace";
import { BadRequestException } from "@nestjs/common";
import type {
	AgentTriggerService,
	CrmEventInput,
} from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { PAUSED_SWEEP } from "../src/deals/deals-config";
import {
	createStageInput,
	stageSettingsOutput,
	updateStageInput,
} from "../src/deals/pipeline-stages.contracts";
import { PipelineStagesService } from "../src/deals/pipeline-stages.service";
import { FieldsService } from "../src/fields/fields.service";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8);
const adminId = `sweep-admin-${suffix}`;
const ownerId = `sweep-owner-${suffix}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const label = (name: string) => `${name} ${suffix}`;

const emitted: CrmEventInput[] = [];

const agent = {
	withCrmEvents: <Result>(
		work: (
			tx: Prisma.TransactionClient,
			emit: (input: CrmEventInput) => Promise<void>,
		) => Promise<Result>,
	) =>
		db.$transaction((tx) =>
			work(tx, async (input) => {
				emitted.push(input);
			}),
		),
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);
const stages = new PipelineStagesService(db, agent, deals);

let companyId: string;
const createdKeys: string[] = [];

async function pausedStage(name: string, autoLoseAfterDays: number | null) {
	const result = expectOutput(
		stageSettingsOutput,
		await stages.create(
			adminId,
			createStageInput.parse({
				name: label(name),
				kind: "PAUSED",
				autoLoseAfterDays,
			}),
		),
	);
	const row = result.stages.find((stage) => stage.name === label(name));
	if (!row) throw new Error(`No stage called ${name}.`);
	createdKeys.push(row.key);
	return row;
}

async function dealIn(
	name: string,
	stage: string,
	daysAgo: number,
	extra: Partial<Prisma.DealUncheckedCreateInput> = {},
) {
	return db.deal.create({
		data: {
			name: label(name),
			companyId,
			ownerId,
			stage,
			stageChangedAt: new Date(Date.now() - daysAgo * DAY_MS),
			...extra,
		},
		select: { id: true },
	});
}

async function stageOf(id: string) {
	return db.deal.findUniqueOrThrow({
		where: { id },
		select: {
			stage: true,
			closedReason: true,
			closedAt: true,
			stageChangedAt: true,
		},
	});
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{ id: adminId, name: "Sweep Admin", email: `${adminId}@example.test` },
			{ id: ownerId, name: "Sweep Owner", email: `${ownerId}@example.test` },
		],
	});
	await db.member.create({
		data: {
			id: `m-${adminId}`,
			organizationId: WORKSPACE_ID,
			userId: adminId,
			role: "admin",
			createdAt: new Date(),
		},
	});
	companyId = (
		await db.company.create({
			data: { name: label("Sweep company") },
			select: { id: true },
		})
	).id;
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.activity.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.pipelineStage.deleteMany({ where: { key: { in: createdKeys } } });
	await db.member.deleteMany({ where: { userId: adminId } });
	await db.user.deleteMany({ where: { id: { in: [adminId, ownerId] } } });
});

describe("the paused deal sweep", () => {
	it("moves an overdue paused deal to lost with the system reason", async () => {
		const stage = await pausedStage("Pausa vencida", 7);
		const overdue = await dealIn("Vencida", stage.key, 8);
		emitted.length = 0;

		const result = await deals.losePaused(new Date());

		expect(result.succeeded).toBeGreaterThanOrEqual(1);
		const after = await stageOf(overdue.id);
		expect(after.stage).toBe("LOST");
		expect(after.closedReason).toBe(PAUSED_SWEEP.lostReason);
		expect(after.closedAt).not.toBeNull();
		expect(Date.now() - after.stageChangedAt.getTime()).toBeLessThan(60_000);

		const activities = await db.activity.findMany({
			where: { dealId: overdue.id, type: ActivityType.STAGE_CHANGE },
			select: { meta: true, body: true, createdById: true },
		});
		expect(activities).toHaveLength(1);
		expect(activities[0]?.meta).toEqual({ from: stage.key, to: "LOST" });
		expect(activities[0]?.body).toBe(PAUSED_SWEEP.lostReason);
		expect(activities[0]?.createdById).toBe(ownerId);
		expect(
			emitted.filter((event) => event.type === "deal.closed").length,
		).toBeGreaterThanOrEqual(1);
	});

	it("leaves a recent paused deal, a stage with no timeout, an archived deal and an open deal alone", async () => {
		const timed = await pausedStage("Pausa reciente", 7);
		const never = await pausedStage("Pausa sin limite", null);
		const recent = await dealIn("Reciente", timed.key, 3);
		const unlimited = await dealIn("Sin limite", never.key, 400);
		const archived = await dealIn("Archivada", timed.key, 30, {
			archivedAt: new Date(),
		});
		const open = await dealIn("Abierta", "CONTACTED", 400);

		await deals.losePaused(new Date());

		expect((await stageOf(recent.id)).stage).toBe(timed.key);
		expect((await stageOf(unlimited.id)).stage).toBe(never.key);
		expect((await stageOf(archived.id)).stage).toBe(timed.key);
		expect((await stageOf(open.id)).stage).toBe("CONTACTED");
	});

	it("is idempotent", async () => {
		const stage = await pausedStage("Pausa dos veces", 1);
		const deal = await dealIn("Una vez", stage.key, 5);

		await deals.losePaused(new Date());
		const again = await deals.losePaused(new Date());

		expect(again.succeeded).toBe(0);
		expect(
			await db.activity.count({
				where: { dealId: deal.id, type: ActivityType.STAGE_CHANGE },
			}),
		).toBe(1);
	});

	it("does nothing when two sweeps run at once", async () => {
		const stage = await pausedStage("Pausa en paralelo", 1);
		const deal = await dealIn("Paralela", stage.key, 5);

		await Promise.all([
			deals.losePaused(new Date()),
			deals.losePaused(new Date()),
		]);

		expect(
			await db.activity.count({
				where: { dealId: deal.id, type: ActivityType.STAGE_CHANGE },
			}),
		).toBe(1);
	});
});

describe("the pause timeout of a stage", () => {
	it("sets and clears the days of a paused stage", async () => {
		const stage = await pausedStage("Pausa editable", 5);
		expect(stage.autoLoseAfterDays).toBe(5);

		const set = expectOutput(
			stageSettingsOutput,
			await stages.update(adminId, {
				key: stage.key,
				name: stage.name,
				autoLoseAfterDays: 30,
			}),
		);
		expect(
			set.stages.find((row) => row.key === stage.key)?.autoLoseAfterDays,
		).toBe(30);

		const cleared = expectOutput(
			stageSettingsOutput,
			await stages.update(adminId, {
				key: stage.key,
				name: stage.name,
				autoLoseAfterDays: null,
			}),
		);
		expect(
			cleared.stages.find((row) => row.key === stage.key)?.autoLoseAfterDays,
		).toBeNull();
	});

	it("seeds the paused stage with seven days", async () => {
		const row = await db.pipelineStage.findUniqueOrThrow({
			where: { key: "NO_RESPONSE" },
		});
		expect(row.autoLoseAfterDays).toBe(7);
	});

	it("refuses days on an open or a closed stage", async () => {
		for (const key of ["CONTACTED", "WON", "LOST"]) {
			const row = await db.pipelineStage.findUniqueOrThrow({ where: { key } });
			await expect(
				stages.update(adminId, {
					key,
					name: row.name,
					autoLoseAfterDays: 7,
				}),
			).rejects.toBeInstanceOf(BadRequestException);
		}
		await expect(
			stages.create(
				adminId,
				createStageInput.parse({
					name: label("Abierta con dias"),
					kind: "OPEN",
					autoLoseAfterDays: 7,
				}),
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("accepts only a positive whole number within the bound", () => {
		const base = { key: "X", name: "X" };
		for (const autoLoseAfterDays of [
			0,
			-1,
			1.5,
			PIPELINE_STAGE.autoLoseMaxDays + 1,
		]) {
			expect(
				updateStageInput.safeParse({ ...base, autoLoseAfterDays }).success,
			).toBe(false);
		}
		for (const autoLoseAfterDays of [1, PIPELINE_STAGE.autoLoseMaxDays, null]) {
			expect(
				updateStageInput.safeParse({ ...base, autoLoseAfterDays }).success,
			).toBe(true);
		}
	});
});
