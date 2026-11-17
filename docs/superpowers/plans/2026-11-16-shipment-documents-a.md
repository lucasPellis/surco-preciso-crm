# Shipment Documents (part 1 of 8: rules and database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure document rules in `@crm/db/import-document` and the three new tables with their migration.

**Architecture:** `packages/db/src/import-document.ts` holds `IMPORT_DOCUMENT` and every pure rule: allowed types, size, safe name, pathname, prefix check, checklist. The browser and the API import it. One hand-written migration adds `DocumentDirection`, `document_label`, `import_stage_document` and `attachment`.

**Tech Stack:** bun test, Prisma 7.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

This is the first part.

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

## Decisions recorded in this plan

1. **Labels are a global list**, not per process. One *Packing list* label serves every process.
2. **Label names are unique ignoring case.** The table has a plain unique index. `create` and `update` take `pg_advisory_xact_lock(hashtext('document_label_name'))` before the check, so the race of the process names (A1 known risk) does not exist here. A test proves it.
3. **`direction` is required** on create and editable on update.
4. **`fileCount` and `stageCount`** in the list count every link, active stage or not. They tell the owner where a label is used.
5. **`importStages.setExpectedLabels({ key, labelIds })` replaces the active links of one stage.** Positions follow the input order. Links to archived labels stay, so a restore brings them back. Unknown or archived ids are `BadRequest`, and nothing changes.
6. **`expectedLabelIds` in `importStages.settings`** lists only active labels, by position, then by label name.
7. **A process duplicate copies the stage links** with the same positions, onto the new stage keys.
8. **The stage link follows the stage `key`**, with `ON DELETE CASCADE`, so `removeTestProcesses` needs no change. A label link is `RESTRICT`: labels are never deleted in the app.
9. **`Attachment.uploadedById` is optional with `SET NULL`**, like `ShipmentStageEvent.actorId`.
10. **20 MB and nine types** live in `IMPORT_DOCUMENT`. The type of a file comes from its extension first, then from the browser type. A Windows browser reports a CSV as `application/vnd.ms-excel`; the extension wins.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `packages/db/src/import-document.ts` | `IMPORT_DOCUMENT`, `DOCUMENT_ACCEPT`, `DOCUMENT_PROBLEM_MESSAGES`, `documentContentType`, `documentFileProblem`, `safeDocumentName`, `documentPathPrefix`, `documentPathname`, `isDocumentPathOf`, `documentChecklist` |
| `packages/db/test/import-document.spec.ts` | Unit tests |
| `packages/db/package.json` | `./import-document` export |
| `packages/db/prisma/schema.prisma` | `DocumentDirection`, `DocumentLabel`, `ImportStageDocument`, `Attachment`, back relations |
| `packages/db/prisma/migrations/20261116120000_shipment_documents/migration.sql` | Hand-written migration |

---

### Task 1: The pure document rules

**Files:**
- Create: `packages/db/src/import-document.ts`
- Create: `packages/db/test/import-document.spec.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Write the failing tests**

Create `packages/db/test/import-document.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	DOCUMENT_ACCEPT,
	documentChecklist,
	documentContentType,
	documentFileProblem,
	documentPathname,
	documentPathPrefix,
	IMPORT_DOCUMENT,
	isDocumentPathOf,
	safeDocumentName,
} from "../src/import-document";

const PDF = "application/pdf";

describe("documentChecklist", () => {
	it("finds an expected label on a file of any stage", () => {
		const invoice = { id: "invoice", name: "Commercial invoice" };
		const packing = { id: "packing", name: "Packing list" };
		const receipt = { id: "receipt", name: "Comprobante de pago" };

		const result = documentChecklist(
			[invoice, packing, receipt],
			[
				{ label: { id: "packing" } },
				{ label: null },
				{ label: { id: "other" } },
				{ label: { id: "packing" } },
			],
		);

		expect(result).toEqual({ present: [packing], missing: [invoice, receipt] });
	});

	it("misses everything when the shipment has no file", () => {
		const invoice = { id: "invoice", name: "Commercial invoice" };

		expect(documentChecklist([invoice], [])).toEqual({
			present: [],
			missing: [invoice],
		});
		expect(documentChecklist([], [{ label: { id: "x" } }])).toEqual({
			present: [],
			missing: [],
		});
	});
});

describe("documentContentType", () => {
	it("reads the type from the extension first", () => {
		expect(documentContentType("Factura.PDF", "")).toBe(PDF);
		expect(documentContentType("costos.csv", "application/vnd.ms-excel")).toBe(
			"text/csv",
		);
		expect(documentContentType("foto.jpeg", "image/jpeg")).toBe("image/jpeg");
		expect(documentContentType("packing.xlsx", "")).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
	});

	it("falls back to an allowed browser type and refuses the rest", () => {
		expect(documentContentType("sin-extension", "application/pdf")).toBe(PDF);
		expect(documentContentType("archivo.zip", "application/zip")).toBeNull();
		expect(documentContentType("pagina.html", "text/html")).toBeNull();
		expect(documentContentType("raro", "")).toBeNull();
	});

	it("lists every extension for the file picker", () => {
		expect(DOCUMENT_ACCEPT.split(",")).toEqual([
			".pdf",
			".jpg",
			".jpeg",
			".png",
			".webp",
			".xlsx",
			".xls",
			".docx",
			".csv",
			".txt",
		]);
	});
});

describe("documentFileProblem", () => {
	it("accepts an allowed type up to the limit", () => {
		expect(documentFileProblem({ contentType: PDF, size: 1 })).toBeNull();
		expect(
			documentFileProblem({ contentType: PDF, size: IMPORT_DOCUMENT.maxBytes }),
		).toBeNull();
		expect(IMPORT_DOCUMENT.maxBytes).toBe(20 * 1024 * 1024);
	});

	it("names the problem of a bad type, an empty file and a large file", () => {
		expect(documentFileProblem({ contentType: "text/html", size: 10 })).toBe(
			"TYPE",
		);
		expect(documentFileProblem({ contentType: PDF, size: 0 })).toBe("EMPTY");
		expect(
			documentFileProblem({
				contentType: PDF,
				size: IMPORT_DOCUMENT.maxBytes + 1,
			}),
		).toBe("TOO_LARGE");
	});
});

describe("paths", () => {
	it("makes a safe name that keeps the extension", () => {
		expect(safeDocumentName("Factura PI ñandú (1).PDF")).toBe(
			"Factura-PI-nandu-1.pdf",
		);
		expect(safeDocumentName(".pdf")).toBe("archivo.pdf");
		expect(safeDocumentName("sin extension")).toBe("sin-extension");
		expect(safeDocumentName("../../etc")).not.toContain("/");
		expect(
			safeDocumentName(`${"a".repeat(200)}.pdf`).length,
		).toBeLessThanOrEqual(IMPORT_DOCUMENT.safeNameMaxLength + 4);
	});

	it("builds the pathname under the shipment and the event", () => {
		const pathname = documentPathname({
			shipmentId: "s1",
			eventId: "e1",
			nonce: "n1",
			filename: "Packing list.xlsx",
		});

		expect(documentPathPrefix("s1", "e1")).toBe("import-documents/s1/e1/");
		expect(pathname).toBe("import-documents/s1/e1/n1-Packing-list.xlsx");
		expect(isDocumentPathOf(pathname, "s1", "e1")).toBe(true);
	});

	it("refuses a path of another event, a nested path and a bare prefix", () => {
		expect(isDocumentPathOf("import-documents/s1/e2/n1-a.pdf", "s1", "e1")).toBe(
			false,
		);
		expect(isDocumentPathOf("import-documents/s2/e1/n1-a.pdf", "s1", "e1")).toBe(
			false,
		);
		expect(
			isDocumentPathOf("import-documents/s1/e1/x/../a.pdf", "s1", "e1"),
		).toBe(false);
		expect(isDocumentPathOf("import-documents/s1/e1/", "s1", "e1")).toBe(false);
		expect(isDocumentPathOf("other/s1/e1/n1-a.pdf", "s1", "e1")).toBe(false);
	});
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-document.spec.ts`
Expected: FAIL. `Cannot find module '../src/import-document'`.

- [ ] **Step 3: Write the module**

Create `packages/db/src/import-document.ts`:

```ts
const KB = 1024;
const MB = 1024 * KB;
const MINUTE_MS = 60_000;
const MAX_MEGABYTES = 20;

type DocumentKind = { type: string; extensions: readonly string[] };

const DOCUMENT_KINDS: readonly DocumentKind[] = [
	{ type: "application/pdf", extensions: ["pdf"] },
	{ type: "image/jpeg", extensions: ["jpg", "jpeg"] },
	{ type: "image/png", extensions: ["png"] },
	{ type: "image/webp", extensions: ["webp"] },
	{
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		extensions: ["xlsx"],
	},
	{ type: "application/vnd.ms-excel", extensions: ["xls"] },
	{
		type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		extensions: ["docx"],
	},
	{ type: "text/csv", extensions: ["csv"] },
	{ type: "text/plain", extensions: ["txt"] },
];

export const IMPORT_DOCUMENT = {
	pathPrefix: "import-documents",
	access: "private",
	maxMegabytes: MAX_MEGABYTES,
	maxBytes: MAX_MEGABYTES * MB,
	filenameMaxLength: 200,
	safeNameMaxLength: 80,
	fallbackName: "archivo",
	labelNameMaxLength: 60,
	maxExpectedLabels: 20,
	uploadTokenTtlMs: 10 * MINUTE_MS,
	downloadUrlTtlMs: 5 * MINUTE_MS,
	kinds: DOCUMENT_KINDS,
} as const;

export type DocumentProblem = "TYPE" | "EMPTY" | "TOO_LARGE";

export const DOCUMENT_PROBLEM_MESSAGES: { [Problem in DocumentProblem]: string } =
	{
		TYPE: "Ese tipo de archivo no se acepta. Sube un PDF, una imagen, un Excel, un Word, un CSV o un texto.",
		EMPTY: "El archivo está vacío.",
		TOO_LARGE: `El archivo pasa el máximo de ${MAX_MEGABYTES} MB.`,
	};

export const DOCUMENT_ACCEPT = DOCUMENT_KINDS.flatMap((kind) =>
	kind.extensions.map((extension) => `.${extension}`),
).join(",");

export type FileShape = { contentType: string; size: number };

export type LabelRef = { id: string };

export type DocumentChecklist<Label extends LabelRef> = {
	present: Label[];
	missing: Label[];
};

function extensionOf(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

function isAllowedType(value: string): boolean {
	return DOCUMENT_KINDS.some((kind) => kind.type === value);
}

export function documentContentType(
	filename: string,
	browserType: string,
): string | null {
	const extension = extensionOf(filename);
	const byExtension = DOCUMENT_KINDS.find((kind) =>
		kind.extensions.includes(extension),
	);
	if (byExtension) return byExtension.type;
	const declared = browserType.split(";")[0]?.trim().toLowerCase() ?? "";
	return isAllowedType(declared) ? declared : null;
}

export function documentFileProblem(file: FileShape): DocumentProblem | null {
	if (!isAllowedType(file.contentType)) return "TYPE";
	if (!Number.isInteger(file.size) || file.size < 1) return "EMPTY";
	if (file.size > IMPORT_DOCUMENT.maxBytes) return "TOO_LARGE";
	return null;
}

function cleanPart(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-.]+|[-.]+$/g, "");
}

export function safeDocumentName(filename: string): string {
	const extension = extensionOf(filename);
	const base = extension
		? filename.slice(0, filename.length - extension.length - 1)
		: filename;
	const stem =
		cleanPart(base)
			.slice(0, IMPORT_DOCUMENT.safeNameMaxLength)
			.replace(/[-.]+$/, "") || IMPORT_DOCUMENT.fallbackName;
	const suffix = cleanPart(extension).toLowerCase();
	return suffix ? `${stem}.${suffix}` : stem;
}

export function documentPathPrefix(shipmentId: string, eventId: string): string {
	return `${IMPORT_DOCUMENT.pathPrefix}/${shipmentId}/${eventId}/`;
}

export function documentPathname(input: {
	shipmentId: string;
	eventId: string;
	nonce: string;
	filename: string;
}): string {
	return `${documentPathPrefix(input.shipmentId, input.eventId)}${input.nonce}-${safeDocumentName(input.filename)}`;
}

export function isDocumentPathOf(
	pathname: string,
	shipmentId: string,
	eventId: string,
): boolean {
	const prefix = documentPathPrefix(shipmentId, eventId);
	if (!pathname.startsWith(prefix)) return false;
	const rest = pathname.slice(prefix.length);
	return rest.length > 0 && !rest.includes("/");
}

export function documentChecklist<Label extends LabelRef>(
	expected: readonly Label[],
	documents: ReadonlyArray<{ label: LabelRef | null }>,
): DocumentChecklist<Label> {
	const found = new Set(
		documents.flatMap((document) =>
			document.label ? [document.label.id] : [],
		),
	);
	return {
		present: expected.filter((label) => found.has(label.id)),
		missing: expected.filter((label) => !found.has(label.id)),
	};
}
```

The module imports nothing. A `"use client"` file may import it.

- [ ] **Step 4: Export the subpath**

In `packages/db/package.json`, replace:

```json
		"./import-order": "./src/import-order.ts",
```

with:

```json
		"./import-document": "./src/import-document.ts",
		"./import-order": "./src/import-order.ts",
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-document.spec.ts`
Expected: 10 pass, 0 fail. If `safeDocumentName("Factura PI ñandú (1).PDF")` gives another text, stop and report the actual value. Do not change the test without the owner's OK.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/db/src/import-document.ts packages/db/test/import-document.spec.ts packages/db/package.json && bunx biome check packages/db/src/import-document.ts packages/db/test/import-document.spec.ts packages/db/package.json`
Expected: no errors.

---

### Task 2: Schema and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261116120000_shipment_documents/migration.sql`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- packages/db/prisma/schema.prisma && fd -t d . packages/db/prisma/migrations | tail -1 && rtk proxy rg -n "model Attachment|model DocumentLabel|enum DocumentDirection" packages/db/prisma/schema.prisma`
Expected: no diff, then `packages/db/prisma/migrations/20261115120000_import_processes/`, then no match. Anything else: stop and ask the owner.

- [ ] **Step 2: Add the back relation on `User`**

Replace:

```prisma
  shipmentStageEvents ShipmentStageEvent[] @relation("ShipmentStageEventActor")
```

with:

```prisma
  shipmentStageEvents ShipmentStageEvent[] @relation("ShipmentStageEventActor")
  uploadedAttachments Attachment[]         @relation("AttachmentUploader")
```

- [ ] **Step 3: Add the back relation on `ImportStage`**

Replace:

```prisma
  shipments Shipment[]
  events    ShipmentStageEvent[]
  createdAt DateTime             @default(now())
```

with:

```prisma
  shipments Shipment[]
  events    ShipmentStageEvent[]
  documents ImportStageDocument[]
  createdAt DateTime             @default(now())
```

- [ ] **Step 4: Add the back relation on `ShipmentStageEvent` and the new models**

Replace:

```prisma
  actor      User?       @relation("ShipmentStageEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  createdAt  DateTime    @default(now())

  @@index([shipmentId, occurredAt])
  @@index([stageKey])
  @@map("shipment_stage_event")
}
```

with:

```prisma
  actor      User?       @relation("ShipmentStageEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  createdAt  DateTime    @default(now())

  attachments Attachment[]

  @@index([shipmentId, occurredAt])
  @@index([stageKey])
  @@map("shipment_stage_event")
}

enum DocumentDirection {
  IN
  OUT
}

model DocumentLabel {
  id         String            @id @default(cuid())
  name       String            @unique
  direction  DocumentDirection
  archivedAt DateTime?

  stages      ImportStageDocument[]
  attachments Attachment[]
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([archivedAt])
  @@map("document_label")
}

model ImportStageDocument {
  stageKey String
  stage    ImportStage   @relation(fields: [stageKey], references: [key], onDelete: Cascade)
  labelId  String
  label    DocumentLabel @relation(fields: [labelId], references: [id], onDelete: Restrict)
  position Int

  @@id([stageKey, labelId])
  @@index([labelId])
  @@map("import_stage_document")
}

model Attachment {
  id                   String             @id @default(cuid())
  pathname             String             @unique
  filename             String
  contentType          String
  size                 Int
  labelId              String?
  label                DocumentLabel?     @relation(fields: [labelId], references: [id], onDelete: Restrict)
  uploadedById         String?
  uploadedBy           User?              @relation("AttachmentUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  shipmentStageEventId String
  shipmentStageEvent   ShipmentStageEvent @relation(fields: [shipmentStageEventId], references: [id], onDelete: Cascade)
  createdAt            DateTime           @default(now())

  @@index([shipmentStageEventId])
  @@index([labelId])
  @@map("attachment")
}
```

- [ ] **Step 5: Write the migration**

Create `packages/db/prisma/migrations/20261116120000_shipment_documents/migration.sql`:

```sql
CREATE TYPE "DocumentDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "document_label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "DocumentDirection" NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_label_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_stage_document" (
    "stageKey" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "import_stage_document_pkey" PRIMARY KEY ("stageKey","labelId")
);

CREATE TABLE "attachment" (
    "id" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "labelId" TEXT,
    "uploadedById" TEXT,
    "shipmentStageEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_label_name_key" ON "document_label"("name");

CREATE INDEX "document_label_archivedAt_idx" ON "document_label"("archivedAt");

CREATE INDEX "import_stage_document_labelId_idx" ON "import_stage_document"("labelId");

CREATE UNIQUE INDEX "attachment_pathname_key" ON "attachment"("pathname");

CREATE INDEX "attachment_shipmentStageEventId_idx" ON "attachment"("shipmentStageEventId");

CREATE INDEX "attachment_labelId_idx" ON "attachment"("labelId");

ALTER TABLE "import_stage_document" ADD CONSTRAINT "import_stage_document_stageKey_fkey" FOREIGN KEY ("stageKey") REFERENCES "import_stage"("key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_stage_document" ADD CONSTRAINT "import_stage_document_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "document_label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "document_label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_shipmentStageEventId_fkey" FOREIGN KEY ("shipmentStageEventId") REFERENCES "shipment_stage_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 6: Generate the client (no database needed)**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run db:generate`
Expected: Prisma Client generated, no validation error. If Prisma reports an error, stop and report the message. Do not change a relation on your own.
Check: `rtk proxy rg -n "DocumentDirection" packages/db/src/generated/prisma/enums.ts` prints at least one line.

- [ ] **Step 7: Stop and ask the owner to apply the migration**

Tell the owner to run both commands from the repo root:
1. `bun --env-file=.env run --filter=@crm/db db:deploy` applies the migration to the `crm` database.
2. `bun --env-file=.env run db:test` applies it to the throwaway `crm_test` database.

Without command 2 every integration test of this plan fails with `relation "document_label" does not exist`. Wait for the owner to confirm. Do not run either command yourself.

---

## Hand over

After Task 2 Step 7 the owner applies the migration. Then part 2 (`2026-11-16-shipment-documents-b.md`) is next. Do not commit.
