# Shipment Documents (part 2 of 8: labels API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The router `documentLabels`: list, create, rename, archive and restore labels. Owner and admin write. Members read.

**Architecture:** A new Nest module `document-labels`, modelled on `apps/api/src/import-processes`. Names are unique ignoring case under an advisory lock.

**Tech Stack:** bun test, Prisma 7, NestJS with `nestjs-trpc`, Zod 4.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Part 1 must be done and the owner must have run `db:deploy` and `db:test`.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server errors. No voseo: "Elige", never "Elegí".
- Do not run `migrate dev`, `migrate reset` or `db push`. The migration is written by hand. The owner applies it.
- Do not read `.env`. Use `--env-file`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument. Quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** No `git add`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app`, `apps/api` and docs. Before you edit a shared file (`schema.prisma`, `app.module.ts`, `generated/server.ts`, `import-processes.service.ts`, `import-stages.*`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk that this plan did not write and that collides with an old text below, stop and ask the owner.
- Never call `Promise.all` on a transaction client (`tx`).
- `lint:slop` rejects `.catch((x: unknown) => x)`, parameters typed `unknown` or `object`, `Record<string, unknown>` and `...(condition ? {...} : {})`.
- `noUncheckedIndexedAccess` is on. Guard `list[index]`.
- **Integration specs share `crm_test`.** Every spec here removes its own rows in foreign key order: processes (through `removeTestProcesses`, which cascades shipments, events, files and stage links), then labels, products, members, users. After a failed run, run the leftover check in part 8 (`-h.md`), Task 10 Step 6.

The decisions of this feature for the database and the labels are in part 1 (`-a.md`), *Decisions recorded in this plan*.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `apps/api/src/document-labels/document-labels.{contracts,service,router,module}.ts` | Labels API |
| `apps/api/test/document-labels.integration.spec.ts` | Labels tests |
| `apps/api/src/app.module.ts` | Registers `DocumentLabelsModule` |

---

### Task 3: The labels API

**Files:**
- Create: `apps/api/src/document-labels/document-labels.contracts.ts`
- Create: `apps/api/src/document-labels/document-labels.service.ts`
- Create: `apps/api/src/document-labels/document-labels.router.ts`
- Create: `apps/api/src/document-labels/document-labels.module.ts`
- Create: `apps/api/test/document-labels.integration.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/document-labels.integration.spec.ts`:

```ts
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
	await db.documentLabel.deleteMany({ where: { name: { startsWith: prefix } } });
	await db.member.deleteMany({ where: { userId: { in: [adminId, memberId] } } });
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
		expect(names.indexOf(name("Alfa"))).toBeLessThan(names.indexOf(name("Zeta")));
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

		expect(results.filter((result) => result.status === "fulfilled").length).toBe(
			1,
		);
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
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/document-labels.integration.spec.ts`
Expected: FAIL. `Cannot find module '../src/document-labels/document-labels.contracts'`.

- [ ] **Step 3: Write the contracts**

Create `apps/api/src/document-labels/document-labels.contracts.ts`:

```ts
import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { z } from "zod";

const labelName = z
	.string()
	.trim()
	.min(1, "La etiqueta necesita un nombre.")
	.max(
		IMPORT_DOCUMENT.labelNameMaxLength,
		`Máximo ${IMPORT_DOCUMENT.labelNameMaxLength} caracteres.`,
	);

const recordId = z.string().min(1);

const direction = z.enum(DocumentDirection);

export const documentLabelCreateInput = z.object({ name: labelName, direction });

export const documentLabelUpdateInput = z.object({
	id: recordId,
	name: labelName,
	direction,
});

export const documentLabelIdInput = z.object({ id: recordId });

export const documentLabelRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	direction,
	archived: z.boolean(),
	fileCount: z.number(),
	stageCount: z.number(),
});

export const documentLabelListOutput = z.object({
	labels: z.array(documentLabelRowOutput),
	canManage: z.boolean(),
});

export type DocumentLabelCreateInput = z.infer<typeof documentLabelCreateInput>;
export type DocumentLabelUpdateInput = z.infer<typeof documentLabelUpdateInput>;
export type DocumentLabelIdInput = z.infer<typeof documentLabelIdInput>;
export type DocumentLabelList = z.infer<typeof documentLabelListOutput>;
```

- [ ] **Step 4: Write the service**

Create `apps/api/src/document-labels/document-labels.service.ts`:

```ts
import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	DocumentLabelCreateInput,
	DocumentLabelList,
	DocumentLabelUpdateInput,
} from "./document-labels.contracts";

type LabelRecord = Prisma.DocumentLabelGetPayload<object>;

@Injectable()
export class DocumentLabelsService {
	private readonly logger = new Logger(DocumentLabelsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(actingUserId: string): Promise<DocumentLabelList> {
		const [rows, role] = await Promise.all([
			this.db.documentLabel.findMany({
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					direction: true,
					archivedAt: true,
					_count: { select: { attachments: true, stages: true } },
				},
			}),
			workspaceRoleOf(actingUserId),
		]);

		return {
			labels: rows.map((row) => ({
				id: row.id,
				name: row.name,
				direction: row.direction,
				archived: row.archivedAt !== null,
				fileCount: row._count.attachments,
				stageCount: row._count.stages,
			})),
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: DocumentLabelCreateInput,
	): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.lockNames(tx);
			await this.assertNameFree(tx, input.name);
			await tx.documentLabel.create({
				data: { name: input.name, direction: input.direction },
			});
		});

		return this.list(actingUserId);
	}

	async update(
		actingUserId: string,
		input: DocumentLabelUpdateInput,
	): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.lockNames(tx);
			await this.lock(tx, input.id);
			await this.assertNameFree(tx, input.name, input.id);
			await tx.documentLabel.update({
				where: { id: input.id },
				data: { name: input.name, direction: input.direction },
			});
		});

		return this.list(actingUserId);
	}

	async archive(actingUserId: string, id: string): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (found.archivedAt) {
				throw new ConflictException("Esa etiqueta ya está archivada.");
			}
			await tx.documentLabel.update({
				where: { id },
				data: { archivedAt: new Date() },
			});
		});

		this.logger.log({ message: "Document label archived", label: id });

		return this.list(actingUserId);
	}

	async restore(actingUserId: string, id: string): Promise<DocumentLabelList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (!found.archivedAt) {
				throw new ConflictException("Esa etiqueta no está archivada.");
			}
			await tx.documentLabel.update({
				where: { id },
				data: { archivedAt: null },
			});
		});

		return this.list(actingUserId);
	}

	private async lockNames(tx: Prisma.TransactionClient): Promise<void> {
		await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('document_label_name'))::text`;
	}

	private async lock(
		tx: Prisma.TransactionClient,
		id: string,
	): Promise<LabelRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM document_label WHERE id = ${id} FOR UPDATE
		`;
		const found = await tx.documentLabel.findUnique({ where: { id } });
		if (!found) {
			throw new NotFoundException("No existe una etiqueta con ese id.");
		}
		return found;
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptId?: string,
	): Promise<void> {
		const existing = await tx.documentLabel.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				id: exceptId ? { not: exceptId } : undefined,
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`Ya existe una etiqueta llamada ${name}.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar las etiquetas de documentos.",
			);
		}
	}
}
```

- [ ] **Step 5: Write the router and the module**

Create `apps/api/src/document-labels/document-labels.router.ts`:

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
	type DocumentLabelCreateInput,
	type DocumentLabelIdInput,
	type DocumentLabelUpdateInput,
	documentLabelCreateInput,
	documentLabelIdInput,
	documentLabelListOutput,
	documentLabelUpdateInput,
} from "./document-labels.contracts";
import { DocumentLabelsService } from "./document-labels.service";

const TAGS = ["Document labels"];

@Router({ alias: "documentLabels" })
@UseMiddlewares(AuthMiddleware)
export class DocumentLabelsRouter {
	constructor(
		@Inject(DocumentLabelsService)
		private readonly labels: DocumentLabelsService,
	) {}

	@Query({
		output: documentLabelListOutput,
		meta: restMeta("GET", "/document-labels", TAGS),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.labels.list(ctx.user.id);
	}

	@Mutation({
		input: documentLabelCreateInput,
		output: documentLabelListOutput,
		meta: restMeta("POST", "/document-labels", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelCreateInput,
	) {
		return this.labels.create(ctx.user.id, input);
	}

	@Mutation({
		input: documentLabelUpdateInput,
		output: documentLabelListOutput,
		meta: restMeta("PATCH", "/document-labels/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelUpdateInput,
	) {
		return this.labels.update(ctx.user.id, input);
	}

	@Mutation({
		input: documentLabelIdInput,
		output: documentLabelListOutput,
		meta: restMeta("POST", "/document-labels/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelIdInput,
	) {
		return this.labels.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: documentLabelIdInput,
		output: documentLabelListOutput,
		meta: restMeta("POST", "/document-labels/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelIdInput,
	) {
		return this.labels.restore(ctx.user.id, input.id);
	}
}
```

Create `apps/api/src/document-labels/document-labels.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { DocumentLabelsRouter } from "./document-labels.router";
import { DocumentLabelsService } from "./document-labels.service";

@Module({
	imports: [TrpcModule],
	providers: [DocumentLabelsService, DocumentLabelsRouter],
})
export class DocumentLabelsModule {}
```

- [ ] **Step 6: Register the module**

Run `rtk proxy git diff --no-color HEAD -- apps/api/src/app.module.ts` first (shared file rule).

In `apps/api/src/app.module.ts`, replace:

```ts
import { DealsModule } from "./deals/deals.module";
```

with:

```ts
import { DealsModule } from "./deals/deals.module";
import { DocumentLabelsModule } from "./document-labels/document-labels.module";
```

Replace:

```ts
		ImportProcessesModule,
```

with:

```ts
		ImportProcessesModule,
		DocumentLabelsModule,
```

- [ ] **Step 7: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/document-labels.integration.spec.ts`
Expected: 8 pass, 0 fail.

- [ ] **Step 8: Prove the name lock matters**

In `lockNames`, replace the body with `return;`. Run Step 7 three times.
Expected: "keeps one label when two writers create the same name at once" fails at least once with 2 fulfilled. If it never fails, say so in the report; the lock stays. Undo the change exactly and run Step 7 again. Expected: 8 pass.

- [ ] **Step 9: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/src/document-labels/document-labels.contracts.ts apps/api/src/document-labels/document-labels.service.ts apps/api/src/document-labels/document-labels.router.ts apps/api/src/document-labels/document-labels.module.ts apps/api/src/app.module.ts apps/api/test/document-labels.integration.spec.ts && bunx biome check apps/api/src/document-labels/document-labels.contracts.ts apps/api/src/document-labels/document-labels.service.ts apps/api/src/document-labels/document-labels.router.ts apps/api/src/document-labels/document-labels.module.ts apps/api/src/app.module.ts apps/api/test/document-labels.integration.spec.ts`
Expected: no errors.

---

## Hand over

After Task 3, part 3 (`2026-11-16-shipment-documents-c.md`) is next. Do not commit.
