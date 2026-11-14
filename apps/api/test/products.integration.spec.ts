import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import {
	productListInput,
	productListOutput,
	productOutput,
} from "../src/products/products.contracts";
import { ProductsService } from "../src/products/products.service";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
const adminId = `pr-admin-${suffix}`;
const memberId = `pr-member-${suffix}`;
const prefix = `PR${suffix}`;

const service = new ProductsService(db);

const base = {
	name: "Equipo de prueba",
	brand: "",
	category: "",
	description: "",
	referenceCostCents: null,
};

function listInput(overrides: Partial<z.input<typeof productListInput>> = {}) {
	return productListInput.parse({ q: prefix, ...overrides });
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
			{ id: adminId, name: "Product Admin", email: `${adminId}@example.test` },
			{
				id: memberId,
				name: "Product Member",
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
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("products", () => {
	it("creates a product with a normalised sku and blank text as null", async () => {
		const created = await service.create(adminId, {
			...base,
			sku: ` ${prefix.toLowerCase()} a 1 `,
			referenceCostCents: 123456,
		});
		expectOutput(productOutput, created);
		expect(created.sku).toBe(`${prefix}-A-1`);
		expect(created.brand).toBeNull();
		expect(created.category).toBeNull();
		expect(created.referenceCostCents).toBe(123456);
		expect(created.archivedAt).toBeNull();
	});

	it("refuses a second product with the same sku in any case", async () => {
		await expect(
			service.create(adminId, { ...base, sku: `${prefix.toLowerCase()}-a-1` }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses a write from a member and still lets the member read", async () => {
		await expect(
			service.create(memberId, { ...base, sku: `${prefix}-M` }),
		).rejects.toBeInstanceOf(ForbiddenException);
		const list = await service.list(memberId, listInput());
		expect(list.canManage).toBe(false);
		expect(list.total).toBe(1);
	});

	it("updates a product and keeps the id", async () => {
		const { rows } = await service.list(adminId, listInput());
		const before = rows[0];
		if (!before) throw new Error("Missing product.");
		const after = await service.update(adminId, {
			...base,
			id: before.id,
			sku: before.sku,
			name: "Nombre nuevo",
			category: "Cortadoras",
			referenceCostCents: null,
		});
		expect(after.id).toBe(before.id);
		expect(after.name).toBe("Nombre nuevo");
		expect(after.category).toBe("Cortadoras");
		expect(after.referenceCostCents).toBeNull();
	});

	it("refuses to move a product onto another product's sku", async () => {
		await service.create(adminId, { ...base, sku: `${prefix}-B` });
		const { rows } = await service.list(adminId, listInput());
		const first = rows.find((row) => row.sku === `${prefix}-A-1`);
		if (!first) throw new Error("Missing product.");
		await expect(
			service.update(adminId, { ...base, id: first.id, sku: `${prefix}-B` }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("reports a missing product as not found", async () => {
		await expect(
			service.update(adminId, {
				...base,
				id: "no-such-product",
				sku: `${prefix}-Z`,
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("archives into the archived list and restores back", async () => {
		const { rows } = await service.list(adminId, listInput());
		const target = rows[0];
		if (!target) throw new Error("Missing product.");
		await service.archive(adminId, target.id);
		const active = await service.list(adminId, listInput());
		const archived = await service.list(adminId, listInput({ archived: true }));
		expect(active.rows.some((row) => row.id === target.id)).toBe(false);
		expect(archived.rows.some((row) => row.id === target.id)).toBe(true);
		await service.restore(adminId, target.id);
		const back = await service.list(adminId, listInput());
		expect(back.rows.some((row) => row.id === target.id)).toBe(true);
	});

	it("filters by category and counts categories in facetCounts", async () => {
		const filtered = await service.list(
			adminId,
			listInput({ category: ["Cortadoras"] }),
		);
		expect(filtered.rows.every((row) => row.category === "Cortadoras")).toBe(
			true,
		);
		expect(filtered.facetCounts.category?.Cortadoras).toBe(1);
	});

	it("searches by name and sorts by name", async () => {
		const found = await service.list(adminId, listInput({ q: "nombre nuevo" }));
		expect(found.rows.map((row) => row.name)).toEqual(["Nombre nuevo"]);
		const sorted = await service.list(
			adminId,
			listInput({ sort: "name", dir: "asc" }),
		);
		const names = sorted.rows.map((row) => row.name);
		expect(names).toEqual([...names].sort());
	});

	it("keeps the list output inside its contract", async () => {
		const list = await service.list(adminId, listInput());
		expectOutput(productListOutput, list);
	});
});
