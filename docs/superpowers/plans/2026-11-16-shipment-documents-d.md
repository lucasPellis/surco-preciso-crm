# Shipment Documents (part 4 of 8: upload token and attach) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API issues an upload token for one pathname and saves the file row after the browser uploads, trusting nothing but the file name.

**Architecture:** Every Vercel Blob call goes through one object, `documentBlob`, in `packages/db/src/import-document-blob.ts`, the package that already owns `@vercel/blob` 2.6.1 (`packages/db/src/blob.ts` is the pattern: dynamic import, `blobEnabled()`). A new Nest module `import-documents` owns the router `importDocuments`. It imports `ImportOrdersModule` and returns `ImportOrdersService.detail`, so every write refreshes the order page like the other import mutations. The specs replace the methods of `documentBlob` with `spyOn`; no spec reaches Vercel.

**Tech Stack:** bun test, Prisma 7, NestJS with `nestjs-trpc`, Zod 4. `@vercel/blob` 2.6.1.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Parts 1 to 3 must be done.

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

## Decisions recorded in this part

1. **No REST route, no `handleUpload`.** `importDocuments.uploadToken` runs the checks of `onBeforeGenerateToken` and calls `generateClientTokenFromReadWriteToken`. The browser uploads with `put` from `@vercel/blob/client` (part 7). Reason: `docs/api.md` keeps REST for auth and health, and `onUploadCompleted` needs a callback URL a local install does not have.
2. **The server builds the pathname** (`documentPathname`, with `randomUUID()` as the nonce). The token is valid for that pathname only, 10 minutes, one content type, `maximumSizeInBytes` from the config, `addRandomSuffix: false`, `allowOverwrite: false`.
3. **`attach` trusts no browser value but the file name.** Size and type come from `head`. The pathname must sit under the prefix of the given event.
4. **A refusal after the upload removes the blob**: oversize or wrong type in the store, unknown or archived label. A missing blob and a pathname that already has a row remove nothing.
5. **Two attaches of one pathname keep one row.** The second sees the row (`Conflict`) or hits the unique index. A test proves it.
6. **Files are allowed on closed shipments and archived orders.** Only the role matters.
7. **`remove` deletes the row first, then the blob.** A failed blob removal is a `warn` log with the document id. Two removes at once: one succeeds, one is `NotFound`.
8. **`downloadUrl` is a query** any signed-in user may call. It returns a URL valid 5 minutes from `issueSignedToken` plus `presignUrl` with `access: IMPORT_DOCUMENT.access`.
9. **No storage** (`documentBlob.enabled()` false): `uploadToken`, `attach` and `downloadUrl` throw `Conflict` with a sentence that names `BLOB_READ_WRITE_TOKEN`. `remove` still deletes the row. The detail carries `documentsEnabled`.
10. **The detail gets `stages[].expectedLabels`** (active labels, by position then name), **`shipments[].documents`** (every file of every event, in event order) and **`documentsEnabled`**. No separate list procedure: the order page already reads the detail, and `cache.importOrders()` already refreshes it.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `packages/db/src/import-document-blob.ts` | `documentBlob`: `enabled`, `clientToken`, `stat`, `remove`, `downloadUrl` |
| `packages/db/package.json` | `./import-document-blob` export |
| `apps/api/src/import-documents/import-documents.{contracts,service,router,module}.ts` | Files API |
| `apps/api/src/import-orders/import-orders.module.ts` | Exports `ImportOrdersService` |
| `apps/api/src/app.module.ts` | Registers `ImportDocumentsModule` |
| `apps/api/test/import-documents.integration.spec.ts` | Files tests |

---

### Task 5a: Upload token and attach

**Files:**
- Create: `packages/db/src/import-document-blob.ts`
- Modify: `packages/db/package.json`
- Create: `apps/api/src/import-documents/import-documents.contracts.ts`
- Create: `apps/api/src/import-documents/import-documents.service.ts`
- Create: `apps/api/src/import-documents/import-documents.router.ts`
- Create: `apps/api/src/import-documents/import-documents.module.ts`
- Modify: `apps/api/src/import-orders/import-orders.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/import-documents.integration.spec.ts`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy rg -n "DocumentLabelsModule|providers: \[ImportOrdersService, ImportOrdersRouter\]" apps/api/src/app.module.ts apps/api/src/import-orders/import-orders.module.ts && rtk proxy rg -n "generateClientTokenFromReadWriteToken|declare function issueSignedToken|declare function presignUrl|declare function head|BlobNotFoundError extends" node_modules/.bun/@vercel+blob@2.6.1/node_modules/@vercel/blob/dist/client.d.ts node_modules/.bun/@vercel+blob@2.6.1/node_modules/@vercel/blob/dist/index.d.ts node_modules/.bun/@vercel+blob@2.6.1/node_modules/@vercel/blob/dist/create-folder-DAlHaCQ2.d.ts`
Expected: `DocumentLabelsModule` twice in `app.module.ts`, the providers line once, and each Blob symbol at least once. Otherwise stop and ask the owner.

- [ ] **Step 2: Write the Blob wrapper**

Create `packages/db/src/import-document-blob.ts`:

```ts
import { blobEnabled } from "./blob";
import { IMPORT_DOCUMENT } from "./import-document";

export type StoredDocument = {
	pathname: string;
	size: number;
	contentType: string;
};

export const documentBlob = {
	enabled(): boolean {
		return blobEnabled();
	},

	async clientToken(input: {
		pathname: string;
		contentType: string;
		validUntil: number;
	}): Promise<string> {
		const { generateClientTokenFromReadWriteToken } = await import(
			"@vercel/blob/client"
		);
		return generateClientTokenFromReadWriteToken({
			pathname: input.pathname,
			allowedContentTypes: [input.contentType],
			maximumSizeInBytes: IMPORT_DOCUMENT.maxBytes,
			validUntil: input.validUntil,
			addRandomSuffix: false,
			allowOverwrite: false,
		});
	},

	async stat(pathname: string): Promise<StoredDocument | null> {
		const { BlobNotFoundError, head } = await import("@vercel/blob");
		try {
			const found = await head(pathname);
			return {
				pathname: found.pathname,
				size: found.size,
				contentType: found.contentType,
			};
		} catch (error) {
			if (error instanceof BlobNotFoundError) return null;
			throw error;
		}
	},

	async remove(pathname: string): Promise<void> {
		const { del } = await import("@vercel/blob");
		await del(pathname);
	},

	async downloadUrl(pathname: string, validUntil: number): Promise<string> {
		const { issueSignedToken, presignUrl } = await import("@vercel/blob");
		const signed = await issueSignedToken({
			pathname,
			operations: ["get"],
			validUntil,
		});
		const { presignedUrl } = await presignUrl(signed, {
			operation: "get",
			pathname,
			validUntil,
			access: IMPORT_DOCUMENT.access,
		});
		return presignedUrl;
	},
};
```

This module is server only. A `"use client"` file never imports it.

In `packages/db/package.json`, replace:

```json
		"./import-document": "./src/import-document.ts",
```

with:

```json
		"./import-document": "./src/import-document.ts",
		"./import-document-blob": "./src/import-document-blob.ts",
```

- [ ] **Step 3: Write the failing tests**

Create `apps/api/test/import-documents.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { DocumentDirection } from "@crm/db/enums";
import {
	documentPathname,
	documentPathPrefix,
	IMPORT_DOCUMENT,
	isDocumentPathOf,
} from "@crm/db/import-document";
import { documentBlob } from "@crm/db/import-document-blob";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
import {
	type DocumentAttachInput,
	type DocumentUploadInput,
	documentAttachInput,
	documentUploadOutput,
} from "../src/import-documents/import-documents.contracts";
import { ImportDocumentsService } from "../src/import-documents/import-documents.service";
import {
	type ImportOrderDetail,
	importOrderDetailOutput,
} from "../src/import-orders/import-orders.contracts";
import { ImportOrdersService } from "../src/import-orders/import-orders.service";
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `idoc-admin-${suffix}`;
const memberId = `idoc-member-${suffix}`;
const prefix = `ID${token}`;
const NOW = new Date("2026-03-01T15:00:00.000Z");
const PDF = "application/pdf";
const SIGNED = "https://blob.example.test/signed";

const ordersService = new ImportOrdersService(db);
const service = new ImportDocumentsService(db, ordersService);
const detailOf = (value: ImportOrderDetail) =>
	expectOutput(importOrderDetailOutput, value);

const enabled = spyOn(documentBlob, "enabled").mockReturnValue(true);
const clientToken = spyOn(documentBlob, "clientToken").mockResolvedValue(
	"client-token",
);
const stat = spyOn(documentBlob, "stat").mockImplementation(
	async (pathname: string) => ({ pathname, size: 2048, contentType: PDF }),
);
const removeBlob = spyOn(documentBlob, "remove").mockResolvedValue(undefined);
const signedUrl = spyOn(documentBlob, "downloadUrl").mockResolvedValue(SIGNED);

let processRef: TestProcess;
let productId: string;
let labelId: string;
let archivedLabelId: string;

function shipmentOf(order: ImportOrderDetail) {
	const shipment = order.shipments[0];
	if (!shipment) throw new Error("The order has no shipment.");
	return shipment;
}

function eventOf(order: ImportOrderDetail) {
	const event = shipmentOf(order).events.at(-1);
	if (!event) throw new Error("The shipment has no event.");
	return event;
}

async function shipmentOrder(): Promise<ImportOrderDetail> {
	const order = await ordersService.create(
		adminId,
		{
			supplierName: "Proveedor de prueba",
			orderedAt: "2026-01-05",
			notes: "",
			processId: processRef.id,
			lines: [{ productId, quantity: 4, unitCostCents: 1000, dealId: null }],
		},
		NOW,
	);
	const line = order.lines[0];
	if (!line) throw new Error("The order has no line.");
	return detailOf(
		await ordersService.createShipment(
			adminId,
			{
				orderId: order.id,
				reference: "",
				trackingNumber: "",
				occurredAt: "2026-01-10",
				lines: [{ orderLineId: line.id, quantity: 4 }],
			},
			NOW,
		),
	);
}

function upload(
	order: ImportOrderDetail,
	overrides: Partial<DocumentUploadInput> = {},
) {
	return service.uploadToken(
		adminId,
		{
			eventId: eventOf(order).id,
			filename: "Factura PI.pdf",
			contentType: PDF,
			size: 2048,
			...overrides,
		},
		NOW,
	);
}

async function uploaded(
	order: ImportOrderDetail,
	overrides: Partial<DocumentAttachInput> = {},
) {
	const ticket = await upload(order);
	return detailOf(
		await service.attach(
			adminId,
			{
				eventId: eventOf(order).id,
				pathname: ticket.pathname,
				filename: "Factura PI.pdf",
				labelId,
				...overrides,
			},
			NOW,
		),
	);
}

function filesOf(order: ImportOrderDetail) {
	return db.attachment.findMany({
		where: { shipmentStageEvent: { shipmentId: shipmentOf(order).id } },
		orderBy: { createdAt: "asc" },
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
				name: "Import Document Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Document Member",
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
	processRef = await createTestProcess(`Documentos envío ${suffix}`);
	productId = (
		await db.product.create({
			data: { sku: `${prefix}-A`, name: "Equipo A" },
			select: { id: true },
		})
	).id;
	labelId = (
		await db.documentLabel.create({
			data: { name: `${prefix} Factura`, direction: DocumentDirection.IN },
			select: { id: true },
		})
	).id;
	archivedLabelId = (
		await db.documentLabel.create({
			data: {
				name: `${prefix} Vieja`,
				direction: DocumentDirection.IN,
				archivedAt: new Date(),
			},
			select: { id: true },
		})
	).id;
});

afterAll(async () => {
	for (const spy of [enabled, clientToken, stat, removeBlob, signedUrl]) {
		spy.mockRestore();
	}
	await removeTestProcesses([processRef.id]);
	await db.documentLabel.deleteMany({ where: { name: { startsWith: prefix } } });
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
	await db.member.deleteMany({ where: { userId: { in: [adminId, memberId] } } });
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("upload token", () => {
	it("issues a token for one path under the shipment event", async () => {
		const order = await shipmentOrder();

		const ticket = expectOutput(documentUploadOutput, await upload(order));

		expect(
			isDocumentPathOf(ticket.pathname, shipmentOf(order).id, eventOf(order).id),
		).toBe(true);
		expect(ticket.pathname.endsWith("-Factura-PI.pdf")).toBe(true);
		expect(ticket.token).toBe("client-token");
		expect(clientToken).toHaveBeenLastCalledWith({
			pathname: ticket.pathname,
			contentType: PDF,
			validUntil: NOW.getTime() + IMPORT_DOCUMENT.uploadTokenTtlMs,
		});
	});

	it("refuses a bad type, an empty file and a large file before any token", async () => {
		const order = await shipmentOrder();
		const before = clientToken.mock.calls.length;

		await expect(
			upload(order, { contentType: "application/zip" }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(upload(order, { size: 0 })).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await expect(
			upload(order, { size: IMPORT_DOCUMENT.maxBytes + 1 }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			upload(order, { eventId: `missing-${suffix}` }),
		).rejects.toBeInstanceOf(NotFoundException);
		expect(clientToken.mock.calls.length).toBe(before);
	});

	it("refuses when storage is not configured", async () => {
		const order = await shipmentOrder();
		enabled.mockReturnValueOnce(false);

		await expect(upload(order)).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("attaching a file", () => {
	it("saves the size and type of the store, not of the browser", async () => {
		const order = await shipmentOrder();
		const ticket = await upload(order, { size: 1 });
		stat.mockImplementationOnce(async (pathname: string) => ({
			pathname,
			size: 4096,
			contentType: PDF,
		}));

		detailOf(
			await service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: ticket.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		);

		const row = await db.attachment.findUniqueOrThrow({
			where: { pathname: ticket.pathname },
		});
		expect(row).toMatchObject({
			filename: "Factura PI.pdf",
			size: 4096,
			contentType: PDF,
			labelId,
			uploadedById: adminId,
			shipmentStageEventId: eventOf(order).id,
		});
	});

	it("refuses a path of another shipment and a nested path, and reads nothing", async () => {
		const order = await shipmentOrder();
		const other = await shipmentOrder();
		const foreign = documentPathname({
			shipmentId: shipmentOf(other).id,
			eventId: eventOf(other).id,
			nonce: "n1",
			filename: "x.pdf",
		});
		const nested = `${documentPathPrefix(shipmentOf(order).id, eventOf(order).id)}a/b.pdf`;
		const reads = stat.mock.calls.length;

		for (const pathname of [foreign, nested]) {
			await expect(
				service.attach(
					adminId,
					{ eventId: eventOf(order).id, pathname, filename: "x.pdf", labelId: null },
					NOW,
				),
			).rejects.toBeInstanceOf(BadRequestException);
		}
		expect(stat.mock.calls.length).toBe(reads);
		expect(await filesOf(order)).toEqual([]);
	});

	it("refuses a file the store does not have and removes nothing", async () => {
		const order = await shipmentOrder();
		const ticket = await upload(order);
		stat.mockResolvedValueOnce(null);
		const removals = removeBlob.mock.calls.length;

		await expect(
			service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: ticket.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(removeBlob.mock.calls.length).toBe(removals);
	});

	it("removes a stored file that breaks the rule", async () => {
		const order = await shipmentOrder();
		const large = await upload(order);
		stat.mockImplementationOnce(async (pathname: string) => ({
			pathname,
			size: IMPORT_DOCUMENT.maxBytes + 1,
			contentType: PDF,
		}));

		await expect(
			service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: large.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(removeBlob).toHaveBeenCalledWith(large.pathname);

		const html = await upload(order);
		stat.mockImplementationOnce(async (pathname: string) => ({
			pathname,
			size: 10,
			contentType: "text/html",
		}));
		await expect(
			service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: html.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(removeBlob).toHaveBeenCalledWith(html.pathname);
		expect(await filesOf(order)).toEqual([]);
	});

	it("refuses an archived or unknown label and removes the upload", async () => {
		const order = await shipmentOrder();

		for (const badLabel of [archivedLabelId, `missing-${suffix}`]) {
			const ticket = await upload(order);
			await expect(
				service.attach(
					adminId,
					{
						eventId: eventOf(order).id,
						pathname: ticket.pathname,
						filename: "Factura PI.pdf",
						labelId: badLabel,
					},
					NOW,
				),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(removeBlob).toHaveBeenCalledWith(ticket.pathname);
		}
		expect(await filesOf(order)).toEqual([]);
	});

	it("allows a file without a label and a file on a received shipment", async () => {
		const order = await shipmentOrder();
		await uploaded(order, { labelId: null });
		const received = detailOf(
			await ordersService.moveShipment(
				adminId,
				{
					shipmentId: shipmentOf(order).id,
					targetKey: processRef.receivedKey,
					occurredAt: "2026-01-20",
				},
				NOW,
			),
		);

		await uploaded(received);

		const files = await filesOf(order);
		expect(files.map((file) => file.labelId)).toEqual([null, labelId]);
		expect(files[1]?.shipmentStageEventId).toBe(eventOf(received).id);
	});

	it("keeps one row when the same upload is attached twice at once", async () => {
		const order = await shipmentOrder();
		const ticket = await upload(order);
		const input = {
			eventId: eventOf(order).id,
			pathname: ticket.pathname,
			filename: "Doble.pdf",
			labelId: null,
		};
		const removals = removeBlob.mock.calls.length;

		const results = await Promise.allSettled([
			service.attach(adminId, input, NOW),
			service.attach(adminId, input, NOW),
		]);

		expect(results.filter((result) => result.status === "fulfilled").length).toBe(
			1,
		);
		expect(
			await db.attachment.count({ where: { pathname: ticket.pathname } }),
		).toBe(1);
		expect(removeBlob.mock.calls.length).toBe(removals);
	});

	it("validates the attach at the boundary", () => {
		const valid = {
			eventId: "e-1",
			pathname: "import-documents/s/e/n-a.pdf",
			filename: "a.pdf",
			labelId: null,
		};

		expect(documentAttachInput.safeParse(valid).success).toBe(true);
		expect(
			documentAttachInput.safeParse({ ...valid, filename: " " }).success,
		).toBe(false);
		expect(
			documentAttachInput.safeParse({
				...valid,
				filename: "x".repeat(IMPORT_DOCUMENT.filenameMaxLength + 1),
			}).success,
		).toBe(false);
	});
});

```

- [ ] **Step 4: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-documents.integration.spec.ts`
Expected: FAIL. `Cannot find module '../src/import-documents/import-documents.contracts'`.

- [ ] **Step 5: Write the contracts**

Create `apps/api/src/import-documents/import-documents.contracts.ts`:

```ts
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { z } from "zod";

const recordId = z.string().min(1);

const filename = z
	.string()
	.trim()
	.min(1, "El archivo necesita un nombre.")
	.max(
		IMPORT_DOCUMENT.filenameMaxLength,
		`Máximo ${IMPORT_DOCUMENT.filenameMaxLength} caracteres.`,
	);

export const documentUploadInput = z.object({
	eventId: recordId,
	filename,
	contentType: z.string().trim().min(1),
	size: z.number().int().min(0),
});

export const documentUploadOutput = z.object({
	pathname: z.string(),
	token: z.string(),
});

export const documentAttachInput = z.object({
	eventId: recordId,
	pathname: z.string().min(1),
	filename,
	labelId: recordId.nullable(),
});

export const documentIdInput = z.object({ id: recordId });

export const documentDownloadOutput = z.object({ url: z.url() });

export type DocumentUploadInput = z.infer<typeof documentUploadInput>;
export type DocumentUpload = z.infer<typeof documentUploadOutput>;
export type DocumentAttachInput = z.infer<typeof documentAttachInput>;
export type DocumentIdInput = z.infer<typeof documentIdInput>;
export type DocumentDownload = z.infer<typeof documentDownloadOutput>;
```

- [ ] **Step 6: Write the service**

Create `apps/api/src/import-documents/import-documents.service.ts`:

```ts
import { randomUUID } from "node:crypto";
import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db } from "@crm/db";
import {
	DOCUMENT_PROBLEM_MESSAGES,
	documentFileProblem,
	documentPathname,
	IMPORT_DOCUMENT,
	isDocumentPathOf,
} from "@crm/db/import-document";
import { documentBlob } from "@crm/db/import-document-blob";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { ImportOrderDetail } from "../import-orders/import-orders.contracts";
import { ImportOrdersService } from "../import-orders/import-orders.service";
import type {
	DocumentAttachInput,
	DocumentUpload,
	DocumentUploadInput,
} from "./import-documents.contracts";

const NO_STORAGE =
	"Para guardar documentos falta configurar el almacenamiento de archivos (BLOB_READ_WRITE_TOKEN).";

type EventRef = { id: string; shipmentId: string; orderId: string };

@Injectable()
export class ImportDocumentsService {
	private readonly logger = new Logger(ImportDocumentsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(ImportOrdersService) private readonly orders: ImportOrdersService,
	) {}

	async uploadToken(
		actingUserId: string,
		input: DocumentUploadInput,
		now: Date = new Date(),
	): Promise<DocumentUpload> {
		await this.requireManager(actingUserId);
		this.requireStorage();
		const problem = documentFileProblem(input);
		if (problem) {
			throw new BadRequestException(DOCUMENT_PROBLEM_MESSAGES[problem]);
		}
		const event = await this.eventOf(input.eventId);
		const pathname = documentPathname({
			shipmentId: event.shipmentId,
			eventId: event.id,
			nonce: randomUUID(),
			filename: input.filename,
		});
		const token = await documentBlob.clientToken({
			pathname,
			contentType: input.contentType,
			validUntil: now.getTime() + IMPORT_DOCUMENT.uploadTokenTtlMs,
		});
		return { pathname, token };
	}

	async attach(
		actingUserId: string,
		input: DocumentAttachInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		this.requireStorage();
		const event = await this.eventOf(input.eventId);
		if (!isDocumentPathOf(input.pathname, event.shipmentId, event.id)) {
			throw new BadRequestException(
				"El archivo no pertenece a esa etapa del envío.",
			);
		}
		const saved = await this.db.attachment.findUnique({
			where: { pathname: input.pathname },
			select: { id: true },
		});
		if (saved) {
			throw new ConflictException("Ese archivo ya está guardado.");
		}
		const stored = await documentBlob.stat(input.pathname);
		if (!stored) {
			throw new BadRequestException(
				"El archivo no llegó al almacenamiento. Súbelo de nuevo.",
			);
		}
		const problem = documentFileProblem(stored);
		const refusal = problem
			? new BadRequestException(DOCUMENT_PROBLEM_MESSAGES[problem])
			: await this.labelRefusal(input.labelId);
		if (refusal) {
			await this.discard(input.pathname, null);
			throw refusal;
		}
		await this.db.attachment.create({
			data: {
				pathname: input.pathname,
				filename: input.filename,
				contentType: stored.contentType,
				size: stored.size,
				labelId: input.labelId,
				uploadedById: actingUserId,
				shipmentStageEventId: event.id,
			},
			select: { id: true },
		});

		return this.orders.detail(actingUserId, event.orderId, now);
	}

	private async eventOf(eventId: string): Promise<EventRef> {
		const event = await this.db.shipmentStageEvent.findUnique({
			where: { id: eventId },
			select: { id: true, shipmentId: true, shipment: { select: { orderId: true } } },
		});
		if (!event) {
			throw new NotFoundException("No existe esa etapa del envío.");
		}
		return {
			id: event.id,
			shipmentId: event.shipmentId,
			orderId: event.shipment.orderId,
		};
	}

	private async labelRefusal(
		labelId: string | null,
	): Promise<BadRequestException | null> {
		if (!labelId) return null;
		const label = await this.db.documentLabel.findUnique({
			where: { id: labelId },
			select: { archivedAt: true },
		});
		if (!label) return new BadRequestException("Esa etiqueta no existe.");
		if (label.archivedAt) {
			return new BadRequestException(
				"Esa etiqueta está archivada. Elige otra o restáurala.",
			);
		}
		return null;
	}

	private async discard(
		pathname: string,
		documentId: string | null,
	): Promise<void> {
		try {
			await documentBlob.remove(pathname);
		} catch (error) {
			this.logger.warn({
				message: "Import document blob not removed",
				document: documentId,
				reason: error instanceof Error ? error.name : "unknown",
			});
		}
	}

	private requireStorage(): void {
		if (!documentBlob.enabled()) {
			throw new ConflictException(NO_STORAGE);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede subir o eliminar documentos.",
			);
		}
	}
}
```

- [ ] **Step 7: Write the router and the module**

Create `apps/api/src/import-documents/import-documents.router.ts`:

```ts
import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Router, UseMiddlewares } from "nestjs-trpc";
import { importOrderDetailOutput } from "../import-orders/import-orders.contracts";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	type DocumentAttachInput,
	type DocumentUploadInput,
	documentAttachInput,
	documentUploadInput,
	documentUploadOutput,
} from "./import-documents.contracts";
import { ImportDocumentsService } from "./import-documents.service";

const TAGS = ["Import documents"];

@Router({ alias: "importDocuments" })
@UseMiddlewares(AuthMiddleware)
export class ImportDocumentsRouter {
	constructor(
		@Inject(ImportDocumentsService)
		private readonly documents: ImportDocumentsService,
	) {}

	@Mutation({
		input: documentUploadInput,
		output: documentUploadOutput,
		meta: restMeta("POST", "/import-documents/upload-token", TAGS),
	})
	async uploadToken(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentUploadInput,
	) {
		return this.documents.uploadToken(ctx.user.id, input);
	}

	@Mutation({
		input: documentAttachInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-documents", TAGS),
	})
	async attach(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentAttachInput,
	) {
		return this.documents.attach(ctx.user.id, input);
	}
}
```

Create `apps/api/src/import-documents/import-documents.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ImportOrdersModule } from "../import-orders/import-orders.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportDocumentsRouter } from "./import-documents.router";
import { ImportDocumentsService } from "./import-documents.service";

@Module({
	imports: [TrpcModule, ImportOrdersModule],
	providers: [ImportDocumentsService, ImportDocumentsRouter],
})
export class ImportDocumentsModule {}
```

In `apps/api/src/import-orders/import-orders.module.ts`, replace:

```ts
	providers: [ImportOrdersService, ImportOrdersRouter],
})
```

with:

```ts
	providers: [ImportOrdersService, ImportOrdersRouter],
	exports: [ImportOrdersService],
})
```

- [ ] **Step 8: Register the module**

Run `rtk proxy git diff --no-color HEAD -- apps/api/src/app.module.ts` first. In `apps/api/src/app.module.ts`, replace:

```ts
import { ImportOrdersModule } from "./import-orders/import-orders.module";
```

with:

```ts
import { ImportDocumentsModule } from "./import-documents/import-documents.module";
import { ImportOrdersModule } from "./import-orders/import-orders.module";
```

Replace:

```ts
		DocumentLabelsModule,
```

with:

```ts
		DocumentLabelsModule,
		ImportDocumentsModule,
```

- [ ] **Step 9: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-documents.integration.spec.ts`
Expected: 11 pass, 0 fail.

If "keeps one row when the same upload is attached twice at once" shows 2 fulfilled, stop and report. Do not change the test.

- [ ] **Step 10: Prove the prefix check matters**

In `attach`, change `if (!isDocumentPathOf(input.pathname, event.shipmentId, event.id)) {` to `if (false) {`. Run Step 9.
Expected: "refuses a path of another shipment and a nested path, and reads nothing" fails. Undo the change exactly and run Step 9 again. Expected: 11 pass.

- [ ] **Step 11: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/db/src/import-document-blob.ts packages/db/package.json apps/api/src/import-documents/import-documents.contracts.ts apps/api/src/import-documents/import-documents.service.ts apps/api/src/import-documents/import-documents.router.ts apps/api/src/import-documents/import-documents.module.ts apps/api/src/import-orders/import-orders.module.ts apps/api/src/app.module.ts apps/api/test/import-documents.integration.spec.ts && bunx biome check packages/db/src/import-document-blob.ts packages/db/package.json apps/api/src/import-documents/import-documents.contracts.ts apps/api/src/import-documents/import-documents.service.ts apps/api/src/import-documents/import-documents.router.ts apps/api/src/import-documents/import-documents.module.ts apps/api/src/import-orders/import-orders.module.ts apps/api/src/app.module.ts apps/api/test/import-documents.integration.spec.ts`
Expected: no errors.

---

## Hand over

After Task 5a, part 5 (`2026-11-16-shipment-documents-e.md`) is next. Do not commit.
