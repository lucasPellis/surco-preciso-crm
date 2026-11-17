# Shipment Documents (part 8 of 8: stage editor, seed, docs and checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the stage editor pick expected labels, seed the labels and the checklist of *Courier Argentina*, write the docs, run every check, and hand the owner a browser checklist.

**Architecture:** One dialog in the stage editor. A sibling seed script next to `seed-import-process-courier-ar.ts`, idempotent. Docs in `docs/imports.md`, `docs/environment.md`, `AGENTS.md` and `.env.example`.

**Tech Stack:** React 19 with `@crm/ui`, bun, Prisma 7, `pg`.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Parts 1 to 7 must be done.

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

Extra rules for the screens:
- Read `docs/design.md`, `.agents/skills/no-use-effect`, `.agents/skills/shadcn` and `apps/app/AGENTS.md`. Next.js 16: read `apps/app/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before you write a route handler.
- A `"use client"` file imports only `@crm/ui`, the tRPC client (`@trpc/client` included), React, Next navigation, `sonner`, `lucide-react`, `@vercel/blob/client`, enum-only `@crm/db` subpaths, `@crm/db/import-document` (it imports nothing) and `@/lib/*` helpers. Never `@crm/db/import-document-blob`, never `@crm/auth`, never the `@crm/db` barrel.
- No `useEffect`. Derive during render.
- UI from `packages/ui` only. Semantic tokens and the scale. No new variant at the call site.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx` | *Documentos* per stage |
| `packages/db/scripts/seed-document-labels-courier-ar.ts` | Idempotent seed |
| `packages/db/package.json` | `db:seed:courier-ar-documents` |
| `docs/imports.md` | The rules of documents |
| `docs/environment.md` | What the token does for documents |
| `AGENTS.md` | Index row |
| `.env.example` | Comment on the token |

---

### Task 7b: Expected documents in the stage editor

**Files:**
- Modify: `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD --stat -- 'apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx' && rtk proxy rg -n "export function splitDocumentLabels|export function labelOptionText" apps/app/lib/import-documents.ts`
Expected: an empty diff stat, then both helpers (Task 7a). A hunk you did not write: stop and ask the owner.

- [ ] **Step 2: Add the dialog, the button and the count**

In `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx`, replace:

```tsx
import { Button } from "@crm/ui/components/button";
```

with:

```tsx
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
```

Replace:

```tsx
import { STAGE_TONE_LABELS, STAGE_TONE_STATUS } from "@/lib/deal-stage-config";
```

with:

```tsx
import { STAGE_TONE_LABELS, STAGE_TONE_STATUS } from "@/lib/deal-stage-config";
import {
	type DocumentLabelRow,
	labelOptionText,
	splitDocumentLabels,
} from "@/lib/import-documents";
```

Replace:

```tsx
function shipmentsLabel(count: number): string {
	return count === 1 ? "1 envío" : `${count} envíos`;
}
```

with:

```tsx
function shipmentsLabel(count: number): string {
	return count === 1 ? "1 envío" : `${count} envíos`;
}

function expectedLabel(count: number): string {
	return count === 1
		? "1 documento esperado"
		: `${count} documentos esperados`;
}

function ExpectedDocumentsDialog({
	stage,
	labels,
	labelsHref,
	pending,
	onClose,
	onSave,
}: {
	stage: ImportStageRow;
	labels: DocumentLabelRow[] | null;
	labelsHref: string;
	pending: boolean;
	onClose: () => void;
	onSave: (labelIds: string[]) => void;
}) {
	const baseId = useId();
	const [chosen, setChosen] = useState(() => new Set(stage.expectedLabelIds));

	const toggle = (id: string, checked: boolean) =>
		setChosen((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{`Documentos de ${stage.name}`}</DialogTitle>
					<DialogDescription>
						Marca los documentos que esta etapa espera. Cada envío muestra
						cuáles faltan. La lista avisa y nunca impide mover un envío.
					</DialogDescription>
				</DialogHeader>

				{labels === null ? (
					<div className="flex justify-center p-4">
						<Spinner />
					</div>
				) : labels.length === 0 ? (
					<p className="text-muted-foreground">
						Todavía no hay etiquetas.{" "}
						<Button asChild variant="link" size="inline">
							<Link href={labelsHref}>Crea las etiquetas</Link>
						</Button>{" "}
						y vuelve aquí.
					</p>
				) : (
					<FieldGroup>
						{labels.map((label) => {
							const id = `${baseId}-${label.id}`;
							return (
								<Field key={label.id} orientation="horizontal">
									<Checkbox
										id={id}
										checked={chosen.has(label.id)}
										onCheckedChange={(checked) =>
											toggle(label.id, checked === true)
										}
									/>
									<FieldLabel htmlFor={id}>{labelOptionText(label)}</FieldLabel>
								</Field>
							);
						})}
					</FieldGroup>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						disabled={pending || !labels || labels.length === 0}
						onClick={() =>
							onSave(
								(labels ?? [])
									.filter((label) => chosen.has(label.id))
									.map((label) => label.id),
							)
						}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

Replace:

```tsx
				<span className="tabular-nums">
					{shipmentsLabel(stage.shipmentCount)}
				</span>
			</MetaRow>
```

with:

```tsx
				<span className="tabular-nums">
					{shipmentsLabel(stage.shipmentCount)}
				</span>
				{stage.expectedLabelIds.length > 0 ? (
					<span className="tabular-nums">
						{expectedLabel(stage.expectedLabelIds.length)}
					</span>
				) : null}
			</MetaRow>
```

Replace:

```tsx
	const [archiving, setArchiving] = useState<ImportStageRow | null>(null);
```

with:

```tsx
	const [archiving, setArchiving] = useState<ImportStageRow | null>(null);
	const [choosing, setChoosing] = useState<ImportStageRow | null>(null);
```

Replace:

```tsx
	const list = useQuery(trpc.importStages.settings.queryOptions({ processId }));
```

with:

```tsx
	const list = useQuery(trpc.importStages.settings.queryOptions({ processId }));
	const labels = useQuery(trpc.documentLabels.list.queryOptions());
```

Replace:

```tsx
	const restore = useMutation(
		trpc.importStages.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etapa restaurada."),
		}),
	);
```

with:

```tsx
	const restore = useMutation(
		trpc.importStages.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etapa restaurada."),
		}),
	);
	const expected = useMutation(
		trpc.importStages.setExpectedLabels.mutationOptions({
			...settled,
			onSuccess: () => {
				setChoosing(null);
				toast.success("Documentos esperados guardados.");
			},
		}),
	);
```

Replace:

```tsx
		archive.isPending ||
		restore.isPending;
```

with:

```tsx
		archive.isPending ||
		restore.isPending ||
		expected.isPending;
```

Replace:

```tsx
	const fixed = (stage: ImportStageRow | undefined) =>
		stage ? (
			<Row key={stage.key}>
				<StageSummary stage={stage} />
				{edit(stage)}
			</Row>
		) : null;
```

with:

```tsx
	const documents = (stage: ImportStageRow) => (
		<Button
			variant="ghost"
			size="sm"
			disabled={busy}
			onClick={() => setChoosing(stage)}
		>
			Documentos
		</Button>
	);

	const fixed = (stage: ImportStageRow | undefined) =>
		stage ? (
			<Row key={stage.key}>
				<StageSummary stage={stage} />
				{documents(stage)}
				{edit(stage)}
			</Row>
		) : null;
```

Replace:

```tsx
									<StageSummary stage={stage} />
									{edit(stage)}
									<Button
```

with:

```tsx
									<StageSummary stage={stage} />
									{documents(stage)}
									{edit(stage)}
									<Button
```

Replace:

```tsx
						archive.mutate({ key: archiving.key, targetKey, occurredAt })
					}
				/>
			) : null}
		</SettingsColumn>
```

with:

```tsx
						archive.mutate({ key: archiving.key, targetKey, occurredAt })
					}
				/>
			) : null}

			{choosing ? (
				<ExpectedDocumentsDialog
					key={choosing.key}
					stage={choosing}
					labels={
						labels.data ? splitDocumentLabels(labels.data.labels).active : null
					}
					labelsHref={url("/settings/document-labels")}
					pending={expected.isPending}
					onClose={() => setChoosing(null)}
					onSave={(labelIds) =>
						expected.mutate({ key: choosing.key, labelIds })
					}
				/>
			) : null}
		</SettingsColumn>
```

- [ ] **Step 3: Type check and test**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-stage-settings.spec.ts`
Expected: the same pass count as before, 0 fail.

- [ ] **Step 4: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write 'apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx' && bunx biome check 'apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx'`
Expected: no errors.

---

### Task 9: Seed the Courier Argentina labels

**Files:**
- Create: `packages/db/scripts/seed-document-labels-courier-ar.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy rg -n "Documentos de fábrica|Con DHL|Costos de importación|\"Pago\"|Presentado al banco" packages/db/scripts/seed-import-process-courier-ar.ts && rtk proxy rg -n "db:seed:courier-ar" packages/db/package.json`
Expected: the five stage names and one `db:seed:courier-ar` script. Otherwise stop and ask the owner: the stage names below must match the existing seed.

- [ ] **Step 2: Write the script**

Create `packages/db/scripts/seed-document-labels-courier-ar.ts`:

```ts
import { db } from "../src/client";
import { DocumentDirection } from "../src/generated/prisma/enums";

const PROCESS = "Courier Argentina";

const LABELS = [
	{ name: "Commercial invoice", direction: DocumentDirection.IN },
	{ name: "Packing list", direction: DocumentDirection.IN },
	{ name: "Informe de pedido tomado", direction: DocumentDirection.IN },
	{ name: "Costos de importación", direction: DocumentDirection.IN },
	{ name: "Comprobante de pago", direction: DocumentDirection.OUT },
	{ name: "Presentación al banco", direction: DocumentDirection.OUT },
];

const EXPECTED: ReadonlyArray<{ stage: string; labels: readonly string[] }> = [
	{
		stage: "Documentos de fábrica",
		labels: ["Commercial invoice", "Packing list"],
	},
	{ stage: "Con DHL", labels: ["Informe de pedido tomado"] },
	{ stage: "Costos de importación", labels: ["Costos de importación"] },
	{ stage: "Pago", labels: ["Comprobante de pago"] },
	{
		stage: "Presentado al banco",
		labels: ["Commercial invoice", "Packing list", "Comprobante de pago"],
	},
];

const ids = new Map<string, string>();

for (const label of LABELS) {
	const found = await db.documentLabel.findFirst({
		where: { name: { equals: label.name, mode: "insensitive" } },
		select: { id: true },
	});
	if (found) {
		ids.set(label.name, found.id);
		console.log(`exists  ${label.name}`);
		continue;
	}
	const created = await db.documentLabel.create({
		data: label,
		select: { id: true },
	});
	ids.set(label.name, created.id);
	console.log(`created ${label.name}`);
}

const courier = await db.importProcess.findUnique({
	where: { name: PROCESS },
	select: { id: true },
});

if (!courier) {
	console.log(`missing ${PROCESS}. Run db:seed:courier-ar first.`);
} else {
	for (const entry of EXPECTED) {
		const stage = await db.importStage.findFirst({
			where: { processId: courier.id, name: entry.stage },
			select: { key: true },
		});
		if (!stage) {
			console.log(`missing stage ${entry.stage}`);
			continue;
		}
		for (const [position, name] of entry.labels.entries()) {
			const labelId = ids.get(name);
			if (!labelId) continue;
			await db.importStageDocument.upsert({
				where: { stageKey_labelId: { stageKey: stage.key, labelId } },
				update: {},
				create: { stageKey: stage.key, labelId, position },
			});
		}
		console.log(`linked  ${entry.stage}: ${entry.labels.join(", ")}`);
	}
}

await db.$disconnect();
```

An existing label keeps its direction and its archive state. An existing link keeps its position. A second run changes nothing.

- [ ] **Step 3: Add the script entry**

In `packages/db/package.json`, replace:

```json
		"db:seed:courier-ar": "bun scripts/require-local-db.ts db:seed:courier-ar && bun scripts/seed-import-process-courier-ar.ts",
```

with:

```json
		"db:seed:courier-ar": "bun scripts/require-local-db.ts db:seed:courier-ar && bun scripts/seed-import-process-courier-ar.ts",
		"db:seed:courier-ar-documents": "bun scripts/require-local-db.ts db:seed:courier-ar-documents && bun scripts/seed-document-labels-courier-ar.ts",
```

- [ ] **Step 4: Format and check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/db/scripts/seed-document-labels-courier-ar.ts packages/db/package.json && bunx biome check packages/db/scripts/seed-document-labels-courier-ar.ts packages/db/package.json`
Expected: no errors. `packages/db/tsconfig.json` does not include `scripts/`, so `check-types` does not see this file. The owner run in Step 5 is its check.

- [ ] **Step 5: Stop and ask the owner to run the seed**

Do not run it yourself. It writes to the owner's `crm` database. Tell the owner to run, from the repo root:
1. `bun --env-file=.env run --filter=@crm/db db:seed:courier-ar` (prints `exists  Courier Argentina` when the process is there).
2. `bun --env-file=.env run --filter=@crm/db db:seed:courier-ar-documents`. Expected: six `created` lines, then five `linked` lines.
3. The same command again. Expected: six `exists` lines, then the same five `linked` lines. Nothing new in the database.

---

### Task 10: Docs, verification and the browser checklist

**Files:**
- Modify: `docs/imports.md`
- Modify: `docs/environment.md`
- Modify: `AGENTS.md`
- Modify: `.env.example`

- [ ] **Step 1: Check the docs**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy rg -n "^## Archive and permissions|order-pages-design.md\`. This page holds" docs/imports.md && rtk proxy rg -n "Mirrors logos and photos into Blob|because the API and the seed write pictures too" docs/environment.md && rtk proxy rg -n "Import processes and stages, purchase orders, shipments, lead times" AGENTS.md && rtk proxy rg -n "^# BLOB_READ_WRITE_TOKEN=\"\"$" .env.example`
Expected: one line for each pattern. `docs/imports.md` carries uncommitted split-shipments text from another plan; that is expected. A missing pattern: stop and ask the owner.

- [ ] **Step 2: Write `docs/imports.md`**

Replace:

```md
`docs/superpowers/specs/2026-11-15-import-processes-design.md` and
`docs/superpowers/specs/2026-11-16-order-pages-design.md`. This page holds the rules the
code depends on.
```

with:

```md
`docs/superpowers/specs/2026-11-15-import-processes-design.md`,
`docs/superpowers/specs/2026-11-16-order-pages-design.md` and
`docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. This page holds the
rules the code depends on.
```

Replace:

```md
## Archive and permissions
```

with:

```md
## Documents

- A file is an `Attachment` on one `ShipmentStageEvent`. Each shipment has its own files.
- A `DocumentLabel` tags a file. `direction` is `IN` (we receive it) or `OUT` (we make or
  present it). The name is unique ignoring case: `create` and `update` take an advisory
  lock first. A label is archived, never deleted. An archived label stays on its files,
  leaves every checklist and cannot tag a new file.
- `ImportStageDocument` lists the labels a stage expects. `importStages.setExpectedLabels`
  replaces the active links of one stage and keeps the links to archived labels. A process
  duplicate copies the links.
- The checklist of a stage reads every file of the shipment (`documentChecklist` in
  `packages/db/src/import-document.ts`). A packing list of one stage counts at every stage.
  The checklist warns. It never blocks a move.
- `IMPORT_DOCUMENT` holds the types, the 20 MB limit, the token and link lifetimes and the
  access mode (`private`).
- Upload: `importDocuments.uploadToken` checks the role, the storage, the type, the size
  and the event. It builds `import-documents/<shipmentId>/<eventId>/<uuid>-<name>` and
  returns a client token for that pathname only. The browser calls `put` from
  `@vercel/blob/client`, then `importDocuments.attach`. No REST route and no
  `onUploadCompleted`.
- `attach` trusts the file name only. It checks the pathname prefix, reads the size and the
  type with `head`, and removes the blob when it refuses after the upload.
- Every Blob call goes through `documentBlob` (`@crm/db/import-document-blob`). Specs
  replace its methods with `spyOn`. A client file never imports it.
- `remove` deletes the row, then the blob. A failed blob removal is a `warn` log with the
  document id.
- Download: `/[slug]/imports/files/[documentId]` calls `importDocuments.downloadUrl` and
  redirects to a signed URL valid 5 minutes. Members download.
- Without `BLOB_READ_WRITE_TOKEN`, `documentsEnabled` is false. The upload button is
  disabled and says why. The files and the checklist still show.
- Files are allowed on received and cancelled shipments and on archived orders.
- Screens: `/settings/document-labels`; *Documentos* on each stage of the stage editor; the
  *Documentos* panel of each shipment card (`[orderId]/shipment-documents.tsx`); the
  missing labels of the target stage in the move dialog.

## Archive and permissions
```

- [ ] **Step 3: Write `docs/environment.md`, `AGENTS.md` and `.env.example`**

In `docs/environment.md`, replace:

```md
| `BLOB_READ_WRITE_TOKEN` | Mirrors logos and photos into Blob |
```

with:

```md
| `BLOB_READ_WRITE_TOKEN` | Mirrors logos and photos into Blob. The API also stores shipment documents |
```

Replace:

```md
because the API and the seed write pictures too. The Next.js app is deliberately
excluded — recognising our URL for the image optimizer needs no token.
```

with:

```md
because the API and the seed write pictures too. The API also issues the upload tokens
and the signed download links of shipment documents (`docs/imports.md`). Documents use
private access, so the store must accept private blobs. Without the token the upload
button is disabled and says why. The Next.js app is deliberately excluded: the browser
gets a token for one file from the API, and the image optimizer needs no token.
```

In `AGENTS.md`, replace:

```md
| Import processes and stages, purchase orders, shipments, lead times | `docs/imports.md` |
```

with:

```md
| Import processes and stages, purchase orders, shipments, lead times, shipment documents | `docs/imports.md` |
```

In `.env.example`, replace:

```
# BLOB_READ_WRITE_TOKEN=""
```

with:

```
# The API also keeps the shipment documents of /imports here, with private access.
# Without it the upload button is disabled and says why.
# BLOB_READ_WRITE_TOKEN=""
```

No new variable exists, so `env.validation.ts` does not change.

- [ ] **Step 4: Run every test of the feature**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test`
Expected: every spec passes, including `import-document.spec.ts` (10).
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/document-labels.integration.spec.ts test/import-stage-documents.integration.spec.ts test/import-documents.integration.spec.ts test/import-stages.integration.spec.ts test/import-processes.integration.spec.ts test/import-orders.integration.spec.ts test/shipment-moves.integration.spec.ts`
Expected: 0 fail. The new specs report 8, 7 and 18 passes.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test`
Expected: 0 fail.

- [ ] **Step 5: Type check and lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=@crm/db && bun run check-types --filter=api && bun run check-types --filter=app`
Expected: no errors.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git status --short`
Read the list. Run `bunx biome check` on every file of this plan in that list (each path as its own argument, quoted). Expected: no errors.

- [ ] **Step 6: Check for leftover rows in `crm_test`**

This reads `TEST_DATABASE_URL` only. Never `DATABASE_URL`, never the default `db` client: that is the owner's `crm` database.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun --env-file=../../.env -e 'import pg from "pg"; if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set."); const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect(); const name = await client.query("SELECT current_database() AS name"); const labels = await client.query("SELECT name FROM document_label"); const files = await client.query("SELECT id FROM attachment"); const links = await client.query("SELECT \"stageKey\" FROM import_stage_document"); const processes = await client.query("SELECT id, name FROM import_process WHERE id <> $1", ["import_process_standard"]); console.log(name.rows[0]?.name, labels.rows, files.rows, links.rows, processes.rows); await client.end();'`
Expected: `crm_test [] [] [] []`. A database name without `_test`: stop at once and tell the owner. Any row means a spec did not clean up. Report the rows to the owner. Do not delete rows by hand without the owner's OK.

- [ ] **Step 7: Browser checklist for the owner**

Give the owner this list. The plan is not closed without it. It needs `BLOB_READ_WRITE_TOKEN` in the API environment for steps 7 to 13.

1. Sign in as owner. The settings menu shows *Etiquetas de documentos* after *Procesos de importación*. The command palette finds it with "packing".
2. Create *Packing list*, type *Entrada*. Create *packing LIST*. A toast refuses it.
3. Edit *Packing list* to *Salida* and back. Archive it. It moves to *Etiquetas archivadas*. Restore it.
4. Open *Procesos de importación*, *Courier Argentina*, *Etapas*. After the seed, *Documentos de fábrica* says *2 documentos esperados*. Click *Documentos*. Two boxes are checked. Uncheck one, save, check it again, save. Each save shows a toast.
5. Open an order of *Courier Argentina* with a shipment. The card has *Documentos*. Each stage with expected labels has one line, every badge says *Falta …*. *Cancelado* has no line.
6. Remove the token from the API environment and reload. *Subir documento* is disabled and the panel names `BLOB_READ_WRITE_TOKEN`. Put the token back.
7. Click *Subir documento*. *Etiqueta* shows *Commercial invoice, Entrada*. *Etapa* shows the current stage. Pick a PDF under 20 MB. Click *Subir*. A toast says *Documento guardado.* The file shows with its label, stage, day, size and your name.
8. The *Commercial invoice* badge now has a check on *Documentos de fábrica* and on *Presentado al banco*.
9. Pick a `.zip` file. The field says the type is not accepted. Pick a file over 20 MB. The field names the limit.
10. Click the file name. A new tab opens the PDF. Copy the order page link of the file (`/…/imports/files/…`) into a private window. The app asks you to sign in.
11. Click *Avanzar* and choose *Presentado al banco*. The dialog says *Faltan: Packing list, Comprobante de pago. Puedes moverlo igual.* Move it. The move works.
12. Click *Eliminar* on the file and confirm. A toast says *Documento eliminado.* The badges say *Falta* again. In the Vercel Blob dashboard the file is gone.
13. Upload a file with the label *Commercial invoice*. Archive the label in settings. The file still shows *Commercial invoice*. The checklist no longer lists it. The upload dialog no longer offers it. Restore it.
14. Move a shipment to *Recibido*. Upload a file to it. It works.
15. Sign in as a member. The panel shows. *Subir documento* and *Eliminar* are disabled. The file link opens. The settings screens are read only.
16. Resize to 390 px. The panel, the badges and the dialogs fit. The page does not scroll sideways.

- [ ] **Step 8: Hand over**

Tell the owner: the plan is done. Report the pass counts, the leftover check output and any step of the checklist that the owner must still run. Do not commit; the owner approves commits.

---

## Self-review (whole plan)

| Brief item | Where |
| --- | --- |
| 1. Pure helpers with unit tests | Task 1 (`-a.md`), Task 7a (`-f.md`) |
| 2. Schema, migration, owner stop | Task 2 (`-a.md`) |
| 3. Labels API with `expectOutput` | Task 3 (`-b.md`) |
| 4. Stage expected labels API | Task 4 (`-c.md`) |
| 5. Attachments API, handshake, tests | Tasks 5a (`-d.md`) and 5b (`-e.md`) |
| 6. Order detail with documents | Task 6 (`-e.md`) |
| 7. Settings screens | Tasks 7a (`-f.md`) and 7b (this part) |
| 8. Panel, upload, chips, move warning | Task 8 (`-g.md`) |
| 9. Seed | Task 9 |
| 10. Docs, verification, leftover check on `TEST_DATABASE_URL`, browser checklist | Task 10 |
| Race and permission tests | Tasks 3, 4, 5a, 5b |
| Closed shipment decided | Part 4 decision 6; Task 5a test |

**Placeholder scan.** No step says "similar to" or "TODO". Every edit has exact old and new text, checked against the files on 2026-11-16.

**Known risks.**
- The seed links stages by name. A stage renamed in settings before the seed runs is skipped with `missing stage …`.
- `.env.example` gets two comment lines. No variable is added.
- Another session edits `docs/imports.md`. Task 10 Step 1 stops if an anchor moved.
