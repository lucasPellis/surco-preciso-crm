# Shipment Documents (part 6 of 8: helpers and the labels screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app helpers for checklists and labels, `cache.documentLabels()`, and the screen `/settings/document-labels` with its menu and palette entries.

**Architecture:** Pure helpers in `apps/app/lib/import-documents.ts` (tested first). The labels screen copies the shape of `settings/import-processes`. The stage editor gets one dialog. The shipment card renders `ShipmentDocuments` from a new client file. The upload calls `importDocuments.uploadToken`, then `put` from `@vercel/blob/client`, then `importDocuments.attach`. A download is a plain link to a Next route handler that asks the API for a signed URL and redirects.

**Tech Stack:** Next.js 16 app router, React 19, TanStack Query with tRPC, Radix through `@crm/ui`, `@vercel/blob` 2.6.1 client, bun test.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Parts 1 to 5 must be done: `documentLabels`, `importStages.setExpectedLabels` and `importDocuments.*` exist in `apps/api/src/generated/server.ts`, and the order detail has `expectedLabels`, `documents` and `documentsEnabled`.

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

## Decisions recorded in this part

1. **Route** `/settings/document-labels`, title *Etiquetas de documentos*. Nav entry after *Procesos de importación*. Command palette entry `settings-document-labels`.
2. **Direction words:** `IN` is *Entrada* ("Lo recibimos de la fábrica, de DHL o de otros."), `OUT` is *Salida* ("Lo hacemos o lo presentamos nosotros."). They live in `IMPORTS_UI`.
3. **The stage editor saves the chosen labels in label name order.** The checklist order follows. No drag order for labels.
4. **The checklist shows one line per stage that expects labels**, the cancelled stage excluded. A present label is a `secondary` badge with a check icon and its name. A missing label is an `outline` badge that says *Falta <name>*. The words carry the state.
5. **The upload dialog proposes the first missing expected label** of the latest stage, else *Sin etiqueta*. Without a label a hint says the file does not count for the checklist.
6. **The file link** is `/[slug]/imports/files/[documentId]`, opened in a new tab. The route handler forwards the session cookie through `getServerTrpcClient()`, gets the signed URL and answers `302`. An API refusal becomes a plain-text answer with the API status.
7. **`@vercel/blob@2.6.1` is added to `apps/app`**, the same version `packages/db` resolves, for `put` from `@vercel/blob/client`. The browser never sees the read-write token: the client token is scoped to one pathname for 10 minutes.
8. **The move dialog warning** is a `FieldDescription` under *Nueva etapa*. It changes with the chosen target.
9. **Delete asks first** with an `AlertDialog`, as `record-actions.tsx` does.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `apps/app/lib/imports-config.ts` | `directionLabels`, `directionHints` |
| `apps/app/lib/import-documents.ts` | Types and pure helpers |
| `apps/app/test/import-documents.spec.ts` | Unit tests |
| `apps/app/lib/trpc/cache.ts` | `cache.documentLabels()`; `importOrders` also refreshes the label list |
| `apps/app/app/(app)/[slug]/settings/document-labels/page.tsx` | Server page |
| `apps/app/app/(app)/[slug]/settings/document-labels/document-labels-settings.tsx` | Client screen |
| `apps/app/components/workspace-nav.tsx`, `apps/app/components/crm/quick-switcher.tsx` | Entries |

---

### Task 7a: Helpers and the labels screen

**Files:**
- Modify: `apps/app/lib/imports-config.ts`
- Create: `apps/app/lib/import-documents.ts`
- Create: `apps/app/test/import-documents.spec.ts`
- Modify: `apps/app/lib/trpc/cache.ts`
- Create: `apps/app/app/(app)/[slug]/settings/document-labels/page.tsx`
- Create: `apps/app/app/(app)/[slug]/settings/document-labels/document-labels-settings.tsx`
- Modify: `apps/app/components/workspace-nav.tsx`
- Modify: `apps/app/components/crm/quick-switcher.tsx`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy rg -n "documentLabels|importDocuments|setExpectedLabels" apps/api/src/generated/server.ts | head -5 && rtk proxy git diff --no-color HEAD --stat -- apps/app/lib/trpc/cache.ts apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: the generated router names all three. The diff stat is empty. A hunk you did not write: stop and ask the owner.

- [ ] **Step 2: Write the failing tests**

Create `apps/app/test/import-documents.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	type DocumentLabelRow,
	type ExpectedLabel,
	fileSizeLabel,
	labelFromChoice,
	labelOptionText,
	missingDocumentsText,
	NO_LABEL,
	type ShipmentDocument,
	splitDocumentLabels,
	stageChecklists,
	suggestedLabelId,
} from "../lib/import-documents";
import type { ImportStageOption } from "../lib/import-orders";

const invoice: ExpectedLabel = {
	id: "invoice",
	name: "Commercial invoice",
	direction: "IN",
	archived: false,
};
const packing: ExpectedLabel = {
	id: "packing",
	name: "Packing list",
	direction: "IN",
	archived: false,
};
const receipt: ExpectedLabel = {
	id: "receipt",
	name: "Comprobante de pago",
	direction: "OUT",
	archived: false,
};

function stage(
	key: string,
	expectedLabels: ExpectedLabel[],
	kind: ImportStageOption["kind"] = "IN_PROGRESS",
): ImportStageOption {
	return { key, name: key, kind, tone: "NEUTRAL", expectedLabels };
}

function file(label: ExpectedLabel | null): ShipmentDocument {
	return {
		id: `f-${label?.id ?? "none"}`,
		filename: "a.pdf",
		contentType: "application/pdf",
		size: 10,
		uploadedAt: "2026-01-10T12:00:00.000Z",
		uploadedByName: null,
		eventId: "e-1",
		stage: { key: "DOCS", name: "DOCS" },
		label,
	};
}

describe("stage checklists", () => {
	it("counts a file of one stage at every stage that expects its label", () => {
		const stages = [
			stage("DOCS", [invoice, packing]),
			stage("PAGO", []),
			stage("BANCO", [invoice, packing, receipt]),
			stage("CANCELADO", [invoice], "CANCELLED"),
		];

		expect(stageChecklists(stages, [file(packing), file(null)])).toEqual([
			{ key: "DOCS", name: "DOCS", present: [packing], missing: [invoice] },
			{
				key: "BANCO",
				name: "BANCO",
				present: [packing],
				missing: [invoice, receipt],
			},
		]);
	});

	it("writes the move warning for the target stage", () => {
		const bank = stage("BANCO", [invoice, packing, receipt]);

		expect(missingDocumentsText(bank, [file(invoice), file(receipt)])).toBe(
			"Falta: Packing list. Puedes moverlo igual.",
		);
		expect(missingDocumentsText(bank, [file(packing)])).toBe(
			"Faltan: Commercial invoice, Comprobante de pago. Puedes moverlo igual.",
		);
		expect(
			missingDocumentsText(bank, [file(invoice), file(packing), file(receipt)]),
		).toBeNull();
		expect(missingDocumentsText(stage("PAGO", []), [])).toBeNull();
		expect(missingDocumentsText(undefined, [])).toBeNull();
	});

	it("suggests the first missing label", () => {
		const docs = stage("DOCS", [invoice, packing]);

		expect(suggestedLabelId(docs, [file(invoice)])).toBe("packing");
		expect(suggestedLabelId(docs, [file(invoice), file(packing)])).toBeNull();
		expect(suggestedLabelId(undefined, [])).toBeNull();
	});
});

describe("labels and sizes", () => {
	it("splits labels and names them with their direction", () => {
		const rows: DocumentLabelRow[] = [
			{ ...invoice, fileCount: 1, stageCount: 2 },
			{ ...receipt, archived: true, fileCount: 0, stageCount: 0 },
		];

		const { active, archived } = splitDocumentLabels(rows);

		expect(active.map((row) => row.id)).toEqual(["invoice"]);
		expect(archived.map((row) => row.id)).toEqual(["receipt"]);
		expect(labelOptionText(invoice)).toBe("Commercial invoice, Entrada");
		expect(labelOptionText(receipt)).toBe("Comprobante de pago, Salida");
		expect(labelFromChoice(NO_LABEL)).toBeNull();
		expect(labelFromChoice("invoice")).toBe("invoice");
	});

	it("writes a file size in KB or MB", () => {
		expect(fileSizeLabel(10)).toBe("1 KB");
		expect(fileSizeLabel(2048)).toBe("2 KB");
		expect(fileSizeLabel(1.5 * 1024 * 1024)).toBe("1,5 MB");
		expect(fileSizeLabel(20 * 1024 * 1024)).toBe("20 MB");
	});
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-documents.spec.ts`
Expected: FAIL. `Cannot find module '../lib/import-documents'`.

- [ ] **Step 4: Add the direction words**

In `apps/app/lib/imports-config.ts`, replace:

```ts
import type { ImportCountry } from "@crm/db/enums";
```

with:

```ts
import type { DocumentDirection, ImportCountry } from "@crm/db/enums";
```

Replace:

```ts
	} satisfies Record<ImportCountry, string>,
} as const;
```

with:

```ts
	} satisfies Record<ImportCountry, string>,
	directionLabels: {
		IN: "Entrada",
		OUT: "Salida",
	} satisfies Record<DocumentDirection, string>,
	directionHints: {
		IN: "Lo recibimos de la fábrica, de DHL o de otros.",
		OUT: "Lo hacemos o lo presentamos nosotros.",
	} satisfies Record<DocumentDirection, string>,
} as const;
```

- [ ] **Step 5: Write the helpers**

Create `apps/app/lib/import-documents.ts`:

```ts
import { type DocumentDirection, ImportStageKind } from "@crm/db/enums";
import { documentChecklist } from "@crm/db/import-document";
import {
	formatDay,
	type ImportShipment,
	type ImportStageOption,
} from "@/lib/import-orders";
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";

export type DocumentLabelRow =
	RouterOutputs["documentLabels"]["list"]["labels"][number];
export type ShipmentDocument = ImportShipment["documents"][number];
export type ShipmentEvent = ImportShipment["events"][number];
export type ExpectedLabel = ImportStageOption["expectedLabels"][number];

export type StageChecklist = {
	key: string;
	name: string;
	present: ExpectedLabel[];
	missing: ExpectedLabel[];
};

export const NO_LABEL = "none";

const KB = 1024;
const MB = KB * KB;

const sizeFormat = new Intl.NumberFormat(IMPORTS_UI.locale, {
	maximumFractionDigits: 1,
});

export function splitDocumentLabels(rows: readonly DocumentLabelRow[]) {
	return {
		active: rows.filter((row) => !row.archived),
		archived: rows.filter((row) => row.archived),
	};
}

export function directionLabel(direction: DocumentDirection): string {
	return IMPORTS_UI.directionLabels[direction];
}

export function labelOptionText(label: {
	name: string;
	direction: DocumentDirection;
}): string {
	return `${label.name}, ${directionLabel(label.direction)}`;
}

export function labelFromChoice(value: string): string | null {
	return value === NO_LABEL ? null : value;
}

export function stageChecklists(
	stages: readonly ImportStageOption[],
	documents: readonly ShipmentDocument[],
): StageChecklist[] {
	return stages
		.filter(
			(stage) =>
				stage.kind !== ImportStageKind.CANCELLED &&
				stage.expectedLabels.length > 0,
		)
		.map((stage) => ({
			key: stage.key,
			name: stage.name,
			...documentChecklist(stage.expectedLabels, documents),
		}));
}

export function missingDocumentsText(
	stage: ImportStageOption | undefined,
	documents: readonly ShipmentDocument[],
): string | null {
	if (!stage) return null;
	const { missing } = documentChecklist(stage.expectedLabels, documents);
	if (missing.length === 0) return null;
	const names = missing.map((label) => label.name).join(", ");
	return `${missing.length === 1 ? "Falta" : "Faltan"}: ${names}. Puedes moverlo igual.`;
}

export function suggestedLabelId(
	stage: ImportStageOption | undefined,
	documents: readonly ShipmentDocument[],
): string | null {
	if (!stage) return null;
	return documentChecklist(stage.expectedLabels, documents).missing[0]?.id ?? null;
}

export function eventChoiceText(event: ShipmentEvent): string {
	return `${event.stage.name}, ${formatDay(event.occurredAt)}`;
}

export function fileSizeLabel(bytes: number): string {
	if (bytes < MB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
	return `${sizeFormat.format(bytes / MB)} MB`;
}
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-documents.spec.ts`
Expected: 5 pass, 0 fail. If `fileSizeLabel(1.5 * 1024 * 1024)` prints `1.5 MB`, the runtime lacks the `es` locale data. Stop and report it.

- [ ] **Step 7: Add the cache entry**

In `apps/app/lib/trpc/cache.ts`, replace:

```ts
	importOrders(options?: Options): Promise<void>;
```

with:

```ts
	importOrders(options?: Options): Promise<void>;
	documentLabels(options?: Options): Promise<void>;
```

Replace:

```ts
		importOrders: (options) =>
			run(
				[trpc.importOrders.list.queryKey(), trpc.importOrders.byId.queryKey()],
				[
					trpc.importStages.settings.queryKey(),
					trpc.importProcesses.list.queryKey(),
				],
				options,
			),
```

with:

```ts
		importOrders: (options) =>
			run(
				[trpc.importOrders.list.queryKey(), trpc.importOrders.byId.queryKey()],
				[
					trpc.importStages.settings.queryKey(),
					trpc.importProcesses.list.queryKey(),
					trpc.documentLabels.list.queryKey(),
				],
				options,
			),

		documentLabels: (options) =>
			run(
				[trpc.documentLabels.list.queryKey()],
				[
					trpc.importStages.settings.queryKey(),
					trpc.importOrders.byId.queryKey(),
				],
				options,
			),
```

- [ ] **Step 8: Write the labels page**

Create `apps/app/app/(app)/[slug]/settings/document-labels/page.tsx`:

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
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DocumentLabelsSettings } from "./document-labels-settings";

export const metadata: Metadata = {
	title: "Etiquetas de documentos",
};

export default function DocumentLabelsSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etiquetas de documentos</PageShellTitle>
					<PageShellDescription>
						Una etiqueta dice qué es un documento, por ejemplo Packing list.
						Cada etapa de un proceso puede esperar algunas etiquetas.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Labels />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Labels() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.documentLabels.list.queryOptions());

	return (
		<HydrateClient>
			<DocumentLabelsSettings />
		</HydrateClient>
	);
}
```

Create `apps/app/app/(app)/[slug]/settings/document-labels/document-labels-settings.tsx`:

```tsx
"use client";

import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { useFormSheetValidation } from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import { MetaRow } from "@crm/ui/components/meta-row";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SettingsCard, SettingsColumn } from "@crm/ui/components/settings-card";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	type DocumentLabelRow,
	directionLabel,
	splitDocumentLabels,
} from "@/lib/import-documents";
import { countLabel } from "@/lib/import-process-settings";
import { IMPORTS_UI } from "@/lib/imports-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const ROW =
	"flex flex-wrap items-center gap-2.5 border-b px-5 py-2.5 last:border-b-0";

type DialogState = { mode: "create" } | { mode: "edit"; row: DocumentLabelRow };

type LabelValues = { name: string; direction: DocumentDirection };

function isDirection(value: string): value is DocumentDirection {
	return value === DocumentDirection.IN || value === DocumentDirection.OUT;
}

function LabelDialog({
	state,
	pending,
	onClose,
	onSubmit,
}: {
	state: DialogState;
	pending: boolean;
	onClose: () => void;
	onSubmit: (values: LabelValues) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const directionId = useId();
	const [name, setName] = useState(state.mode === "edit" ? state.row.name : "");
	const [direction, setDirection] = useState<DocumentDirection>(
		state.mode === "edit" ? state.row.direction : DocumentDirection.IN,
	);

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{state.mode === "create" ? "Nueva etiqueta" : "Editar etiqueta"}
					</DialogTitle>
					<DialogDescription>
						{state.mode === "create"
							? "La etiqueta sirve para cualquier proceso."
							: "El cambio se ve en todos los documentos con esta etiqueta."}
					</DialogDescription>
				</DialogHeader>

				<form
					id="document-label-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit({ name: name.trim(), direction });
					}}
				>
					<FieldGroup>
						<Field data-invalid={!!validation.errors[nameId]}>
							<FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
							<Input
								id={nameId}
								aria-invalid={!!validation.errors[nameId]}
								aria-describedby={
									validation.errors[nameId] ? `${nameId}-error` : undefined
								}
								value={name}
								maxLength={IMPORT_DOCUMENT.labelNameMaxLength}
								placeholder="Packing list"
								onChange={(event) => setName(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={directionId}>Tipo</FieldLabel>
							<Select
								value={direction}
								onValueChange={(next) => {
									if (isDirection(next)) setDirection(next);
								}}
							>
								<SelectTrigger id={directionId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.values(DocumentDirection).map((value) => (
										<SelectItem key={value} value={value}>
											{directionLabel(value)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								{IMPORTS_UI.directionHints[direction]}
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="document-label-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function LabelSummary({ row }: { row: DocumentLabelRow }) {
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-px">
			<span className="truncate font-medium">{row.name}</span>
			<MetaRow>
				<span>{directionLabel(row.direction)}</span>
				<span className="tabular-nums">
					{countLabel(row.fileCount, "documento", "documentos")}
				</span>
				<span className="tabular-nums">
					{countLabel(row.stageCount, "etapa", "etapas")}
				</span>
			</MetaRow>
		</div>
	);
}

export function DocumentLabelsSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [dialog, setDialog] = useState<DialogState | null>(null);

	const list = useQuery(trpc.documentLabels.list.queryOptions());

	const settled = {
		onSettled: () => cache.documentLabels(),
		onError: (error: { message: string }) => toast.error(error.message),
	};
	const closeWith = (message: string) => () => {
		setDialog(null);
		toast.success(message);
	};

	const create = useMutation(
		trpc.documentLabels.create.mutationOptions({
			...settled,
			onSuccess: closeWith("Etiqueta creada."),
		}),
	);
	const update = useMutation(
		trpc.documentLabels.update.mutationOptions({
			...settled,
			onSuccess: closeWith("Etiqueta actualizada."),
		}),
	);
	const archive = useMutation(
		trpc.documentLabels.archive.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etiqueta archivada."),
		}),
	);
	const restore = useMutation(
		trpc.documentLabels.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etiqueta restaurada."),
		}),
	);

	if (list.isError) {
		return (
			<SettingsColumn>
				<SettingsCard
					title="No se pudieron cargar las etiquetas"
					description={list.error.message}
					action={
						<Button
							variant="outline"
							size="sm"
							disabled={list.isFetching}
							onClick={() => list.refetch()}
						>
							{list.isFetching ? <Spinner data-icon="inline-start" /> : null}
							Reintentar
						</Button>
					}
				/>
			</SettingsColumn>
		);
	}

	if (!list.data) return null;

	const { canManage, labels } = list.data;
	const { active, archived } = splitDocumentLabels(labels);
	const saving = create.isPending || update.isPending;
	const busy = !canManage || saving || archive.isPending || restore.isPending;

	return (
		<SettingsColumn>
			<SettingsCard
				title="Etiquetas"
				description="Entrada es lo que recibimos. Salida es lo que hacemos o presentamos. Un documento archivado conserva su etiqueta."
				hint={
					canManage
						? "Los cambios se guardan al instante."
						: "Solo un propietario o un administrador puede cambiar las etiquetas."
				}
				control="table"
				action={
					<Button
						size="sm"
						disabled={busy}
						onClick={() => setDialog({ mode: "create" })}
					>
						Nueva etiqueta
					</Button>
				}
			>
				<div>
					{active.length === 0 ? (
						<p className="px-5 py-2.5 text-13 text-muted-foreground">
							Todavía no hay etiquetas.
						</p>
					) : null}
					{active.map((row) => (
						<div key={row.id} className={ROW}>
							<LabelSummary row={row} />
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								onClick={() => setDialog({ mode: "edit", row })}
							>
								Editar
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								onClick={() => archive.mutate({ id: row.id })}
							>
								Archivar
							</Button>
						</div>
					))}
				</div>
			</SettingsCard>

			{archived.length > 0 ? (
				<SettingsCard
					title="Etiquetas archivadas"
					description="Una etiqueta archivada no se elige al subir un documento y sale de las listas de esperados. Los documentos que ya la tienen la conservan."
					control="table"
				>
					<Collapsible>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center gap-2 border-b px-5 py-2.5 text-left font-medium text-13"
							>
								Ver archivadas ({archived.length})
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							{archived.map((row) => (
								<div key={row.id} className={ROW}>
									<span className="min-w-0 flex-1 truncate text-13 text-muted-foreground">
										{row.name}
									</span>
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() => restore.mutate({ id: row.id })}
									>
										Restaurar
									</Button>
								</div>
							))}
						</CollapsibleContent>
					</Collapsible>
				</SettingsCard>
			) : null}

			{dialog ? (
				<LabelDialog
					key={dialog.mode === "create" ? "create" : dialog.row.id}
					state={dialog}
					pending={saving}
					onClose={() => setDialog(null)}
					onSubmit={(values) =>
						dialog.mode === "create"
							? create.mutate(values)
							: update.mutate({ id: dialog.row.id, ...values })
					}
				/>
			) : null}
		</SettingsColumn>
	);
}
```

- [ ] **Step 9: Add the nav and palette entries**

In `apps/app/components/workspace-nav.tsx`, replace:

```tsx
	{ title: "Procesos de importación", href: "/settings/import-processes" },
```

with:

```tsx
	{ title: "Procesos de importación", href: "/settings/import-processes" },
	{ title: "Etiquetas de documentos", href: "/settings/document-labels" },
```

In `apps/app/components/crm/quick-switcher.tsx`, replace:

```tsx
			"courier",
			"país",
		],
	},
```

with:

```tsx
			"courier",
			"país",
		],
	},
	{
		id: "settings-document-labels",
		label: "Etiquetas de documentos",
		href: "/settings/document-labels",
		keywords: [
			"documentos",
			"papeles",
			"factura",
			"packing list",
			"comprobante",
			"importaciones",
		],
	},
```

- [ ] **Step 10: Type check and test**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test`
Expected: every app spec passes, including the 5 new ones.

- [ ] **Step 11: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/lib/imports-config.ts apps/app/lib/import-documents.ts apps/app/test/import-documents.spec.ts apps/app/lib/trpc/cache.ts 'apps/app/app/(app)/[slug]/settings/document-labels/page.tsx' 'apps/app/app/(app)/[slug]/settings/document-labels/document-labels-settings.tsx' apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx && bunx biome check apps/app/lib/imports-config.ts apps/app/lib/import-documents.ts apps/app/test/import-documents.spec.ts apps/app/lib/trpc/cache.ts 'apps/app/app/(app)/[slug]/settings/document-labels/page.tsx' 'apps/app/app/(app)/[slug]/settings/document-labels/document-labels-settings.tsx' apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no errors.

---

## Hand over

After Task 7a, part 7 (`2026-11-16-shipment-documents-g.md`) is next. Task 7b (stage editor) is in part 8 and does not depend on part 7. Do not commit.
