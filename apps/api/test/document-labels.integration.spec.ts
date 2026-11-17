import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { workspaceSlug } from "@crm/db/workspace";
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import {
	type DocumentLabelCreateInput,
	type DocumentLabelList,
	type DocumentLabelUpdateInput,
	documentLabelCreateInput,
	documentLabelListOutput,
} from "../src/document-labels/document-labels.contracts";
import { DocumentLabelsService } from "../src/document-labels/document-labels.service";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `dl-admin-${suffix}`;
const memberId = `dl-member-${suffix}`;
const prefix = `DL${token}`;
const name = (text: string) => `${prefix} ${text}`;

const service = new DocumentLabelsService(db);
const contract =
	<Args extends unknown[]>(
		call: (...args: Args) => Promise<DocumentLabelList>,
	) =>
	async (...args: Args) =>
		expectOutput(documentLabelListOutput, await call(...args));
const labels = {
	list: contract((userId: string) => service.list(userId)),
	create: contract((userId: string, input: DocumentLabelCreateInput) =>
		service.create(userId, input),
	),
	update: contract((userId: string, input: DocumentLabelUpdateInput) =>
		service.update(userId, input),
	),
	archive: contract((userId: string, id: string) =>
		service.archive(userId, id),
	),
	restore: contract((userId: string, id: string) =>
		service.restore(userId, id),
	),
};

function mine(list: DocumentLabelList) {
	return list.labels.filter((label) => label.name.startsWith(prefix));
}

async function make(
	text: string,
	direction: DocumentDirection = DocumentDirection.IN,
) {
	const list = await labels.create(adminId, { name: name(text), direction });
	const found = list.labels.find((label) => label.name === name(text));
	if (!found) throw new Error(`No label ${text}.`);
	return found;
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
			{ id: adminId, name: "Label Admin", email: `${adminId}@example.test` },
			{ id: memberId, name: "Label Member", email: `${memberId}@example.test` },
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
	await db.documentLabel.deleteMany({
		where: { name: { startsWith: prefix } },
	});
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("document labels", () => {
	it("creates a label with no file and no stage", async () => {
		const created = await make("Factura");

		expect(created).toMatchObject({
			direction: DocumentDirection.IN,
			archived: false,
			fileCount: 0,
			stageCount: 0,
		});
		expect((await labels.list(adminId)).canManage).toBe(true);
	});

	it("lists labels by name", async () => {
		await make("Zeta");
		await make("Alfa", DocumentDirection.OUT);

		const names = mine(await labels.list(adminId)).map((label) => label.name);

		expect(names.indexOf(name("Alfa"))).toBeGreaterThanOrEqual(0);
		expect(names.indexOf(name("Alfa"))).toBeLessThan(
			names.indexOf(name("Zeta")),
		);
	});

	it("refuses a name that exists, ignoring case", async () => {
		await make("Packing list");
		const other = await make("Otra");

		await expect(
			labels.create(adminId, {
				name: name("PACKING LIST"),
				direction: DocumentDirection.IN,
			}),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			labels.update(adminId, {
				id: other.id,
				name: name("packing list"),
				direction: DocumentDirection.IN,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("keeps one label when two writers create the same name at once", async () => {
		const results = await Promise.allSettled([
			service.create(adminId, {
				name: name("Doble"),
				direction: DocumentDirection.IN,
			}),
			service.create(adminId, {
				name: name("DOBLE"),
				direction: DocumentDirection.IN,
			}),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled").length,
		).toBe(1);
		expect(
			await db.documentLabel.count({
				where: { name: { equals: name("doble"), mode: "insensitive" } },
			}),
		).toBe(1);
	});

	it("renames a label and changes its direction", async () => {
		const label = await make("Recibo");

		const list = await labels.update(adminId, {
			id: label.id,
			name: name("Comprobante de pago"),
			direction: DocumentDirection.OUT,
		});

		expect(list.labels.find((row) => row.id === label.id)).toMatchObject({
			name: name("Comprobante de pago"),
			direction: DocumentDirection.OUT,
		});
	});

	it("archives and restores a label", async () => {
		const label = await make("Temporal");

		const archived = await labels.archive(adminId, label.id);
		expect(archived.labels.find((row) => row.id === label.id)?.archived).toBe(
			true,
		);
		await expect(labels.archive(adminId, label.id)).rejects.toBeInstanceOf(
			ConflictException,
		);

		const restored = await labels.restore(adminId, label.id);
		expect(restored.labels.find((row) => row.id === label.id)?.archived).toBe(
			false,
		);
		await expect(labels.restore(adminId, label.id)).rejects.toBeInstanceOf(
			ConflictException,
		);
		await expect(
			labels.archive(adminId, `missing-${suffix}`),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("validates a label at the boundary", () => {
		const valid = { name: "Packing list", direction: "IN" };

		expect(documentLabelCreateInput.safeParse(valid).success).toBe(true);
		expect(
			documentLabelCreateInput.safeParse({ ...valid, name: "  " }).success,
		).toBe(false);
		expect(
			documentLabelCreateInput.safeParse({
				...valid,
				name: "x".repeat(IMPORT_DOCUMENT.labelNameMaxLength + 1),
			}).success,
		).toBe(false);
		expect(
			documentLabelCreateInput.safeParse({ ...valid, direction: "SIDE" })
				.success,
		).toBe(false);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const label = await make("Solo admin");

		expect((await labels.list(memberId)).canManage).toBe(false);
		const writes = [
			() =>
				service.create(memberId, {
					name: name("Prohibida"),
					direction: DocumentDirection.IN,
				}),
			() =>
				service.update(memberId, {
					id: label.id,
					name: label.name,
					direction: DocumentDirection.OUT,
				}),
			() => service.archive(memberId, label.id),
			() => service.restore(memberId, label.id),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
