import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_STAGE, isFixedImportStage } from "@crm/db/import-stage";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
} from "@nestjs/common";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
	taskDueDay,
} from "../src/activities/task-due-date";
import {
	type ImportStageArchiveInput,
	type ImportStageCreateInput,
	type ImportStageReorderInput,
	type ImportStageSettings,
	type ImportStageUpdateInput,
	importStageCreateInput,
	importStageSettingsOutput,
	importStageUpdateInput,
} from "../src/imports/import-stages.contracts";
import { ImportStagesService } from "../src/imports/import-stages.service";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `is-admin-${suffix}`;
const memberId = `is-member-${suffix}`;
const prefix = `IS${token}`;
const START_DAY = "2026-01-10";
const label = (name: string) => `${name} ${suffix}`;

const service = new ImportStagesService(db);
const contract =
	<Args extends unknown[]>(
		call: (...args: Args) => Promise<ImportStageSettings>,
	) =>
	async (...args: Args) =>
		expectOutput(importStageSettingsOutput, await call(...args));
const stages = {
	settings: contract((userId: string) => service.settings(userId)),
	create: contract((userId: string, input: ImportStageCreateInput) =>
		service.create(userId, input),
	),
	update: contract((userId: string, input: ImportStageUpdateInput) =>
		service.update(userId, input),
	),
	reorder: contract((userId: string, input: ImportStageReorderInput) =>
		service.reorder(userId, input),
	),
	archive: contract((userId: string, input: ImportStageArchiveInput) =>
		service.archive(userId, input),
	),
	restore: contract((userId: string, key: string) =>
		service.restore(userId, key),
	),
};

let orderId: string;
const createdKeys: string[] = [];

async function make(name: string) {
	const result = await stages.create(
		adminId,
		importStageCreateInput.parse({ name: label(name) }),
	);
	const found = result.stages.find((stage) => stage.name === label(name));
	if (!found) throw new Error(`No stage called ${name}.`);
	createdKeys.push(found.key);
	return found;
}

async function row(key: string) {
	const { stages: list } = await stages.settings(adminId);
	const found = list.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

async function fixedStage(pick: "entry" | "received" | "cancelled") {
	const { stages: list } = await stages.settings(adminId);
	const found = list.find((stage) =>
		pick === "entry"
			? stage.isEntry && !stage.archived
			: !stage.archived &&
				stage.kind ===
					(pick === "received"
						? ImportStageKind.RECEIVED
						: ImportStageKind.CANCELLED),
	);
	if (!found) throw new Error(`No ${pick} stage.`);
	return found;
}

async function activeIntermediateKeys() {
	const { stages: list } = await stages.settings(adminId);
	return list
		.filter((stage) => !stage.archived && !isFixedImportStage(stage))
		.map((stage) => stage.key);
}

async function shipmentIn(
	stageKey: string,
	day: string = START_DAY,
): Promise<string> {
	const shipment = await db.shipment.create({
		data: {
			orderId,
			stageKey,
			stageChangedAt: taskDueDay(day),
			events: {
				create: {
					stageKey,
					occurredAt: taskDueDay(day),
					actorId: adminId,
				},
			},
		},
		select: { id: true },
	});
	return shipment.id;
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
			{
				id: adminId,
				name: "Import Stage Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Stage Member",
				email: `${memberId}@example.test`,
			},
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
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-1`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(START_DAY),
		},
		select: { id: true },
	});
	orderId = order.id;
});

afterAll(async () => {
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await db.importStage.deleteMany({ where: { key: { in: createdKeys } } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("creating an import stage", () => {
	it("generates the key from the name and puts the stage at the end", async () => {
		const before = await activeIntermediateKeys();
		const created = await make("Depósito fiscal");

		expect(created.key).toBe(`DEPOSITO_FISCAL_${token}`);
		expect(created.kind).toBe(ImportStageKind.IN_PROGRESS);
		expect(created.tone).toBe(IMPORT_STAGE.defaultTone);
		expect(created.isEntry).toBe(false);
		expect(await activeIntermediateKeys()).toEqual([...before, created.key]);
		expect(created.position).toBeLessThan(IMPORT_STAGE.fixedEndPosition);
	});

	it("never reuses a key, even from an archived stage", async () => {
		const first = await make("Mi etapa");
		await stages.archive(adminId, { key: first.key });

		const result = await stages.create(
			adminId,
			importStageCreateInput.parse({ name: `Mi-etapa ${suffix}` }),
		);
		const second = result.stages.find(
			(stage) => stage.name === `Mi-etapa ${suffix}`,
		);
		if (second) createdKeys.push(second.key);

		expect(second?.key).toBe(`${first.key}_2`);
	});

	it("refuses a name that exists, ignoring case, archived or not", async () => {
		await make("Repetida");

		await expect(
			stages.create(
				adminId,
				importStageCreateInput.parse({
					name: label("REPETIDA").toLowerCase(),
				}),
			),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses a name with no letters or digits", async () => {
		await expect(
			stages.create(adminId, importStageCreateInput.parse({ name: "!!!" })),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("validates the name and the tone at the boundary", () => {
		expect(importStageCreateInput.safeParse({ name: "  " }).success).toBe(
			false,
		);
		expect(
			importStageCreateInput.safeParse({
				name: "x".repeat(IMPORT_STAGE.nameMaxLength + 1),
			}).success,
		).toBe(false);
		expect(
			importStageCreateInput.safeParse({ name: "Ok", tone: "PINK" }).success,
		).toBe(false);
	});
});

describe("editing an import stage", () => {
	it("renames and recolours an intermediate stage and keeps its key", async () => {
		const created = await make("Para renombrar");

		const result = await stages.update(
			adminId,
			importStageUpdateInput.parse({
				key: created.key,
				name: label("Renombrada"),
				tone: "WARNING",
			}),
		);
		const renamed = result.stages.find((stage) => stage.key === created.key);

		expect(renamed?.name).toBe(label("Renombrada"));
		expect(renamed?.tone).toBe("WARNING");
	});

	it("renames a fixed stage", async () => {
		const received = await fixedStage("received");

		try {
			await stages.update(adminId, {
				key: received.key,
				name: label("Entregado"),
			});
			expect((await row(received.key)).name).toBe(label("Entregado"));
		} finally {
			await db.importStage.update({
				where: { key: received.key },
				data: { name: received.name },
			});
		}
	});

	it("refuses to rename onto a name that exists", async () => {
		const taken = await make("Ocupada");
		const created = await make("Otra para renombrar");

		await expect(
			stages.update(adminId, { key: created.key, name: taken.name }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("reordering import stages", () => {
	it("reorders the intermediate stages and refuses a stale list", async () => {
		await make("Orden A");
		await make("Orden B");
		const before = await activeIntermediateKeys();
		const reversed = [...before].reverse();

		try {
			await stages.reorder(adminId, { keys: reversed });
			expect(await activeIntermediateKeys()).toEqual(reversed);
		} finally {
			await stages.reorder(adminId, { keys: before });
		}

		await expect(
			stages.reorder(adminId, { keys: before.slice(1) }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("archiving an import stage", () => {
	it("archives a stage with no shipments", async () => {
		const created = await make("Vacía");

		const result = await stages.archive(adminId, { key: created.key });

		expect(
			result.stages.find((stage) => stage.key === created.key)?.archived,
		).toBe(true);
		expect(await activeIntermediateKeys()).not.toContain(created.key);
	});

	it("refuses to archive a fixed stage", async () => {
		for (const pick of ["entry", "received", "cancelled"] as const) {
			const stage = await fixedStage(pick);
			await expect(
				stages.archive(adminId, { key: stage.key }),
			).rejects.toBeInstanceOf(BadRequestException);
		}
	});

	it("refuses to archive a stage with shipments and no target", async () => {
		const full = await make("Con envíos");
		await shipmentIn(full.key);

		await expect(
			stages.archive(adminId, { key: full.key }),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await row(full.key)).archived).toBe(false);
	});

	it("refuses a closed or archived target", async () => {
		const source = await make("Origen cerrado");
		await shipmentIn(source.key);
		const gone = await make("Destino archivado");
		await stages.archive(adminId, { key: gone.key });
		const received = await fixedStage("received");

		await expect(
			stages.archive(adminId, { key: source.key, targetKey: received.key }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			stages.archive(adminId, { key: source.key, targetKey: gone.key }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect((await row(source.key)).archived).toBe(false);
	});

	it("moves every shipment to the target with an event dated today", async () => {
		const source = await make("Origen");
		const target = await make("Destino");
		const first = await shipmentIn(source.key);
		const second = await shipmentIn(source.key);

		const result = await stages.archive(adminId, {
			key: source.key,
			targetKey: target.key,
		});

		const moved = await db.shipment.findMany({
			where: { id: { in: [first, second] } },
			select: { stageKey: true },
		});
		expect(moved.every((shipment) => shipment.stageKey === target.key)).toBe(
			true,
		);
		const events = await db.shipmentStageEvent.findMany({
			where: { shipmentId: { in: [first, second] }, stageKey: target.key },
			select: { occurredAt: true, actorId: true },
		});
		const today = taskDayBoundaries(new Date()).startOfToday;
		expect(events.length).toBe(2);
		expect(events.every((event) => event.actorId === adminId)).toBe(true);
		expect(
			events.every((event) => event.occurredAt.getTime() === today.getTime()),
		).toBe(true);
		expect(
			result.stages.find((stage) => stage.key === source.key)?.archived,
		).toBe(true);
		expect(
			result.stages.find((stage) => stage.key === target.key)?.shipmentCount,
		).toBe(2);
	});

	it("dates every move on the chosen day", async () => {
		const source = await make("Origen con fecha");
		const target = await make("Destino con fecha");
		const first = await shipmentIn(source.key);
		const second = await shipmentIn(source.key);

		await stages.archive(adminId, {
			key: source.key,
			targetKey: target.key,
			occurredAt: "2026-02-01",
		});

		const chosen = taskDueDay("2026-02-01");
		const events = await db.shipmentStageEvent.findMany({
			where: { shipmentId: { in: [first, second] }, stageKey: target.key },
			select: { occurredAt: true, actorId: true },
		});
		expect(events.length).toBe(2);
		expect(events.every((event) => event.actorId === adminId)).toBe(true);
		expect(
			events.every((event) => event.occurredAt.getTime() === chosen.getTime()),
		).toBe(true);
		const moved = await db.shipment.findMany({
			where: { id: { in: [first, second] } },
			select: { stageKey: true, stageChangedAt: true },
		});
		expect(
			moved.every(
				(shipment) =>
					shipment.stageKey === target.key &&
					shipment.stageChangedAt.getTime() === chosen.getTime(),
			),
		).toBe(true);
	});

	it("dates the moves on today when no day is given", async () => {
		const source = await make("Origen sin fecha");
		const target = await make("Destino sin fecha");
		const id = await shipmentIn(source.key);

		await stages.archive(adminId, { key: source.key, targetKey: target.key });

		const today = taskDayBoundaries(new Date()).startOfToday;
		const shipment = await db.shipment.findUniqueOrThrow({
			where: { id },
			select: { stageKey: true, stageChangedAt: true },
		});
		const event = await db.shipmentStageEvent.findFirstOrThrow({
			where: { shipmentId: id, stageKey: target.key },
			select: { occurredAt: true },
		});
		expect(shipment.stageKey).toBe(target.key);
		expect(shipment.stageChangedAt.getTime()).toBe(today.getTime());
		expect(event.occurredAt.getTime()).toBe(today.getTime());
	});

	it("refuses a day before a shipment's last event and moves nothing", async () => {
		const source = await make("Origen con fecha temprana");
		const target = await make("Destino con fecha temprana");
		const early = await shipmentIn(source.key);
		const late = await shipmentIn(source.key, "2026-03-01");

		expect.assertions(7);
		try {
			await stages.archive(adminId, {
				key: source.key,
				targetKey: target.key,
				occurredAt: "2026-02-01",
			});
		} catch (error) {
			expect(error).toBeInstanceOf(BadRequestException);
			expect(error).toMatchObject({
				message: expect.stringContaining("2026-03-01"),
			});
		}
		expect((await row(source.key)).archived).toBe(false);
		for (const id of [early, late]) {
			const shipment = await db.shipment.findUniqueOrThrow({
				where: { id },
				select: { stageKey: true },
			});
			expect(shipment.stageKey).toBe(source.key);
			expect(
				await db.shipmentStageEvent.count({ where: { shipmentId: id } }),
			).toBe(1);
		}
	});

	it("refuses a day after today and moves nothing", async () => {
		const source = await make("Origen con fecha futura");
		const target = await make("Destino con fecha futura");
		const id = await shipmentIn(source.key);
		const tomorrow = serializeTaskDueDay(
			taskDayBoundaries(new Date()).startOfTomorrow,
		);

		await expect(
			stages.archive(adminId, {
				key: source.key,
				targetKey: target.key,
				occurredAt: tomorrow ?? "",
			}),
		).rejects.toBeInstanceOf(BadRequestException);

		expect((await row(source.key)).archived).toBe(false);
		expect(
			(
				await db.shipment.findUniqueOrThrow({
					where: { id },
					select: { stageKey: true },
				})
			).stageKey,
		).toBe(source.key);
		expect(
			await db.shipmentStageEvent.count({ where: { shipmentId: id } }),
		).toBe(1);
	});
});

describe("restoring an import stage", () => {
	it("puts the stage back at the end of the intermediate stages", async () => {
		const created = await make("Para restaurar");
		await stages.archive(adminId, { key: created.key });

		await stages.restore(adminId, created.key);

		const keys = await activeIntermediateKeys();
		expect(keys.at(-1)).toBe(created.key);
	});

	it("refuses to restore a stage that is not archived", async () => {
		const created = await make("Activa");

		await expect(stages.restore(adminId, created.key)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const settings = await stages.settings(memberId);
		expect(settings.canManage).toBe(false);
		expect((await stages.settings(adminId)).canManage).toBe(true);

		const target = await make("Solo admin");
		const writes = [
			() => service.create(memberId, { name: label("Prohibida") }),
			() => service.update(memberId, { key: target.key, name: target.name }),
			() => service.reorder(memberId, { keys: [] }),
			() => service.archive(memberId, { key: target.key }),
			() => service.restore(memberId, target.key),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
