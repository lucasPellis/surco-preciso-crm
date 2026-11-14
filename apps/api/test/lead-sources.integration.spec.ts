import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import { LeadSourcesService } from "../src/lead-sources/lead-sources.service";

const suffix = crypto.randomUUID().slice(0, 8);
const adminId = `ls-admin-${suffix}`;
const memberId = `ls-member-${suffix}`;
const prefix = `Ls ${suffix}`;

const service = new LeadSourcesService(db);

async function find(name: string) {
	const { sources } = await service.list(adminId);
	const source = sources.find((row) => row.name === name);
	if (!source) throw new Error(`No source called ${name}.`);
	return source;
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
			{ id: adminId, name: "Source Admin", email: `${adminId}@example.test` },
			{
				id: memberId,
				name: "Source Member",
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
	const owned = await db.leadSource.findMany({
		where: { name: { startsWith: prefix } },
		select: { id: true },
	});
	const ids = owned.map((row) => row.id);
	await db.contact.deleteMany({ where: { leadSourceId: { in: ids } } });
	await db.leadSource.deleteMany({ where: { id: { in: ids } } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("lead sources", () => {
	it("ships the starting list with an icon each", async () => {
		const { sources, canManage } = await service.list(adminId);

		const whatsapp = sources.find((row) => row.key === "whatsapp");
		const facebook = sources.find((row) => row.key === "facebook-campaign");

		expect(canManage).toBe(true);
		expect(whatsapp?.icon).toBe("whatsapp");
		expect(facebook?.icon).toBe("facebook");
		expect(sources.every((row) => row.icon !== null)).toBe(true);
	});

	it("lets an admin add a source with an icon", async () => {
		const { sources } = await service.create(
			adminId,
			`${prefix} Feria`,
			"event",
		);

		const created = sources.find((row) => row.name === `${prefix} Feria`);

		expect(created?.icon).toBe("event");
		expect(created?.archived).toBe(false);
		expect(created?.contacts).toBe(0);
		expect(created?.key).toBe(`ls-${suffix}-feria`);
	});

	it("shows a member the list and refuses their changes", async () => {
		const { canManage } = await service.list(memberId);

		expect(canManage).toBe(false);
		await expect(
			service.create(memberId, `${prefix} Nope`, null),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it("refuses a second source with the same name in any case", async () => {
		await expect(
			service.create(adminId, `${prefix} FERIA`, null),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses a name with no letters or digits", async () => {
		await expect(service.create(adminId, "!!!", null)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it("changes the name and icon and keeps the key", async () => {
		const before = await find(`${prefix} Feria`);

		await service.update(adminId, before.id, `${prefix} Expo`, "web");
		const after = await find(`${prefix} Expo`);

		expect(after.id).toBe(before.id);
		expect(after.key).toBe(before.key);
		expect(after.icon).toBe("web");
	});

	it("archives a source and restores it", async () => {
		const source = await find(`${prefix} Expo`);

		await service.archive(adminId, source.id);
		expect((await find(`${prefix} Expo`)).archived).toBe(true);

		await service.restore(adminId, source.id);
		expect((await find(`${prefix} Expo`)).archived).toBe(false);
	});

	it("counts only active contacts", async () => {
		const source = await find(`${prefix} Expo`);
		await db.contact.create({
			data: { firstName: "Counted", leadSourceId: source.id },
		});
		await db.contact.create({
			data: {
				firstName: "Archived",
				leadSourceId: source.id,
				archivedAt: new Date(),
			},
		});

		expect((await find(`${prefix} Expo`)).contacts).toBe(1);

		await db.contact.deleteMany({ where: { leadSourceId: source.id } });
	});

	it("puts sources in the order it is given", async () => {
		await service.create(adminId, `${prefix} A`, null);
		await service.create(adminId, `${prefix} B`, null);
		const a = await find(`${prefix} A`);
		const b = await find(`${prefix} B`);

		const { sources } = await service.reorder(adminId, [b.id, a.id]);
		const order = sources.map((row) => row.id);

		expect(order.indexOf(b.id)).toBeLessThan(order.indexOf(a.id));
	});

	it("refuses an order with an unknown or repeated source", async () => {
		const a = await find(`${prefix} A`);

		await expect(
			service.reorder(adminId, [a.id, "no-such-source"]),
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(service.reorder(adminId, [a.id, a.id])).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});
});
