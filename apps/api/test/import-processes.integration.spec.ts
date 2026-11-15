import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import {
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
import { IMPORT_PROCESS } from "@crm/db/import-process";
import { IMPORT_STAGE } from "@crm/db/import-stage";
import { workspaceSlug } from "@crm/db/workspace";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { taskDueDay } from "../src/activities/task-due-date";
import {
	type ImportProcessCreateInput,
	type ImportProcessDuplicateInput,
	type ImportProcessList,
	type ImportProcessUpdateInput,
	importProcessCreateInput,
	importProcessListOutput,
} from "../src/import-processes/import-processes.contracts";
import { ImportProcessesService } from "../src/import-processes/import-processes.service";
import { expectOutput } from "./expect-output";
import { removeTestProcesses } from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8);
const adminId = `ip-admin-${suffix}`;
const memberId = `ip-member-${suffix}`;
const prefix = `IP${suffix.toUpperCase()}`;
const DAY = "2026-01-10";
const label = (name: string) => `${name} ${suffix}`;

const service = new ImportProcessesService(db);
const contract =
	<Args extends unknown[]>(
		call: (...args: Args) => Promise<ImportProcessList>,
	) =>
	async (...args: Args) =>
		expectOutput(importProcessListOutput, await call(...args));
const processes = {
	list: contract((userId: string) => service.list(userId)),
	create: contract((userId: string, input: ImportProcessCreateInput) =>
		service.create(userId, input),
	),
	update: contract((userId: string, input: ImportProcessUpdateInput) =>
		service.update(userId, input),
	),
	duplicate: contract((userId: string, input: ImportProcessDuplicateInput) =>
		service.duplicate(userId, input),
	),
	archive: contract((userId: string, id: string) =>
		service.archive(userId, id),
	),
	restore: contract((userId: string, id: string) =>
		service.restore(userId, id),
	),
};

const createdIds: string[] = [];
let nextNumber = 0;

function rowOf(list: ImportProcessList, name: string) {
	const found = list.processes.find((row) => row.name === name);
	if (!found) throw new Error(`No process called ${name}.`);
	return found;
}

async function make(name: string, countryCode: ImportCountry | null = null) {
	const result = await processes.create(
		adminId,
		importProcessCreateInput.parse({ name: label(name), countryCode }),
	);
	const found = rowOf(result, label(name));
	createdIds.push(found.id);
	return found;
}

function stagesOf(processId: string) {
	return db.importStage.findMany({
		where: { processId },
		orderBy: { position: "asc" },
		select: {
			key: true,
			name: true,
			kind: true,
			tone: true,
			position: true,
			isEntry: true,
			archivedAt: true,
		},
	});
}

async function orderIn(processId: string): Promise<string> {
	nextNumber += 1;
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-${nextNumber}`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(DAY),
			processId,
		},
		select: { id: true },
	});
	return order.id;
}

async function shipmentIn(orderId: string, stageKey: string): Promise<void> {
	await db.shipment.create({
		data: {
			orderId,
			stageKey,
			stageChangedAt: taskDueDay(DAY),
			events: {
				create: { stageKey, occurredAt: taskDueDay(DAY), actorId: adminId },
			},
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
			{
				id: adminId,
				name: "Import Process Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Process Member",
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
});

afterAll(async () => {
	await removeTestProcesses(createdIds);
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("creating a process", () => {
	it("starts with the three fixed stages and fresh keys", async () => {
		const created = await make("Courier", ImportCountry.AR);

		expect(created).toMatchObject({
			countryCode: ImportCountry.AR,
			archived: false,
			stageCount: 3,
			orderCount: 0,
			activeShipmentCount: 0,
		});
		const stages = await stagesOf(created.id);
		expect(
			stages.map((stage) => [
				stage.name,
				stage.kind,
				stage.position,
				stage.isEntry,
			]),
		).toEqual([
			["Pedido", ImportStageKind.IN_PROGRESS, IMPORT_STAGE.entryPosition, true],
			[
				"Recibido",
				ImportStageKind.RECEIVED,
				IMPORT_STAGE.fixedEndPosition,
				false,
			],
			[
				"Cancelado",
				ImportStageKind.CANCELLED,
				IMPORT_STAGE.cancelledPosition,
				false,
			],
		]);
		expect(stages[0]?.key).toMatch(/^PEDIDO(_\d+)?$/);
	});

	it("refuses a name that exists, ignoring case", async () => {
		await make("Repetido");

		await expect(
			processes.create(adminId, {
				name: label("Repetido").toUpperCase(),
				countryCode: null,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("validates the name and the country at the boundary", () => {
		expect(
			importProcessCreateInput.safeParse({ name: "Ok", countryCode: null })
				.success,
		).toBe(true);
		expect(
			importProcessCreateInput.safeParse({ name: "  ", countryCode: null })
				.success,
		).toBe(false);
		expect(
			importProcessCreateInput.safeParse({
				name: "x".repeat(IMPORT_PROCESS.nameMaxLength + 1),
				countryCode: null,
			}).success,
		).toBe(false);
		expect(
			importProcessCreateInput.safeParse({ name: "Ok", countryCode: "CL" })
				.success,
		).toBe(false);
	});
});

describe("the entry stage", () => {
	it("allows one active entry in each process", async () => {
		const first = await make("Entrada A");
		const second = await make("Entrada B");

		expect.assertions(2);
		try {
			await db.importStage.create({
				data: {
					processId: first.id,
					key: `ENTRY_${prefix}`,
					name: label("Otra entrada"),
					kind: ImportStageKind.IN_PROGRESS,
					isEntry: true,
					position: IMPORT_STAGE.entryPosition,
				},
			});
		} catch (error) {
			expect(error).toMatchObject({ code: "P2002" });
		}
		expect(
			(await stagesOf(second.id)).filter((stage) => stage.isEntry).length,
		).toBe(1);
	});
});

describe("renaming a process", () => {
	it("renames it and changes its country", async () => {
		const created = await make("Para renombrar");

		const result = await processes.update(adminId, {
			id: created.id,
			name: label("Renombrado"),
			countryCode: ImportCountry.PY,
		});

		expect(rowOf(result, label("Renombrado"))).toMatchObject({
			id: created.id,
			countryCode: ImportCountry.PY,
		});
	});

	it("refuses the name of another process", async () => {
		const taken = await make("Ocupado");
		const created = await make("Otro para renombrar");

		await expect(
			processes.update(adminId, {
				id: created.id,
				name: taken.name,
				countryCode: null,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("duplicating a process", () => {
	it("copies the active stages with new keys and no order", async () => {
		const source = await make("Origen", ImportCountry.BR);
		await db.importStage.createMany({
			data: [
				{
					processId: source.id,
					key: `MEDIO_${prefix}`,
					name: "Con DHL",
					kind: ImportStageKind.IN_PROGRESS,
					tone: PipelineStageTone.INFO,
					position: 1,
				},
				{
					processId: source.id,
					key: `VIEJA_${prefix}`,
					name: "Vieja",
					kind: ImportStageKind.IN_PROGRESS,
					position: 2,
					archivedAt: new Date(),
				},
			],
		});
		await orderIn(source.id);

		const result = await processes.duplicate(adminId, {
			id: source.id,
			name: label("Copia"),
		});
		const copy = rowOf(result, label("Copia"));
		createdIds.push(copy.id);

		expect(copy).toMatchObject({
			countryCode: ImportCountry.BR,
			stageCount: 4,
			orderCount: 0,
		});
		const shape = (rows: Awaited<ReturnType<typeof stagesOf>>) =>
			rows.map((row) => ({
				name: row.name,
				kind: row.kind,
				tone: row.tone,
				position: row.position,
				isEntry: row.isEntry,
			}));
		const from = (await stagesOf(source.id)).filter(
			(row) => row.archivedAt === null,
		);
		const to = await stagesOf(copy.id);
		expect(shape(to)).toEqual(shape(from));
		const sourceKeys = new Set(from.map((row) => row.key));
		expect(to.some((row) => sourceKeys.has(row.key))).toBe(false);
	});

	it("refuses a name that exists", async () => {
		const source = await make("Origen repetido");

		await expect(
			processes.duplicate(adminId, { id: source.id, name: source.name }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("archiving a process", () => {
	it("refuses while a shipment is in progress and archives once it is closed", async () => {
		const created = await make("Con envío");
		const stages = await stagesOf(created.id);
		const entry = stages.find((stage) => stage.isEntry);
		const received = stages.find(
			(stage) => stage.kind === ImportStageKind.RECEIVED,
		);
		if (!entry || !received) throw new Error("Missing fixed stage.");
		const orderId = await orderIn(created.id);
		await shipmentIn(orderId, entry.key);

		expect(
			rowOf(await processes.list(adminId), created.name).activeShipmentCount,
		).toBe(1);
		await expect(processes.archive(adminId, created.id)).rejects.toBeInstanceOf(
			ConflictException,
		);

		await db.shipment.updateMany({
			where: { orderId },
			data: { stageKey: received.key },
		});
		const result = await processes.archive(adminId, created.id);

		expect(rowOf(result, created.name).archived).toBe(true);
	});

	it("restores an archived process and refuses a repeated action", async () => {
		const created = await make("Para archivar");

		await processes.archive(adminId, created.id);
		await expect(processes.archive(adminId, created.id)).rejects.toBeInstanceOf(
			ConflictException,
		);

		const result = await processes.restore(adminId, created.id);
		expect(rowOf(result, created.name).archived).toBe(false);
		await expect(processes.restore(adminId, created.id)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		expect((await processes.list(memberId)).canManage).toBe(false);
		expect((await processes.list(adminId)).canManage).toBe(true);

		const target = await make("Solo admin");
		const writes = [
			() =>
				service.create(memberId, {
					name: label("Prohibido"),
					countryCode: null,
				}),
			() =>
				service.update(memberId, {
					id: target.id,
					name: target.name,
					countryCode: null,
				}),
			() =>
				service.duplicate(memberId, {
					id: target.id,
					name: label("Copia prohibida"),
				}),
			() => service.archive(memberId, target.id),
			() => service.restore(memberId, target.id),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
