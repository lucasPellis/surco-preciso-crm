import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { workspaceSlug } from "@crm/db/workspace";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ImportProcessesService } from "../src/import-processes/import-processes.service";
import {
	type ImportStageSettings,
	importStageExpectedLabelsInput,
	importStageSettingsOutput,
} from "../src/imports/import-stages.contracts";
import { ImportStagesService } from "../src/imports/import-stages.service";
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `isd-admin-${suffix}`;
const memberId = `isd-member-${suffix}`;
const prefix = `SD${token}`;

const service = new ImportStagesService(db);
const processes = new ImportProcessesService(db);

let mainProcess: TestProcess;
let sideProcess: TestProcess;
let copyId: string | null = null;
let invoiceId: string;
let packingId: string;
let receiptId: string;

async function settingsOf(userId: string, processId: string) {
	return expectOutput(
		importStageSettingsOutput,
		await service.settings(userId, processId),
	);
}

async function setLabels(key: string, labelIds: string[]) {
	return expectOutput(
		importStageSettingsOutput,
		await service.setExpectedLabels(adminId, { key, labelIds }),
	);
}

function rowOf(settings: ImportStageSettings, key: string) {
	const found = settings.stages.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

async function label(text: string, archived = false) {
	const created = await db.documentLabel.create({
		data: {
			name: `${prefix} ${text}`,
			direction: DocumentDirection.IN,
			archivedAt: archived ? new Date() : null,
		},
		select: { id: true },
	});
	return created.id;
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
				name: "Stage Doc Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Stage Doc Member",
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
	mainProcess = await createTestProcess(`Documentos ${suffix}`);
	sideProcess = await createTestProcess(`Documentos lado ${suffix}`);
	invoiceId = await label("Factura");
	packingId = await label("Packing list");
	receiptId = await label("Recibo");
});

afterAll(async () => {
	await removeTestProcesses(
		[mainProcess.id, sideProcess.id, copyId].filter(
			(id): id is string => id !== null,
		),
	);
	await db.documentLabel.deleteMany({
		where: { name: { startsWith: prefix } },
	});
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("expected labels of a stage", () => {
	it("saves the labels in the given order", async () => {
		const settings = await setLabels(mainProcess.entryKey, [
			packingId,
			invoiceId,
		]);

		expect(rowOf(settings, mainProcess.entryKey).expectedLabelIds).toEqual([
			packingId,
			invoiceId,
		]);
		expect(rowOf(settings, mainProcess.receivedKey).expectedLabelIds).toEqual(
			[],
		);
	});

	it("replaces the list, and an empty list clears it", async () => {
		await setLabels(mainProcess.receivedKey, [invoiceId, receiptId]);

		const replaced = await setLabels(mainProcess.receivedKey, [receiptId]);
		expect(rowOf(replaced, mainProcess.receivedKey).expectedLabelIds).toEqual([
			receiptId,
		]);

		const cleared = await setLabels(mainProcess.receivedKey, []);
		expect(rowOf(cleared, mainProcess.receivedKey).expectedLabelIds).toEqual(
			[],
		);
	});

	it("refuses an archived or unknown label and changes nothing", async () => {
		await setLabels(mainProcess.cancelledKey, [invoiceId]);
		const archived = await label("Archivada", true);

		await expect(
			service.setExpectedLabels(adminId, {
				key: mainProcess.cancelledKey,
				labelIds: [invoiceId, archived],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			service.setExpectedLabels(adminId, {
				key: mainProcess.cancelledKey,
				labelIds: [`missing-${suffix}`],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(
			rowOf(await settingsOf(adminId, mainProcess.id), mainProcess.cancelledKey)
				.expectedLabelIds,
		).toEqual([invoiceId]);
	});

	it("hides an archived label and keeps its link for a restore", async () => {
		const temporary = await label("Temporal");
		await setLabels(sideProcess.entryKey, [temporary, invoiceId]);
		await db.documentLabel.update({
			where: { id: temporary },
			data: { archivedAt: new Date() },
		});

		expect(
			rowOf(await settingsOf(adminId, sideProcess.id), sideProcess.entryKey)
				.expectedLabelIds,
		).toEqual([invoiceId]);

		await setLabels(sideProcess.entryKey, [invoiceId]);
		await db.documentLabel.update({
			where: { id: temporary },
			data: { archivedAt: null },
		});

		expect(
			rowOf(await settingsOf(adminId, sideProcess.id), sideProcess.entryKey)
				.expectedLabelIds,
		).toEqual([invoiceId, temporary]);
	});

	it("validates the list at the boundary", () => {
		expect(
			importStageExpectedLabelsInput.safeParse({ key: "K", labelIds: [] })
				.success,
		).toBe(true);
		expect(
			importStageExpectedLabelsInput.safeParse({
				key: "K",
				labelIds: ["a", "a"],
			}).success,
		).toBe(false);
		expect(
			importStageExpectedLabelsInput.safeParse({
				key: "K",
				labelIds: Array.from(
					{ length: IMPORT_DOCUMENT.maxExpectedLabels + 1 },
					(_, index) => `l-${index}`,
				),
			}).success,
		).toBe(false);
	});

	it("copies the expected labels when a process is duplicated", async () => {
		await setLabels(mainProcess.entryKey, [packingId, invoiceId]);
		const copyName = `Copia documentos ${suffix}`;

		const list = await processes.duplicate(adminId, {
			id: mainProcess.id,
			name: copyName,
		});
		const copy = list.processes.find((row) => row.name === copyName);
		if (!copy) throw new Error("The copy is missing.");
		copyId = copy.id;

		const copied = await settingsOf(adminId, copy.id);
		const entry = copied.stages.find((stage) => stage.isEntry);
		expect(entry?.key).not.toBe(mainProcess.entryKey);
		expect(entry?.expectedLabelIds).toEqual([packingId, invoiceId]);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses the write", async () => {
		const settings = await settingsOf(memberId, mainProcess.id);

		expect(settings.canManage).toBe(false);
		await expect(
			service.setExpectedLabels(memberId, {
				key: mainProcess.entryKey,
				labelIds: [],
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
});
