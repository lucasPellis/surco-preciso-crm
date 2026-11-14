# Product Catalog (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Product` catalog with a screen at `/products`: list, search, category filter, create, edit, archive and restore. Owner and admin write. Members read.

**Architecture:** One new Prisma table `product`. One Nest module `products` with a thin tRPC router, a service, and Zod contracts. The list follows the Companies pattern (`listInput`, `{ rows, total, facetCounts }`, `archivedFilter`). Permission is `canManageInventory(role)` in `@crm/auth`, enforced in the service. The API returns `canManage` so the UI disables controls with the same answer. The screen follows the Companies screen with one sheet for create and edit.

**Tech Stack:** Prisma, NestJS with `nestjs-trpc`, Zod, Next.js, TanStack Query, `@crm/ui` (`DataTable`, `FormSheet`), bun test.

Spec: `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server error messages.
- UI comes only from `packages/ui`. No literal colours, radii or spacing at the call site.
- Do not run `migrate dev`, `reset` or `db push` against the `crm` database. The user applies migrations with `bun --env-file=.env run --filter=@crm/db db:deploy`.
- Do not read `.env`. Use `--env-file`.
- Do not build.
- Commit only after the user says so. Conventional commits. No `Co-Authored-By`.
- After writing code, run `bun run format` from the repo root.

## Decision recorded in this plan

The spec lists an optional photo. This phase has no photo. A product photo needs the Blob upload built in Phase 2 with `Attachment`. Rendering an arbitrary image URL would break the image allow-list. Add `imageUrl` with the upload in Phase 2.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/db/src/product.ts` | Field limits and `normalizeSku` |
| `packages/db/test/product.spec.ts` | Unit test of `normalizeSku` |
| `packages/db/prisma/schema.prisma` | `Product` model |
| `packages/db/prisma/migrations/20261114210000_product/migration.sql` | Creates the table |
| `packages/auth/src/organization.ts` | `canManageInventory` |
| `apps/api/src/products/products.contracts.ts` | Zod inputs and outputs |
| `apps/api/src/products/products.service.ts` | Prisma access and permission |
| `apps/api/src/products/products.router.ts` | tRPC procedures |
| `apps/api/src/products/products.module.ts` | Nest module |
| `apps/api/src/app.module.ts` | Registers the module |
| `apps/api/src/generated/server.ts` | Regenerated, committed |
| `apps/api/test/products.integration.spec.ts` | Service and contract tests |
| `apps/app/lib/products-config.ts` | UI constants for the screen |
| `apps/app/lib/trpc/cache.ts` | `products` invalidator |
| `apps/app/app/(app)/[slug]/products/products-search-params.ts` | URL state of the list |
| `apps/app/app/(app)/[slug]/products/page.tsx` | Server page |
| `apps/app/app/(app)/[slug]/products/products-table.tsx` | Table and archive toggle |
| `apps/app/app/(app)/[slug]/products/product-sheet.tsx` | Create and edit sheet |
| `apps/app/components/workspace-nav.tsx` | Nav entry |
| `apps/app/components/crm/quick-switcher.tsx` | Command palette entry |

---

### Task 1: Field limits and SKU normalisation

**Files:**
- Create: `packages/db/src/product.ts`
- Create: `packages/db/test/product.spec.ts`
- Modify: `packages/db/package.json` (exports map)

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/product.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { normalizeSku, PRODUCT } from "../src/product";

describe("normalizeSku", () => {
	it("trims and upper-cases", () => {
		expect(normalizeSku("  ab-12  ")).toBe("AB-12");
	});

	it("joins inner spaces with a dash", () => {
		expect(normalizeSku("ab 12   cd")).toBe("AB-12-CD");
	});

	it("keeps an already clean sku", () => {
		expect(normalizeSku("XR-500")).toBe("XR-500");
	});
});

describe("PRODUCT limits", () => {
	it("are positive integers", () => {
		for (const value of Object.values(PRODUCT)) {
			expect(Number.isInteger(value)).toBe(true);
			expect(value).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd packages/db && bun test test/product.spec.ts`
Expected: FAIL with `Cannot find module '../src/product'`.

- [ ] **Step 3: Write the module**

Create `packages/db/src/product.ts`:

```ts
export const PRODUCT = {
	skuMaxLength: 40,
	nameMaxLength: 120,
	brandMaxLength: 60,
	categoryMaxLength: 60,
	descriptionMaxLength: 2000,
} as const;

export function normalizeSku(value: string): string {
	return value.trim().toUpperCase().replace(/\s+/g, "-");
}
```

- [ ] **Step 4: Export it**

In `packages/db/package.json`, in the `exports` map, add this line next to `"./lead-source": "./src/lead-source.ts",`:

```json
"./product": "./src/product.ts",
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd packages/db && bun test test/product.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit (only with the user's OK)**

```bash
git add packages/db/src/product.ts packages/db/test/product.spec.ts packages/db/package.json
git commit -m "feat: add product field limits and sku normalisation"
```

---

### Task 2: Prisma model and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (after the `LeadSource` model, around line 561)
- Create: `packages/db/prisma/migrations/20261114210000_product/migration.sql`

- [ ] **Step 1: Add the model**

Insert after the `LeadSource` model:

```prisma
model Product {
  id               String    @id @default(cuid())
  sku              String    @unique
  name             String
  brand            String?
  category         String?
  description      String?
  referenceCostUsd Decimal?  @db.Decimal(14, 2)
  archivedAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([archivedAt])
  @@map("product")
}
```

- [ ] **Step 2: Write the migration by hand**

Create `packages/db/prisma/migrations/20261114210000_product/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "description" TEXT,
    "referenceCostUsd" DECIMAL(14,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE INDEX "product_archivedAt_idx" ON "product"("archivedAt");
```

- [ ] **Step 3: Generate the client (no database needed)**

Run: `bun run db:generate`
Expected: Prisma Client generated, with `Product` types.

- [ ] **Step 4: Stop and ask the user to apply the migration**

Tell the user to run both commands:
1. `bun --env-file=.env run --filter=@crm/db db:deploy` applies the migration to the `crm` database.
2. `bun --env-file=.env run db:test` creates or updates the throwaway `crm_test` database.

Under `bun test`, `packages/db/src/client.ts` uses `TEST_DATABASE_URL` and never `DATABASE_URL`. Without command 2 every integration test fails with `relation "public.product" does not exist`.
Wait for the user to confirm.

- [ ] **Step 5: Commit (only with the user's OK)**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261114210000_product
git commit -m "feat: add the product table"
```

---

### Task 3: Permission

**Files:**
- Modify: `packages/auth/src/organization.ts` (after `canManageTracking`, around line 46)

- [ ] **Step 1: Add the function**

Insert after `canManageTracking`:

```ts
export function canManageInventory(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}
```

- [ ] **Step 2: Type check the package**

Run: `bun run check-types --filter=@crm/auth`
Expected: no errors.

- [ ] **Step 3: Commit (only with the user's OK)**

```bash
git add packages/auth/src/organization.ts
git commit -m "feat: add the inventory permission"
```

---

### Task 4: API contracts and service

**Files:**
- Create: `apps/api/src/products/products.contracts.ts`
- Create: `apps/api/src/products/products.service.ts`
- Create: `apps/api/test/products.integration.spec.ts`

- [ ] **Step 1: Write the contracts**

Create `apps/api/src/products/products.contracts.ts`:

```ts
import { PRODUCT } from "@crm/db/product";
import { z } from "zod";
import { MAX_AMOUNT_CENTS } from "../deals/deals.contracts";
import { listInput } from "../trpc/list-input";

const text = (max: number) =>
	z.string().trim().max(max, `Máximo ${max} caracteres.`);

const productFields = {
	sku: text(PRODUCT.skuMaxLength).min(1, "El producto necesita un SKU."),
	name: text(PRODUCT.nameMaxLength).min(1, "El producto necesita un nombre."),
	brand: text(PRODUCT.brandMaxLength),
	category: text(PRODUCT.categoryMaxLength),
	description: text(PRODUCT.descriptionMaxLength),
	referenceCostCents: z
		.number()
		.int("El costo debe tener como máximo dos decimales.")
		.min(0, "El costo no puede ser negativo.")
		.max(MAX_AMOUNT_CENTS, "El costo es demasiado grande.")
		.nullable(),
};

export const productCreateInput = z.object(productFields);

export const productUpdateInput = z.object({
	id: z.string().min(1),
	...productFields,
});

export const productIdInput = z.object({ id: z.string().min(1) });

export const productListInput = listInput.extend({
	archived: z.boolean().default(false),
	category: z.array(z.string()).default([]),
});

export const productOutput = z.object({
	id: z.string(),
	sku: z.string(),
	name: z.string(),
	brand: z.string().nullable(),
	category: z.string().nullable(),
	description: z.string().nullable(),
	referenceCostCents: z.number().nullable(),
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
});

export const productListOutput = z.object({
	rows: z.array(productOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	canManage: z.boolean(),
});

export type ProductCreateInput = z.infer<typeof productCreateInput>;
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;
export type ProductIdInput = z.infer<typeof productIdInput>;
export type ProductListInput = z.infer<typeof productListInput>;
export type ProductRow = z.infer<typeof productOutput>;
export type ProductList = z.infer<typeof productListOutput>;
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/test/products.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
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

function listInput(overrides: Record<string, unknown> = {}) {
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
			{ id: memberId, name: "Product Member", email: `${memberId}@example.test` },
		],
	});
	await db.member.createMany({
		data: [
			{ id: `m-${adminId}`, organizationId: WORKSPACE_ID, userId: adminId, role: "admin", createdAt: new Date() },
			{ id: `m-${memberId}`, organizationId: WORKSPACE_ID, userId: memberId, role: "member", createdAt: new Date() },
		],
	});
});

afterAll(async () => {
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
	await db.member.deleteMany({ where: { userId: { in: [adminId, memberId] } } });
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
			service.update(adminId, { ...base, id: "no-such-product", sku: `${prefix}-Z` }),
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
		const filtered = await service.list(adminId, listInput({ category: ["Cortadoras"] }));
		expect(filtered.rows.every((row) => row.category === "Cortadoras")).toBe(true);
		expect(filtered.facetCounts.category?.Cortadoras).toBe(1);
	});

	it("searches by name and sorts by name", async () => {
		const found = await service.list(adminId, listInput({ q: "nombre nuevo" }));
		expect(found.rows.map((row) => row.name)).toEqual(["Nombre nuevo"]);
		const sorted = await service.list(adminId, listInput({ sort: "name", dir: "asc" }));
		const names = sorted.rows.map((row) => row.name);
		expect(names).toEqual([...names].sort());
	});

	it("keeps the list output inside its contract", async () => {
		const list = await service.list(adminId, listInput());
		expectOutput(productListOutput, list);
	});
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/products.integration.spec.ts`
Expected: FAIL with `Cannot find module '../src/products/products.service'`.

- [ ] **Step 4: Write the service**

Create `apps/api/src/products/products.service.ts`:

```ts
import {
	canManageInventory,
	workspaceRoleOf,
} from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { Prisma } from "@crm/db";
import { normalizeSku } from "@crm/db/product";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull, decimalFromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	archivedFilter,
	countsByKey,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ProductCreateInput,
	ProductList,
	ProductListInput,
	ProductRow,
	ProductUpdateInput,
} from "./products.contracts";

const SORTABLE: OrderByColumns<Prisma.ProductOrderByWithRelationInput> = {
	sku: (dir) => ({ sku: dir }),
	name: (dir) => ({ name: dir }),
	brand: (dir) => ({ brand: { sort: dir, nulls: "last" } }),
	category: (dir) => ({ category: { sort: dir, nulls: "last" } }),
	referenceCost: (dir) => ({ referenceCostUsd: { sort: dir, nulls: "last" } }),
	createdAt: (dir) => ({ createdAt: dir }),
	archivedAt: (dir) => ({ archivedAt: { sort: dir, nulls: "last" } }),
};

const SELECT = {
	id: true,
	sku: true,
	name: true,
	brand: true,
	category: true,
	description: true,
	referenceCostUsd: true,
	archivedAt: true,
	createdAt: true,
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof SELECT }>;

function toRow(record: ProductRecord): ProductRow {
	return {
		id: record.id,
		sku: record.sku,
		name: record.name,
		brand: record.brand,
		category: record.category,
		description: record.description,
		referenceCostCents: toCents(record.referenceCostUsd),
		archivedAt: record.archivedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
	};
}

@Injectable()
export class ProductsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		actingUserId: string,
		input: ProductListInput,
	): Promise<ProductList> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [rows, total, categories, role] = await Promise.all([
			this.db.product.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, { createdAt: "desc" }),
				select: SELECT,
			}),
			this.db.product.count({ where }),
			this.db.product.groupBy({
				by: ["category"],
				where: archivedFilter(input.archived),
				_count: { _all: true },
			}),
			workspaceRoleOf(actingUserId),
		]);

		return {
			rows: rows.map(toRow),
			total,
			facetCounts: { category: countsByKey(categories, "category") },
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ProductCreateInput,
	): Promise<ProductRow> {
		await this.requireManager(actingUserId);
		const sku = normalizeSku(input.sku);
		try {
			const created = await this.db.product.create({
				data: this.data(input, sku),
				select: SELECT,
			});
			return toRow(created);
		} catch (error) {
			throw this.translate(error, sku);
		}
	}

	async update(
		actingUserId: string,
		input: ProductUpdateInput,
	): Promise<ProductRow> {
		await this.requireManager(actingUserId);
		const sku = normalizeSku(input.sku);
		try {
			const updated = await this.db.product.update({
				where: { id: input.id },
				data: this.data(input, sku),
				select: SELECT,
			});
			return toRow(updated);
		} catch (error) {
			throw this.translate(error, sku);
		}
	}

	async archive(actingUserId: string, id: string): Promise<ProductRow> {
		return this.setArchived(actingUserId, id, new Date());
	}

	async restore(actingUserId: string, id: string): Promise<ProductRow> {
		return this.setArchived(actingUserId, id, null);
	}

	private async setArchived(
		actingUserId: string,
		id: string,
		archivedAt: Date | null,
	): Promise<ProductRow> {
		await this.requireManager(actingUserId);
		try {
			const updated = await this.db.product.update({
				where: { id },
				data: { archivedAt },
				select: SELECT,
			});
			return toRow(updated);
		} catch (error) {
			throw this.translate(error, "");
		}
	}

	private buildWhere(input: ProductListInput): Prisma.ProductWhereInput {
		const search = input.q.trim();
		return {
			AND: [
				archivedFilter(input.archived),
				input.category.length > 0 ? { category: { in: input.category } } : {},
				search === ""
					? {}
					: {
							OR: [
								{ sku: { contains: search, mode: "insensitive" } },
								{ name: { contains: search, mode: "insensitive" } },
								{ brand: { contains: search, mode: "insensitive" } },
							],
						},
			],
		};
	}

	private data(input: ProductCreateInput, sku: string) {
		return {
			sku,
			name: input.name,
			brand: blankToNull(input.brand),
			category: blankToNull(input.category),
			description: blankToNull(input.description),
			referenceCostUsd: decimalFromCents(input.referenceCostCents),
		};
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar el catálogo.",
			);
		}
	}

	private translate(cause: unknown, sku: string): never {
		if (cause instanceof Prisma.PrismaClientKnownRequestError) {
			if (cause.code === "P2025") {
				throw new NotFoundException("No existe un producto con ese id.");
			}
			if (cause.code === "P2002") {
				throw new ConflictException(`Ya existe un producto con el SKU ${sku}.`);
			}
		}
		throw cause;
	}
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/products.integration.spec.ts`
Expected: PASS, 10 tests. If it fails with `relation "public.product" does not exist`, the user has not run `db:test` for the `crm_test` database. Stop and report it.

- [ ] **Step 6: Commit (only with the user's OK)**

```bash
git add apps/api/src/products/products.contracts.ts apps/api/src/products/products.service.ts apps/api/test/products.integration.spec.ts
git commit -m "feat: add the products service with permission and contract tests"
```

---

### Task 5: Router, module and registration

**Files:**
- Create: `apps/api/src/products/products.router.ts`
- Create: `apps/api/src/products/products.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Regenerate: `apps/api/src/generated/server.ts`

- [ ] **Step 1: Write the router**

Create `apps/api/src/products/products.router.ts`:

```ts
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	type ProductCreateInput,
	type ProductIdInput,
	type ProductListInput,
	type ProductUpdateInput,
	productCreateInput,
	productIdInput,
	productListInput,
	productListOutput,
	productOutput,
	productUpdateInput,
} from "./products.contracts";
import { ProductsService } from "./products.service";

const TAGS = ["Products"];

@Router({ alias: "products" })
@UseMiddlewares(AuthMiddleware)
export class ProductsRouter {
	constructor(
		@Inject(ProductsService) private readonly products: ProductsService,
	) {}

	@Query({
		input: productListInput,
		output: productListOutput,
		meta: restMeta("POST", "/products/search", TAGS),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductListInput,
	) {
		return this.products.list(ctx.user.id, input);
	}

	@Mutation({
		input: productCreateInput,
		output: productOutput,
		meta: restMeta("POST", "/products", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductCreateInput,
	) {
		return this.products.create(ctx.user.id, input);
	}

	@Mutation({
		input: productUpdateInput,
		output: productOutput,
		meta: restMeta("PATCH", "/products/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductUpdateInput,
	) {
		return this.products.update(ctx.user.id, input);
	}

	@Mutation({
		input: productIdInput,
		output: productOutput,
		meta: restMeta("POST", "/products/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductIdInput,
	) {
		return this.products.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: productIdInput,
		output: productOutput,
		meta: restMeta("POST", "/products/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductIdInput,
	) {
		return this.products.restore(ctx.user.id, input.id);
	}
}
```

- [ ] **Step 2: Write the module**

Create `apps/api/src/products/products.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ProductsRouter } from "./products.router";
import { ProductsService } from "./products.service";

@Module({
	imports: [TrpcModule],
	providers: [ProductsService, ProductsRouter],
})
export class ProductsModule {}
```

- [ ] **Step 3: Register the module**

In `apps/api/src/app.module.ts`, add the import next to the `LeadSourcesModule` import:

```ts
import { ProductsModule } from "./products/products.module";
```

In the `imports` array of `@Module`, add `ProductsModule` right after `LeadSourcesModule`.

- [ ] **Step 4: Regenerate the committed router file**

Run: `cd apps/api && bun run trpc:generate`
Expected: `src/generated/server.ts` now contains a `products: t.router({ list, create, update, archive, restore })` block.
Check: `rg -n 'products: t.router' apps/api/src/generated/server.ts` prints one line.
If the generator fails on GLIBC, stop and report it. Do not edit the file by hand.

- [ ] **Step 5: Type check the API**

Run: `bun run check-types --filter=@crm/api`
Expected: no errors.

- [ ] **Step 6: Commit (only with the user's OK)**

```bash
git add apps/api/src/products apps/api/src/app.module.ts apps/api/src/generated/server.ts
git commit -m "feat: expose the products router"
```

---

### Task 6: The screen

**Files:**
- Create: `apps/app/lib/products-config.ts`
- Modify: `apps/app/lib/trpc/cache.ts`
- Create: `apps/app/app/(app)/[slug]/products/products-search-params.ts`
- Create: `apps/app/app/(app)/[slug]/products/page.tsx`
- Create: `apps/app/app/(app)/[slug]/products/products-table.tsx`
- Create: `apps/app/app/(app)/[slug]/products/product-sheet.tsx`
- Modify: `apps/app/components/workspace-nav.tsx`
- Modify: `apps/app/components/crm/quick-switcher.tsx`

- [ ] **Step 1: UI constants**

Create `apps/app/lib/products-config.ts`:

```ts
export const PRODUCTS_UI = {
	currency: "USD",
	locale: "es",
	pageTitle: "Productos",
	noCost: "Sin costo",
} as const;
```

- [ ] **Step 2: Cache invalidator**

In `apps/app/lib/trpc/cache.ts`:

1. In the cache type, next to `leadSources(options?: Options): Promise<void>;`, add:

```ts
products(options?: Options): Promise<void>;
```

2. In the implementation, next to the `leadSources` entry, add:

```ts
products: (options) => run([trpc.products.list.queryKey()], [], options),
```

- [ ] **Step 3: Search params**

Create `apps/app/app/(app)/[slug]/products/products-search-params.ts`:

```ts
import { createListSearchParams } from "@/components/data-table/list-search-params";

export const productsSearchParams = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
	facetIds: ["category"] as const,
});
```

- [ ] **Step 4: Server page**

Create `apps/app/app/(app)/[slug]/products/page.tsx`:

```tsx
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PRODUCTS_UI } from "@/lib/products-config";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ProductsTable } from "./products-table";
import { productsSearchParams } from "./products-search-params";

export const metadata: Metadata = {
	title: PRODUCTS_UI.pageTitle,
};

export default function ProductsPage({
	searchParams,
}: PageProps<"/[slug]/products">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{PRODUCTS_UI.pageTitle}</PageShellTitle>
					<PageShellDescription>
						El catálogo de equipos que importamos y vendemos.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Products searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Products({
	searchParams,
}: Pick<PageProps<"/[slug]/products">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		productsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.products.list.queryOptions(productsSearchParams.toInput(values)),
	);

	return (
		<HydrateClient>
			<ProductsTable />
		</HydrateClient>
	);
}
```

- [ ] **Step 5: The sheet**

Create `apps/app/app/(app)/[slug]/products/product-sheet.tsx`:

```tsx
"use client";

import { PRODUCT } from "@crm/db/product";
import { Button } from "@crm/ui/components/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@crm/ui/components/field";
import {
	FormSheet,
	FormSheetContent,
	FormSheetFooter,
	FormSheetForm,
	useFormSheetValidation,
} from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import { SheetDescription, SheetHeader, SheetTitle } from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

export type ProductRow = RouterOutputs["products"]["list"]["rows"][number];

type ProductSheetProps = {
	product: ProductRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function costFromCents(cents: number | null): string {
	return cents === null ? "" : (cents / 100).toFixed(2);
}

function centsFromCost(value: string): number | null {
	const trimmed = value.trim().replace(",", ".");
	if (trimmed === "") return null;
	const amount = Number(trimmed);
	return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

export function ProductSheet({ product, open, onOpenChange }: ProductSheetProps) {
	return (
		<ProductForm
			key={product?.id ?? "new"}
			product={product}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}

function ProductForm({ product, open, onOpenChange }: ProductSheetProps) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();

	const [sku, setSku] = useState(product?.sku ?? "");
	const [name, setName] = useState(product?.name ?? "");
	const [brand, setBrand] = useState(product?.brand ?? "");
	const [category, setCategory] = useState(product?.category ?? "");
	const [description, setDescription] = useState(product?.description ?? "");
	const [cost, setCost] = useState(costFromCents(product?.referenceCostCents ?? null));

	const skuId = useId();
	const nameId = useId();
	const brandId = useId();
	const categoryId = useId();
	const descriptionId = useId();
	const costId = useId();

	const editing = product !== null;

	const onSuccess = async (saved: ProductRow) => {
		await cache.products();
		toast.success(editing ? "Producto actualizado." : `${saved.name} agregado.`);
		onOpenChange(false);
	};
	const onError = (error: { message: string }) => toast.error(error.message);

	const create = useMutation(
		trpc.products.create.mutationOptions({ onSuccess, onError }),
	);
	const update = useMutation(
		trpc.products.update.mutationOptions({ onSuccess, onError }),
	);
	const pending = create.isPending || update.isPending;

	const dirty = editing
		? sku !== product.sku ||
			name !== product.name ||
			brand !== (product.brand ?? "") ||
			category !== (product.category ?? "") ||
			description !== (product.description ?? "") ||
			cost !== costFromCents(product.referenceCostCents)
		: [sku, name, brand, category, description, cost].some((value) => value !== "");

	return (
		<FormSheet
			dirty={dirty}
			pending={pending}
			onDiscard={validation.reset}
			open={open}
			onOpenChange={onOpenChange}
		>
			<FormSheetContent side="right">
				<SheetHeader>
					<SheetTitle>{editing ? "Editar producto" : "Nuevo producto"}</SheetTitle>
					<SheetDescription>
						El SKU identifica al producto en órdenes y stock. No se puede repetir.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="product-form"
					onSubmit={(event) => {
						event.preventDefault();
						const cents = centsFromCost(cost);
						const errors: Record<string, string> = {};
						if (sku.trim() === "") errors[skuId] = "Escribe un SKU.";
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (Number.isNaN(cents)) errors[costId] = "Escribe un monto válido.";
						else if (cents !== null && cents < 0) errors[costId] = "El costo no puede ser negativo.";
						if (!validation.validate(event.currentTarget, errors)) return;
						const values = {
							sku,
							name,
							brand,
							category,
							description,
							referenceCostCents: cents,
						};
						if (product) update.mutate({ id: product.id, ...values });
						else create.mutate(values);
					}}
				>
					<Field data-invalid={!!validation.errors[skuId]}>
						<FieldLabel htmlFor={skuId}>SKU</FieldLabel>
						<Input
							id={skuId}
							aria-invalid={!!validation.errors[skuId]}
							aria-describedby={validation.errors[skuId] ? `${skuId}-error` : undefined}
							value={sku}
							onChange={(event) => setSku(event.target.value)}
							maxLength={PRODUCT.skuMaxLength}
							placeholder="XR-500"
							autoComplete="off"
						/>
						<FieldError id={`${skuId}-error`}>{validation.errors[skuId]}</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[nameId]}>
						<FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
						<Input
							id={nameId}
							aria-invalid={!!validation.errors[nameId]}
							aria-describedby={validation.errors[nameId] ? `${nameId}-error` : undefined}
							value={name}
							onChange={(event) => setName(event.target.value)}
							maxLength={PRODUCT.nameMaxLength}
							autoComplete="off"
						/>
						<FieldError id={`${nameId}-error`}>{validation.errors[nameId]}</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor={brandId}>Marca</FieldLabel>
						<Input
							id={brandId}
							value={brand}
							onChange={(event) => setBrand(event.target.value)}
							maxLength={PRODUCT.brandMaxLength}
							autoComplete="off"
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={categoryId}>Categoría</FieldLabel>
						<Input
							id={categoryId}
							value={category}
							onChange={(event) => setCategory(event.target.value)}
							maxLength={PRODUCT.categoryMaxLength}
							autoComplete="off"
						/>
					</Field>

					<Field data-invalid={!!validation.errors[costId]}>
						<FieldLabel htmlFor={costId}>Costo de referencia (USD)</FieldLabel>
						<Input
							id={costId}
							aria-invalid={!!validation.errors[costId]}
							aria-describedby={validation.errors[costId] ? `${costId}-error` : undefined}
							value={cost}
							onChange={(event) => setCost(event.target.value)}
							inputMode="decimal"
							placeholder="0.00"
							autoComplete="off"
						/>
						<FieldDescription>
							Es una referencia. El costo real sale de las órdenes de compra.
						</FieldDescription>
						<FieldError id={`${costId}-error`}>{validation.errors[costId]}</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor={descriptionId}>Descripción</FieldLabel>
						<Textarea
							id={descriptionId}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							maxLength={PRODUCT.descriptionMaxLength}
						/>
					</Field>
				</FormSheetForm>

				<FormSheetFooter>
					<Button type="submit" form="product-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{editing ? "Guardar" : "Agregar producto"}
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
```

- [ ] **Step 6: The table**

Create `apps/app/app/(app)/[slug]/products/products-table.tsx`:

```tsx
"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ListEmpty } from "@/components/data-table/list-empty";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { PRODUCTS_UI } from "@/lib/products-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { type ProductRow, ProductSheet } from "./product-sheet";
import { productsSearchParams } from "./products-search-params";

const usd = new Intl.NumberFormat(PRODUCTS_UI.locale, {
	style: "currency",
	currency: PRODUCTS_UI.currency,
});

const COLUMNS: DataTableColumn<ProductRow>[] = [
	{
		id: "sku",
		header: "SKU",
		sortable: true,
		hideable: false,
		width: "36",
		cell: (row) => <span className="font-medium">{row.sku}</span>,
	},
	{
		id: "name",
		header: "Nombre",
		sortable: true,
		hideable: false,
		cell: (row) => <span className="block truncate">{row.name}</span>,
	},
	{
		id: "brand",
		header: "Marca",
		sortable: true,
		hideBelow: "md",
		cell: (row) =>
			row.brand ? (
				<span className="text-muted-foreground">{row.brand}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "category",
		header: "Categoría",
		sortable: true,
		hideBelow: "md",
		cell: (row) =>
			row.category ? (
				<span className="text-muted-foreground">{row.category}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "referenceCost",
		header: "Costo ref.",
		label: "Costo de referencia",
		sortable: true,
		align: "right",
		width: "36",
		cell: (row) =>
			row.referenceCostCents === null ? (
				<EmptyCellValue />
			) : (
				<span className="tabular-nums">{usd.format(row.referenceCostCents / 100)}</span>
			),
	},
];

const ARCHIVED_COLUMN: DataTableColumn<ProductRow> = {
	id: "archivedAt",
	header: "Archivado",
	label: "Fecha de archivado",
	sortable: true,
	align: "right",
	width: "32",
	cell: (row) => (
		<span className="text-muted-foreground">
			{row.archivedAt ? <LocalRelativeTime date={row.archivedAt} /> : <EmptyCellValue />}
		</span>
	),
};

type SheetState = { open: boolean; product: ProductRow | null };

export function ProductsTable() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const table = useTableQuery(productsSearchParams);
	const { query, input, setArchived } = table;
	const [sheet, setSheet] = useState<SheetState>({ open: false, product: null });

	const products = useQuery({
		...trpc.products.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const archive = useMutation(
		trpc.products.archive.mutationOptions({
			onSuccess: async () => {
				await cache.products();
				toast.success("Producto archivado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const restore = useMutation(
		trpc.products.restore.mutationOptions({
			onSuccess: async () => {
				await cache.products();
				toast.success("Producto restaurado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = products.data?.rows ?? [];
	const canManage = products.data?.canManage ?? false;
	const facetCounts = products.data?.facetCounts;
	const busy = !canManage || archive.isPending || restore.isPending;

	const facets: DataTableFacet[] = [
		{
			id: "category",
			label: "Categoría",
			options: Object.keys(facetCounts?.category ?? {}).map((value) => ({
				value,
				label: value,
			})),
		},
	];

	const columns = useMemo(() => {
		const actions: DataTableColumn<ProductRow> = {
			id: "actions",
			header: "Acciones",
			hideable: false,
			align: "right",
			width: "40",
			cell: (row) => (
				<span className="flex justify-end gap-1">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={(event) => {
							event.stopPropagation();
							setSheet({ open: true, product: row });
						}}
					>
						Editar
					</Button>
					{row.archivedAt ? (
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={(event) => {
								event.stopPropagation();
								restore.mutate({ id: row.id });
							}}
						>
							Restaurar
						</Button>
					) : (
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={(event) => {
								event.stopPropagation();
								archive.mutate({ id: row.id });
							}}
						>
							Archivar
						</Button>
					)}
				</span>
			),
		};
		return input.archived
			? [...COLUMNS, ARCHIVED_COLUMN, actions]
			: [...COLUMNS, actions];
	}, [input.archived, busy, archive, restore]);

	return (
		<>
			<DataTable
				label="Productos"
				query={query}
				search={<ListSearch placeholder="Buscar por SKU, nombre o marca…" />}
				actions={
					<>
						<Button
							variant={input.archived ? "contrast" : "outline"}
							aria-pressed={input.archived}
							className="justify-start sm:justify-center"
							onClick={() => setArchived(!input.archived)}
						>
							<ArchiveIcon data-icon="inline-start" />
							Archivados
						</Button>
						<Button
							disabled={!canManage}
							onClick={() => setSheet({ open: true, product: null })}
						>
							<Icon icon={PlusIcon} data-icon="inline-start" />
							Nuevo producto
						</Button>
					</>
				}
				columns={columns}
				rows={rows}
				total={products.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={products.isFetching}
				empty={
					<ListEmpty
						query={query}
						noun="productos"
						archived={input.archived}
						blank={{
							title: "Todavía no hay productos",
							description: "Agrega el primer producto para armar el catálogo.",
						}}
					/>
				}
			/>
			<ProductSheet
				product={sheet.product}
				open={sheet.open}
				onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
			/>
		</>
	);
}
```

- [ ] **Step 7: Nav entry**

In `apps/app/components/workspace-nav.tsx`:

1. In the `lucide-react` import list, add `PackageIcon` (alphabetical, after `ListChecksIcon` and `type LucideIcon`).
2. In `PRIMARY`, add after the Funnel entry:

```tsx
{ title: "Productos", href: "/products", icon: PackageIcon, match: "prefix" },
```

- [ ] **Step 8: Command palette entry**

In `apps/app/components/crm/quick-switcher.tsx`:

1. Add `PackageIcon` to the `lucide-react` import.
2. In the `PAGES` array, add:

```tsx
{ id: "products", label: "Productos", href: "/products", icon: PackageIcon, keywords: ["catálogo", "equipos", "sku"] },
```

- [ ] **Step 9: Generate the page types**

Run: `cd apps/app && bun run typegen`
Expected: `PageProps<"/[slug]/products">` exists.

- [ ] **Step 10: Commit (only with the user's OK)**

```bash
git add apps/app
git commit -m "feat: add the product catalog screen"
```

---

### Task 7: Verification

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Run the repo checks**

Run: `bun run check-types && bun run lint && bun run lint:slop && bun run lint:dead`
Expected: all green. Fix every finding. Do not use `--no-verify`.

- [ ] **Step 3: Run the tests**

Run: `bun run test`
Expected: all green. API integration tests need the migration applied.

- [ ] **Step 4: Browser checklist for the user**

Give the user this list. Do not mark the phase closed without it.

1. Sign in as owner. The side menu shows *Productos*. Open it.
2. The empty table says *Todavía no hay productos*.
3. *Nuevo producto*: leave SKU empty. The form shows *Escribe un SKU.*
4. Create `xr 500` with name, brand, category and cost `1234.50`. The row shows SKU `XR-500` and cost `US$ 1.234,50`.
5. Create the same SKU again. A toast says the SKU already exists.
6. *Editar* the row, change the category, save. The category facet updates.
7. Search by part of the name. The list narrows.
8. *Archivar*. The row leaves the list. *Archivados* shows it with a date. *Restaurar* brings it back.
9. Sign in as a member. The list shows. *Nuevo producto*, *Editar* and *Archivar* are disabled.
10. Open the command palette. *Productos* appears.
11. Resize to 390 px. The page does not scroll sideways.
12. Switch to dark mode. The page keeps contrast.

---

## Self-review

**Spec coverage (Phase 1).**
- `Product` with `sku` unique, `name`, `brand`, `category`, `description`, reference USD cost, `archivedAt`: Task 2.
- Photo: deferred to Phase 2. Recorded in "Decision recorded in this plan".
- Permission `canManageInventory`: Task 3, enforced in Task 4.
- Owner and admin write, members read: Task 4 test and Task 6 `canManage`.
- Money in cents over the wire, `Decimal(14,2)` in the database: Task 2 and Task 4 use `decimalFromCents` and `toCents`.
- Tests: Task 1 unit, Task 4 service and `expectOutput`.
- Browser checklist: Task 7.

**Not in this plan on purpose.** A config module in `apps/api`. The limits are in `@crm/db/product`, the same place `LEAD_SOURCE` lives.

**Type consistency.** `ProductRow` is defined in the contracts for the API and derived from `RouterOutputs` in the app. `ProductListInput`, `ProductCreateInput` and `ProductUpdateInput` match between the contracts, the service and the router. `cache.products` is declared in the type and in the implementation.

**Known risks.**
- `useTableQuery`, `DataTable`, `ListEmpty` and `Textarea` props were read from a summary of the Companies screen, not from their source. `check-types` will show any mismatch.
- The `usePrefetchSection` hook has no `/products` case. The first navigation fetches on demand.
