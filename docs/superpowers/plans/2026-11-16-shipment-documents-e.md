# Shipment Documents (part 5 of 8: remove, download, order detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete a file, give a short signed download link, and return the files and the checklist of every shipment in the order detail.

**Architecture:** Every Vercel Blob call goes through one object, `documentBlob`, in `packages/db/src/import-document-blob.ts`, the package that already owns `@vercel/blob` 2.6.1 (`packages/db/src/blob.ts` is the pattern: dynamic import, `blobEnabled()`). A new Nest module `import-documents` owns the router `importDocuments`. It imports `ImportOrdersModule` and returns `ImportOrdersService.detail`, so every write refreshes the order page like the other import mutations. The specs replace the methods of `documentBlob` with `spyOn`; no spec reaches Vercel.

**Tech Stack:** bun test, Prisma 7, NestJS with `nestjs-trpc`, Zod 4.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Part 4 must be done. Its spec has 11 passing tests.

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

Extra rules for the API files:
- **Logging** (`docs/api.md`): one object per call, never a header, a body, a query string, a pathname or a file name. Log the document id only.
- Read the installed types before you change a Blob call: `node_modules/.bun/@vercel+blob@2.6.1/node_modules/@vercel/blob/dist/client.d.ts`, `dist/index.d.ts` and `dist/create-folder-DAlHaCQ2.d.ts`. Never write a Blob call from memory.

The decisions are in part 4 (`-d.md`), *Decisions recorded in this part*.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `apps/api/src/import-documents/import-documents.{service,router}.ts` | `remove`, `downloadUrl` |
| `apps/api/test/import-documents.integration.spec.ts` | Remove, download, permission and detail tests |
| `apps/api/src/import-orders/import-orders.contracts.ts` | `expectedLabels`, `documents`, `documentsEnabled` |
| `apps/api/src/import-orders/import-orders.service.ts` | Reads and maps them |
| `apps/app/test/import-order-pages.spec.ts`, `apps/app/test/import-orders.spec.ts` | Fixtures get the new fields |
| `apps/api/src/generated/server.ts` | Regenerated |

---

### Task 5b: Remove and download

**Files:**
- Modify: `apps/api/test/import-documents.integration.spec.ts`
- Modify: `apps/api/src/import-documents/import-documents.service.ts`
- Modify: `apps/api/src/import-documents/import-documents.router.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/test/import-documents.integration.spec.ts`, replace:

```ts
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
```

with:

```ts
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
```

Replace:

```ts
	documentAttachInput,
	documentUploadOutput,
} from "../src/import-documents/import-documents.contracts";
```

with:

```ts
	documentAttachInput,
	documentDownloadOutput,
	documentUploadOutput,
} from "../src/import-documents/import-documents.contracts";
```

At the end of the file, add:

```ts
describe("removing and downloading a file", () => {
	it("removes the row even when the store fails", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");
		removeBlob.mockRejectedValueOnce(new Error("store down"));

		detailOf(await service.remove(adminId, file.id, NOW));

		expect(await db.attachment.count({ where: { id: file.id } })).toBe(0);
		expect(removeBlob).toHaveBeenCalledWith(file.pathname);
		await expect(service.remove(adminId, file.id, NOW)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("removes once when two removes race", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");

		const results = await Promise.allSettled([
			service.remove(adminId, file.id, NOW),
			service.remove(adminId, file.id, NOW),
		]);

		expect(results.filter((result) => result.status === "fulfilled").length).toBe(
			1,
		);
		for (const result of results) {
			if (result.status === "rejected") {
				expect(result.reason).toBeInstanceOf(NotFoundException);
			}
		}
	});

	it("gives a member a short signed link", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");

		const link = expectOutput(
			documentDownloadOutput,
			await service.downloadUrl(memberId, file.id, NOW),
		);

		expect(link.url).toBe(SIGNED);
		expect(signedUrl).toHaveBeenLastCalledWith(
			file.pathname,
			NOW.getTime() + IMPORT_DOCUMENT.downloadUrlTtlMs,
		);
		await expect(
			service.downloadUrl(memberId, `missing-${suffix}`, NOW),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});

describe("permissions", () => {
	it("lets a member download and refuses every write", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");

		const writes = [
			() =>
				service.uploadToken(
					memberId,
					{
						eventId: eventOf(order).id,
						filename: "a.pdf",
						contentType: PDF,
						size: 10,
					},
					NOW,
				),
			() =>
				service.attach(
					memberId,
					{
						eventId: eventOf(order).id,
						pathname: file.pathname,
						filename: "a.pdf",
						labelId: null,
					},
					NOW,
				),
			() => service.remove(memberId, file.id, NOW),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
		expect((await service.downloadUrl(memberId, file.id, NOW)).url).toBe(SIGNED);
	});
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-documents.integration.spec.ts`
Expected: 11 pass, 4 fail. The errors say `service.remove is not a function` or `service.downloadUrl is not a function`.

- [ ] **Step 3: Add the service methods**

In `apps/api/src/import-documents/import-documents.service.ts`, replace:

```ts
	DocumentAttachInput,
	DocumentUpload,
```

with:

```ts
	DocumentAttachInput,
	DocumentDownload,
	DocumentUpload,
```

Replace:

```ts
	private async eventOf(eventId: string): Promise<EventRef> {
```

with:

```ts
	async remove(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const found = await this.db.attachment.findUnique({
			where: { id },
			select: {
				pathname: true,
				shipmentStageEvent: {
					select: { shipment: { select: { orderId: true } } },
				},
			},
		});
		if (!found) {
			throw new NotFoundException("No existe ese documento.");
		}
		const { count } = await this.db.attachment.deleteMany({ where: { id } });
		if (count === 0) {
			throw new NotFoundException("No existe ese documento.");
		}
		await this.discard(found.pathname, id);
		this.logger.log({ message: "Import document removed", document: id });

		return this.orders.detail(
			actingUserId,
			found.shipmentStageEvent.shipment.orderId,
			now,
		);
	}

	async downloadUrl(
		_actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<DocumentDownload> {
		this.requireStorage();
		const found = await this.db.attachment.findUnique({
			where: { id },
			select: { pathname: true },
		});
		if (!found) {
			throw new NotFoundException("No existe ese documento.");
		}
		const url = await documentBlob.downloadUrl(
			found.pathname,
			now.getTime() + IMPORT_DOCUMENT.downloadUrlTtlMs,
		);
		return { url };
	}

	private async eventOf(eventId: string): Promise<EventRef> {
```

`downloadUrl` takes the user id for the router signature. `AuthMiddleware` already proves the session. Members read.

- [ ] **Step 4: Add the routes**

In `apps/api/src/import-documents/import-documents.router.ts`, replace:

```ts
import { Ctx, Input, Mutation, Router, UseMiddlewares } from "nestjs-trpc";
```

with:

```ts
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
```

Replace:

```ts
	type DocumentAttachInput,
	type DocumentUploadInput,
	documentAttachInput,
	documentUploadInput,
	documentUploadOutput,
```

with:

```ts
	type DocumentAttachInput,
	type DocumentIdInput,
	type DocumentUploadInput,
	documentAttachInput,
	documentDownloadOutput,
	documentIdInput,
	documentUploadInput,
	documentUploadOutput,
```

Replace:

```ts
		return this.documents.attach(ctx.user.id, input);
	}
}
```

with:

```ts
		return this.documents.attach(ctx.user.id, input);
	}

	@Mutation({
		input: documentIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("DELETE", "/import-documents/{id}", TAGS),
	})
	async remove(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentIdInput,
	) {
		return this.documents.remove(ctx.user.id, input.id);
	}

	@Query({
		input: documentIdInput,
		output: documentDownloadOutput,
		meta: restMeta("GET", "/import-documents/{id}/download-url", TAGS),
	})
	async downloadUrl(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentIdInput,
	) {
		return this.documents.downloadUrl(ctx.user.id, input.id);
	}
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-documents.integration.spec.ts`
Expected: 15 pass, 0 fail.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/test/import-documents.integration.spec.ts apps/api/src/import-documents/import-documents.service.ts apps/api/src/import-documents/import-documents.router.ts && bunx biome check apps/api/test/import-documents.integration.spec.ts apps/api/src/import-documents/import-documents.service.ts apps/api/src/import-documents/import-documents.router.ts`
Expected: no errors. If biome flags the unused `_actingUserId`, keep the underscore name; it is the documented convention for an unused parameter.

---

### Task 6: Files and checklists in the order detail

**Files:**
- Modify: `apps/api/test/import-documents.integration.spec.ts`
- Modify: `apps/api/src/import-orders/import-orders.contracts.ts`
- Modify: `apps/api/src/import-orders/import-orders.service.ts`
- Modify: `apps/app/test/import-order-pages.spec.ts`
- Modify: `apps/app/test/import-orders.spec.ts`
- Modify (generated): `apps/api/src/generated/server.ts`

- [ ] **Step 1: Check the files are as this plan expects**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts | head -5; rtk proxy rg -n "select: STAGE_SELECT,$|stage: \{ select: STAGE_SELECT \},$|orderToReceivedDays: receivedAfterDays|stages: order.process.stages,|orderToReceivedDays: z.number\(\).nullable\(\),|stages: z.array\(stageOutput\),|import \{ OPEN_STAGE_FILTER \}|^const SHIPPED_SELECT" apps/api/src/import-orders/import-orders.service.ts apps/api/src/import-orders/import-orders.contracts.ts`
Expected: the service has `select: STAGE_SELECT,` once (line ~98), `stage: { select: STAGE_SELECT },` twice (~122 and ~138), and each other pattern once. The working tree may hold the split-shipments hunks of another plan; that is expected. If a pattern is missing or doubled otherwise, stop and ask the owner.

- [ ] **Step 2: Write the failing tests**

At the end of `apps/api/test/import-documents.integration.spec.ts`, add:

```ts
describe("the order detail", () => {
	it("lists the files of every stage and the checklist of each stage", async () => {
		const order = await shipmentOrder();
		await db.importStageDocument.createMany({
			data: [
				{ stageKey: processRef.entryKey, labelId, position: 0 },
				{ stageKey: processRef.entryKey, labelId: archivedLabelId, position: 1 },
			],
			skipDuplicates: true,
		});

		const after = await uploaded(order);

		const entry = after.stages.find(
			(stage) => stage.key === processRef.entryKey,
		);
		expect(entry?.expectedLabels).toEqual([
			{
				id: labelId,
				name: `${prefix} Factura`,
				direction: DocumentDirection.IN,
				archived: false,
			},
		]);
		expect(shipmentOf(after).documents).toEqual([
			{
				id: expect.any(String),
				filename: "Factura PI.pdf",
				contentType: PDF,
				size: 2048,
				uploadedAt: expect.any(String),
				uploadedByName: "Import Document Admin",
				eventId: eventOf(order).id,
				stage: { key: processRef.entryKey, name: "Pedido" },
				label: {
					id: labelId,
					name: `${prefix} Factura`,
					direction: DocumentDirection.IN,
					archived: false,
				},
			},
		]);
	});

	it("keeps an archived label on its file", async () => {
		const order = await shipmentOrder();
		const temporary = (
			await db.documentLabel.create({
				data: { name: `${prefix} Temporal`, direction: DocumentDirection.OUT },
				select: { id: true },
			})
		).id;
		await uploaded(order, { labelId: temporary });
		await db.documentLabel.update({
			where: { id: temporary },
			data: { archivedAt: new Date() },
		});

		const after = detailOf(await ordersService.detail(adminId, order.id, NOW));

		expect(shipmentOf(after).documents[0]?.label).toMatchObject({
			id: temporary,
			archived: true,
		});
	});

	it("says whether storage is configured", async () => {
		const order = await shipmentOrder();

		enabled.mockReturnValueOnce(false);
		expect(
			detailOf(await ordersService.detail(memberId, order.id, NOW))
				.documentsEnabled,
		).toBe(false);
		expect(
			detailOf(await ordersService.detail(memberId, order.id, NOW))
				.documentsEnabled,
		).toBe(true);
	});
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-documents.integration.spec.ts`
Expected: 15 pass, 3 fail. The detail has no `expectedLabels`, `documents` or `documentsEnabled`.

- [ ] **Step 4: Change the detail contract**

In `apps/api/src/import-orders/import-orders.contracts.ts`, replace:

```ts
import {
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
```

with:

```ts
import {
	DocumentDirection,
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
```

Replace:

```ts
const orderLineOutput = z.object({
```

with:

```ts
const documentLabelOutput = z.object({
	id: z.string(),
	name: z.string(),
	direction: z.enum(DocumentDirection),
	archived: z.boolean(),
});

const detailStageOutput = stageOutput.extend({
	expectedLabels: z.array(documentLabelOutput),
});

const shipmentDocumentOutput = z.object({
	id: z.string(),
	filename: z.string(),
	contentType: z.string(),
	size: z.number(),
	uploadedAt: z.string(),
	uploadedByName: z.string().nullable(),
	eventId: z.string(),
	stage: stageOutput.pick({ key: true, name: true }),
	label: documentLabelOutput.nullable(),
});

const orderLineOutput = z.object({
```

Replace:

```ts
	orderToReceivedDays: z.number().nullable(),
});
```

with:

```ts
	orderToReceivedDays: z.number().nullable(),
	documents: z.array(shipmentDocumentOutput),
});
```

Replace:

```ts
	stages: z.array(stageOutput),
	canManage: z.boolean(),
```

with:

```ts
	stages: z.array(detailStageOutput),
	documentsEnabled: z.boolean(),
	canManage: z.boolean(),
```

- [ ] **Step 5: Read and map the new fields**

In `apps/api/src/import-orders/import-orders.service.ts`, replace:

```ts
import { OPEN_STAGE_FILTER } from "@crm/db/deal-stage";
```

with:

```ts
import { OPEN_STAGE_FILTER } from "@crm/db/deal-stage";
import { documentBlob } from "@crm/db/import-document-blob";
```

Replace:

```ts
const SHIPPED_SELECT = {
```

with:

```ts
const LABEL_SELECT = {
	id: true,
	name: true,
	direction: true,
	archivedAt: true,
} satisfies Prisma.DocumentLabelSelect;

type LabelRecord = Prisma.DocumentLabelGetPayload<{
	select: typeof LABEL_SELECT;
}>;

function labelRef(label: LabelRecord) {
	return {
		id: label.id,
		name: label.name,
		direction: label.direction,
		archived: label.archivedAt !== null,
	};
}

const SHIPPED_SELECT = {
```

Replace:

```ts
				orderBy: { position: "asc" },
				select: STAGE_SELECT,
```

with:

```ts
				orderBy: { position: "asc" },
				select: {
					...STAGE_SELECT,
					documents: {
						where: { label: { archivedAt: null } },
						orderBy: [{ position: "asc" }, { label: { name: "asc" } }],
						select: { label: { select: LABEL_SELECT } },
					},
				},
```

Replace:

```ts
				select: {
					id: true,
					occurredAt: true,
					stage: { select: STAGE_SELECT },
				},
```

with:

```ts
				select: {
					id: true,
					occurredAt: true,
					stage: { select: STAGE_SELECT },
					attachments: {
						orderBy: [{ createdAt: "asc" }, { id: "asc" }],
						select: {
							id: true,
							filename: true,
							contentType: true,
							size: true,
							createdAt: true,
							uploadedBy: { select: { name: true } },
							label: { select: LABEL_SELECT },
						},
					},
				},
```

Replace:

```ts
					orderToReceivedDays: receivedAfterDays(order.orderedAt, steps),
```

with:

```ts
					orderToReceivedDays: receivedAfterDays(order.orderedAt, steps),
					documents: shipment.events.flatMap((event) =>
						event.attachments.map((attachment) => ({
							id: attachment.id,
							filename: attachment.filename,
							contentType: attachment.contentType,
							size: attachment.size,
							uploadedAt: attachment.createdAt.toISOString(),
							uploadedByName: attachment.uploadedBy?.name ?? null,
							eventId: event.id,
							stage: { key: event.stage.key, name: event.stage.name },
							label: attachment.label ? labelRef(attachment.label) : null,
						})),
					),
```

Replace:

```ts
			stages: order.process.stages,
			canManage: canManageInventory(role),
```

with:

```ts
			stages: order.process.stages.map((stage) => ({
				key: stage.key,
				name: stage.name,
				kind: stage.kind,
				tone: stage.tone,
				expectedLabels: stage.documents.map((document) =>
					labelRef(document.label),
				),
			})),
			documentsEnabled: documentBlob.enabled(),
			canManage: canManageInventory(role),
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-documents.integration.spec.ts test/import-orders.integration.spec.ts`
Expected: the documents spec has 18 pass. The orders spec passes as before, 0 fail. Its `expectOutput` now checks `documents: []`, `expectedLabels: []` and `documentsEnabled`.

- [ ] **Step 7: Keep the app fixtures in step**

In `apps/app/test/import-order-pages.spec.ts`, replace:

```ts
const STAGES: ImportStageOption[] = [
	{ key: "PEDIDO", name: "Pedido", kind: "IN_PROGRESS", tone: "NEUTRAL" },
	{ key: "DOCS", name: "Documentos", kind: "IN_PROGRESS", tone: "NEUTRAL" },
	{ key: "RECIBIDO", name: "Recibido", kind: "RECEIVED", tone: "SUCCESS" },
	{ key: "CANCELADO", name: "Cancelado", kind: "CANCELLED", tone: "ERROR" },
];
```

with:

```ts
const STAGES: ImportStageOption[] = [
	{
		key: "PEDIDO",
		name: "Pedido",
		kind: "IN_PROGRESS",
		tone: "NEUTRAL",
		expectedLabels: [],
	},
	{
		key: "DOCS",
		name: "Documentos",
		kind: "IN_PROGRESS",
		tone: "NEUTRAL",
		expectedLabels: [],
	},
	{
		key: "RECIBIDO",
		name: "Recibido",
		kind: "RECEIVED",
		tone: "SUCCESS",
		expectedLabels: [],
	},
	{
		key: "CANCELADO",
		name: "Cancelado",
		kind: "CANCELLED",
		tone: "ERROR",
		expectedLabels: [],
	},
];
```

Replace:

```ts
		orderToReceivedDays: null,
	};
```

with:

```ts
		orderToReceivedDays: null,
		documents: [],
	};
```

In `apps/app/test/import-orders.spec.ts`, replace:

```ts
	return { key, name: key, kind: "IN_PROGRESS", tone: "NEUTRAL" };
```

with:

```ts
	return {
		key,
		name: key,
		kind: "IN_PROGRESS",
		tone: "NEUTRAL",
		expectedLabels: [],
	};
```

- [ ] **Step 8: Regenerate the router**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected, besides part 1 and any earlier hunks: an `importDocuments` router with `uploadToken`, `attach`, `remove` and `downloadUrl`, and the new detail fields inside `importOrderDetailOutput`. Never edit this file by hand.

- [ ] **Step 9: Type check and run the app tests**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=@crm/db && bun run check-types --filter=app`
Expected: no errors.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-order-pages.spec.ts test/import-orders.spec.ts`
Expected: the same pass count as before, 0 fail.

- [ ] **Step 10: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/test/import-documents.integration.spec.ts apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/app/test/import-order-pages.spec.ts apps/app/test/import-orders.spec.ts && bunx biome check apps/api/test/import-documents.integration.spec.ts apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/app/test/import-order-pages.spec.ts apps/app/test/import-orders.spec.ts`
Expected: no errors.

- [ ] **Step 11: Hand over**

Tell the owner: parts 4 and 5 are done, the documents spec has 18 passing tests, and part 6 (`docs/superpowers/plans/2026-11-16-shipment-documents-f.md`) is next. Do not commit.

---

## Self-review (parts 4 and 5)

| Brief item | Where |
| --- | --- |
| Handshake location decided and justified | Decision 1, spec *Why the handshake…* |
| Installed `@vercel/blob` types read, private access | Task 5 Step 1 checks the symbols; Step 2 uses `issueSignedToken`, `presignUrl`, `head`, `del`, `generateClientTokenFromReadWriteToken` |
| Type and size checked before the token | `uploadToken`; test "refuses a bad type…" |
| Attach checks the prefix and does not trust the client | `attach`; tests on foreign path, stored size, stored type |
| Delete: owner and admin, row then blob, logged | `remove`, `discard`; tests "removes the row even when the store fails", permissions |
| Download decided from private access | `downloadUrl`; test "gives a member a short signed link" |
| No token: disabled, never crashes | `requireStorage`, `documentsEnabled`; tests "refuses when storage…", "says whether storage…" |
| Closed shipment decided | Decision 6; test "allows … a file on a received shipment" |
| Archived label refused, kept on old files | Tests "refuses an archived or unknown label…", "keeps an archived label on its file" |
| Race tests | Attach twice, remove twice |
| `expectOutput` on every procedure | `detailOf`, `documentUploadOutput`, `documentDownloadOutput` |
| Detail extended with documents per shipment | Task 6 |

**Placeholder scan.** None. Every edit has exact old and new text.

**Name consistency.** `documentBlob` (Step 2) is imported by `ImportDocumentsService` and `ImportOrdersService`. `importDocuments.uploadToken`, `attach`, `remove`, `downloadUrl` are the names parts 6 and 7 call. `expectedLabels`, `documents`, `documentsEnabled` are the fields part 7 reads.

**Known risks.**
- Bun runs the spec files of one command in one process. The `spyOn` calls at module level stay active until this file's `afterAll`. If Bun ever evaluates two spec files before running either, another spec sees the fakes. Only `documentsEnabled` would change.
- `head` on a private blob with the read-write token is assumed from the 2.6.1 types (`head(urlOrPathname, BlobCommandOptions)`). No spec reaches Vercel, so the owner's browser checklist in part 8 is the first real proof.
- An upload whose `attach` never runs leaves a blob with no row. Nothing cleans it.
- The second of two racing attaches can fail on the unique index with a Prisma error instead of a `Conflict`. The screen shows a generic error for that click. The row is saved once.
