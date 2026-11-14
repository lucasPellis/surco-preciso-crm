import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { ActivityType, db, type Prisma } from "@crm/db";
import { PIPELINE_STAGE } from "@crm/db/pipeline-stage";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
} from "@nestjs/common";
import type {
	AgentTriggerService,
	CrmEventInput,
} from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import {
	archiveStageInput,
	createStageInput,
	updateStageInput,
} from "../src/deals/pipeline-stages.contracts";
import { PipelineStagesService } from "../src/deals/pipeline-stages.service";
import { FieldsService } from "../src/fields/fields.service";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `ps-admin-${suffix}`;
const memberId = `ps-member-${suffix}`;
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
	fieldBackfillRecords: async () => ({ queued: 0, merged: 0 }),
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

async function make(
	name: string,
	kind: "OPEN" | "PAUSED" = "OPEN",
	extra: { idleAfterHours?: number | null } = {},
) {
	const result = await stages.create(
		adminId,
		createStageInput.parse({ name: label(name), kind, ...extra }),
	);
	const row = result.stages.find((stage) => stage.name === label(name));
	if (!row) throw new Error(`No stage called ${name}.`);
	createdKeys.push(row.key);
	return row;
}

async function row(key: string) {
	const { stages: list } = await stages.settings(adminId);
	const found = list.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

async function dealIn(name: string, stage: string, extra = {}) {
	return db.deal.create({
		data: { name: label(name), companyId, ownerId: adminId, stage, ...extra },
		select: { id: true },
	});
}

async function activeIntermediateKeys() {
	const { stages: list } = await stages.settings(adminId);
	return list
		.filter(
			(stage) =>
				!stage.archived &&
				!stage.isEntry &&
				(stage.kind === "OPEN" || stage.kind === "PAUSED"),
		)
		.map((stage) => stage.key);
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
			{ id: adminId, name: "Stage Admin", email: `${adminId}@example.test` },
			{ id: memberId, name: "Stage Member", email: `${memberId}@example.test` },
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `m-${adminId}`,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: `m-${memberId}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	companyId = (
		await db.company.create({
			data: { name: label("Stages company") },
			select: { id: true },
		})
	).id;
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.activity.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.pipelineStage.deleteMany({ where: { key: { in: createdKeys } } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("the stage catalog", () => {
	it("returns the tone of every stage", async () => {
		const catalog = await deals.stages(true);

		expect(catalog.length).toBeGreaterThan(0);
		expect(catalog.every((stage) => stage.tone !== undefined)).toBe(true);
		expect(catalog.find((stage) => stage.key === "WON")?.tone).toBe("SUCCESS");
	});
});

describe("creating a stage", () => {
	it("generates the key from the name and puts the stage at the end", async () => {
		const before = await activeIntermediateKeys();
		const created = await make("Visita técnica");

		expect(created.key).toBe(`VISITA_TECNICA_${token}`);
		expect(created.kind).toBe("OPEN");
		expect(created.tone).toBe("NEUTRAL");
		expect(await activeIntermediateKeys()).toEqual([...before, created.key]);
		expect(created.position).toBeLessThan(PIPELINE_STAGE.fixedEndPosition);
	});

	it("never reuses a key, even from an archived stage", async () => {
		const first = await make("Mi etapa");
		await stages.archive(adminId, { key: first.key });
		const second = await stages.create(
			adminId,
			createStageInput.parse({ name: `Mi-etapa ${suffix}`, kind: "OPEN" }),
		);
		const other = second.stages.find(
			(stage) => stage.name === `Mi-etapa ${suffix}`,
		);
		if (other) createdKeys.push(other.key);

		expect(other?.key).toBe(`${first.key}_2`);
	});

	it("refuses a name that exists, ignoring case, archived or not", async () => {
		await make("Repetida");

		await expect(
			stages.create(
				adminId,
				createStageInput.parse({
					name: label("REPETIDA").toLowerCase(),
					kind: "OPEN",
				}),
			),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses a name with no letters", async () => {
		await expect(
			stages.create(
				adminId,
				createStageInput.parse({ name: "!!!", kind: "OPEN" }),
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("validates the name, the kind and the idle hours at the boundary", () => {
		expect(
			createStageInput.safeParse({ name: "  ", kind: "OPEN" }).success,
		).toBe(false);
		expect(
			createStageInput.safeParse({
				name: "x".repeat(PIPELINE_STAGE.nameMaxLength + 1),
				kind: "OPEN",
			}).success,
		).toBe(false);
		expect(
			createStageInput.safeParse({ name: "Ok", kind: "WON" }).success,
		).toBe(false);
		for (const idleAfterHours of [
			0,
			-1,
			1.5,
			PIPELINE_STAGE.idleMaxHours + 1,
		]) {
			expect(
				createStageInput.safeParse({ name: "Ok", kind: "OPEN", idleAfterHours })
					.success,
			).toBe(false);
		}
	});
});

describe("renaming and editing a stage", () => {
	it("renames an intermediate stage and keeps its key", async () => {
		const created = await make("Para renombrar");
		const result = await stages.update(
			adminId,
			updateStageInput.parse({ key: created.key, name: label("Renombrada") }),
		);
		const renamed = result.stages.find((stage) => stage.key === created.key);

		expect(renamed?.name).toBe(label("Renombrada"));
	});

	it("renames a fixed stage", async () => {
		const original = (await row("WON")).name;

		try {
			await stages.update(adminId, { key: "WON", name: label("Vendido") });
			expect((await row("WON")).name).toBe(label("Vendido"));
		} finally {
			await db.pipelineStage.update({
				where: { key: "WON" },
				data: { name: original },
			});
		}
	});

	it("refuses to rename onto a name that exists", async () => {
		const created = await make("Otra para renombrar");

		await expect(
			stages.update(adminId, { key: created.key, name: "Contactado" }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("sets and clears the idle hours of an open stage", async () => {
		const created = await make("Con alerta", "OPEN", { idleAfterHours: 48 });
		expect(created.idleAfterHours).toBe(48);

		await stages.update(adminId, {
			key: created.key,
			name: label("Con alerta"),
			idleAfterHours: 96,
		});
		expect((await row(created.key)).idleAfterHours).toBe(96);

		await stages.update(adminId, {
			key: created.key,
			name: label("Con alerta"),
			idleAfterHours: null,
		});
		expect((await row(created.key)).idleAfterHours).toBeNull();
	});

	it("refuses idle hours on a paused or a closed stage", async () => {
		const paused = await make("En pausa propia", "PAUSED");

		await expect(
			stages.update(adminId, {
				key: paused.key,
				name: paused.name,
				idleAfterHours: 24,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			stages.update(adminId, {
				key: "LOST",
				name: (await row("LOST")).name,
				idleAfterHours: 24,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("changes the tone of an intermediate stage and not of a closed one", async () => {
		const created = await make("Con tono");
		await stages.update(adminId, {
			key: created.key,
			name: created.name,
			tone: "WARNING",
		});
		expect((await row(created.key)).tone).toBe("WARNING");

		await expect(
			stages.update(adminId, {
				key: "WON",
				name: (await row("WON")).name,
				tone: "INFO",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});

describe("reordering the stages", () => {
	it("applies a valid order and leaves the fixed stages alone", async () => {
		const a = await make("Orden A");
		const b = await make("Orden B");
		const fixedBefore = (await stages.settings(adminId)).stages.filter(
			(stage) => stage.isEntry || stage.kind === "WON" || stage.kind === "LOST",
		);
		const keys = await activeIntermediateKeys();
		const swapped = keys.map((key) =>
			key === a.key ? b.key : key === b.key ? a.key : key,
		);

		const result = await stages.reorder(adminId, { keys: swapped });

		expect(await activeIntermediateKeys()).toEqual(swapped);
		expect(
			result.stages.filter(
				(stage) =>
					stage.isEntry || stage.kind === "WON" || stage.kind === "LOST",
			),
		).toEqual(fixedBefore);
	});

	it("rejects a stale list", async () => {
		const keys = await activeIntermediateKeys();

		await expect(
			stages.reorder(adminId, { keys: keys.slice(1) }),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			stages.reorder(adminId, { keys: [...keys, "GHOST"] }),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			stages.reorder(adminId, { keys: [...keys, keys[0] ?? ""] }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("rejects a list that moves a fixed stage into the order", async () => {
		const keys = await activeIntermediateKeys();

		await expect(
			stages.reorder(adminId, { keys: ["WON", ...keys] }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("archiving a stage", () => {
	it("archives a stage with no deals and puts it in the archive", async () => {
		const created = await make("Vacía");

		const result = await stages.archive(adminId, { key: created.key });

		expect(
			result.stages.find((stage) => stage.key === created.key)?.archived,
		).toBe(true);
		expect(await activeIntermediateKeys()).not.toContain(created.key);
	});

	it("refuses to archive a stage with deals and no target", async () => {
		const full = await make("Con deals");
		await dealIn("Atascada", full.key);

		await expect(
			stages.archive(adminId, { key: full.key }),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await row(full.key)).archived).toBe(false);
	});

	it("moves every deal to the target in one go and records each move", async () => {
		const source = await make("Origen");
		const target = await make("Destino");
		const stamped = new Date("2026-02-02T00:00:00Z");
		const first = await dealIn("Uno", source.key, {
			firstContactedAt: stamped,
		});
		const second = await dealIn("Dos", source.key);
		const archivedDeal = await dealIn("Tres archivada", source.key, {
			archivedAt: new Date(),
		});
		emitted.length = 0;

		const result = await stages.archive(adminId, {
			key: source.key,
			targetKey: target.key,
		});

		const moved = await db.deal.findMany({
			where: { id: { in: [first.id, second.id, archivedDeal.id] } },
			select: { id: true, stage: true, firstContactedAt: true },
		});
		expect(moved.every((deal) => deal.stage === target.key)).toBe(true);
		expect(
			moved.find((deal) => deal.id === first.id)?.firstContactedAt,
		).toEqual(stamped);
		expect(
			moved.find((deal) => deal.id === second.id)?.firstContactedAt,
		).toBeNull();
		expect(
			result.stages.find((stage) => stage.key === source.key)?.archived,
		).toBe(true);
		expect(
			result.stages.find((stage) => stage.key === target.key)?.dealCount,
		).toBe(3);

		const activities = await db.activity.findMany({
			where: {
				dealId: { in: [first.id, second.id, archivedDeal.id] },
				type: ActivityType.STAGE_CHANGE,
			},
			select: { meta: true },
		});
		expect(activities).toHaveLength(3);
		expect(
			activities.every(
				(entry) => (entry.meta as { to: string }).to === target.key,
			),
		).toBe(true);
		expect(
			emitted.filter((event) => event.type === "deal.stage.changed"),
		).toHaveLength(3);
	});

	it("does not set first contact when the deals were already past the entry stage", async () => {
		const source = await make("Ya contactada");
		const target = await make("Sigue contactada");
		const deal = await dealIn("Sin marca", source.key);

		await stages.archive(adminId, { key: source.key, targetKey: target.key });

		const after = await db.deal.findUniqueOrThrow({
			where: { id: deal.id },
			select: { firstContactedAt: true },
		});
		expect(after.firstContactedAt).toBeNull();
	});

	it("changes nothing when the target is not valid", async () => {
		const source = await make("Rollback");
		const archivedTarget = await make("Destino archivado");
		await stages.archive(adminId, { key: archivedTarget.key });
		const deal = await dealIn("Se queda", source.key);

		for (const targetKey of [
			"WON",
			"LOST",
			source.key,
			archivedTarget.key,
			"GHOST",
		]) {
			await expect(
				stages.archive(adminId, { key: source.key, targetKey }),
			).rejects.toBeInstanceOf(BadRequestException);
		}

		const after = await db.deal.findUniqueOrThrow({
			where: { id: deal.id },
			select: { stage: true },
		});
		expect(after.stage).toBe(source.key);
		expect((await row(source.key)).archived).toBe(false);
		expect(await db.activity.count({ where: { dealId: deal.id } })).toBe(0);
	});

	it("never archives a fixed stage", async () => {
		for (const key of ["NEW", "WON", "LOST"]) {
			await expect(
				stages.archive(adminId, { key, targetKey: "CONTACTED" }),
			).rejects.toBeInstanceOf(BadRequestException);
		}
	});

	it("refuses to archive a stage twice", async () => {
		const created = await make("Dos veces");
		await stages.archive(adminId, { key: created.key });

		await expect(
			stages.archive(adminId, { key: created.key }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("validates the archive input", () => {
		expect(archiveStageInput.safeParse({ key: "" }).success).toBe(false);
	});
});

describe("restoring a stage", () => {
	it("brings it back at the end of the intermediate stages", async () => {
		const first = await make("Restaurable");
		await make("Posterior");
		await stages.archive(adminId, { key: first.key });

		const result = await stages.restore(adminId, first.key);
		const restored = result.stages.find((stage) => stage.key === first.key);
		const keys = await activeIntermediateKeys();

		expect(restored?.archived).toBe(false);
		expect(keys.at(-1)).toBe(first.key);
		expect(restored?.position).toBeLessThan(PIPELINE_STAGE.fixedEndPosition);
	});

	it("refuses to restore a stage that is active", async () => {
		await expect(stages.restore(adminId, "CONTACTED")).rejects.toBeInstanceOf(
			ConflictException,
		);
	});
});

describe("an archived stage", () => {
	it("cannot receive a deal, by move, by bulk move or on creation", async () => {
		const retired = await make("Retirada");
		await stages.archive(adminId, { key: retired.key });
		const deal = await dealIn("Intento", "NEW");

		await expect(
			deals.setStage({ id: deal.id, stage: retired.key }, adminId),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			deals.bulkSetStage({ ids: [deal.id], stage: retired.key }, adminId),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			deals.create({
				name: label("Nueva en retirada"),
				companyId,
				ownerId: adminId,
				stage: retired.key,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(
			(await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage,
		).toBe("NEW");
	});

	it("never ends up holding a deal that arrives while it is archived", async () => {
		const source = await make("Carrera");
		const target = await make("Carrera destino");
		const deal = await dealIn("Corre", "NEW");

		await stages.archive(adminId, { key: source.key });
		const attempt = deals.setStage({ id: deal.id, stage: source.key }, adminId);

		await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
		expect(await db.deal.count({ where: { stage: source.key } })).toBe(0);
		expect(target.key).not.toBe(source.key);
	});
});

describe("who can change the stages", () => {
	it("lets a member see the list and refuses every change", async () => {
		const list = await stages.settings(memberId);
		expect(list.canManage).toBe(false);
		expect((await stages.settings(adminId)).canManage).toBe(true);

		const calls = [
			() => stages.create(memberId, { name: label("Nope"), kind: "OPEN" }),
			() => stages.update(memberId, { key: "CONTACTED", name: "Nope" }),
			() => stages.reorder(memberId, { keys: [] }),
			() => stages.archive(memberId, { key: "CONTACTED" }),
			() => stages.restore(memberId, "CONTACTED"),
		];
		for (const call of calls) {
			await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
