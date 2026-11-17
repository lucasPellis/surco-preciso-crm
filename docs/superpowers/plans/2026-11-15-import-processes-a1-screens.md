# Import Processes A1 (part 2 of 2: screens and docs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The settings screen *Procesos de importación* lists the processes, with create, rename, duplicate, archive and restore. A process opens the stage editor that exists today, limited to that process. The order form picks a process: required, and locked after the first shipment. The order detail names the process. `docs/imports.md` and `AGENTS.md` describe processes.

**Architecture:** The settings route moves from `/settings/import-stages` to `/settings/import-processes` (the list) and `/settings/import-processes/[processId]` (the stage editor). The stage editor component moves unchanged except for a `processId` prop. Pure client helpers live in `apps/app/lib/import-process-settings.ts` and `apps/app/lib/import-orders.ts`, with unit tests. One cache entry, `cache.importProcesses`, refreshes the list. Client components import only `@crm/ui`, the tRPC client, React, and the enum-only subpaths `@crm/db/enums` and `@crm/db/import-process`.

**Tech Stack:** Next.js (app router, `params` is a `Promise`), TanStack Query with tRPC, shadcn components from `packages/ui`, bun test.

Spec: `docs/superpowers/specs/2026-11-15-import-processes-design.md`. Part 1: `docs/superpowers/plans/2026-11-15-import-processes-a1.md`. Its decisions and open questions apply here. Run part 1 completely first: this part reads `importProcesses`, `importStages.settings({ processId })`, `importOrders.options().processes` and `importOrders.byId().process` from the generated router.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish. No voseo: "Elige", never "Elegí".
- Do not read `.env`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument and quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** The owner approves commits. No `git add`, no `git mv`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app`. Before you edit a shared file (`workspace-nav.tsx`, `quick-switcher.tsx`, `cache.ts`, `AGENTS.md`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- A `"use client"` file never imports `@crm/auth` or the `@crm/db` barrel. `@crm/db/enums`, `@crm/db/import-stage`, `@crm/db/import-process` and `@crm/db/pipeline-stage` import only generated enums, so they are allowed.
- UI comes from `packages/ui`. No literal colours, radii or shadows. Separate inline items with `MetaRow`. An option label joins with a comma.
- `noUncheckedIndexedAccess` is on.

## File structure

| File | Responsibility |
| --- | --- |
| `apps/app/lib/imports-config.ts` | Country labels and the copy suffix |
| `apps/app/lib/import-process-settings.ts` | `ImportProcessRow`, `splitImportProcesses`, `copyName`, `countryFromChoice`, `countryLabel`, `countLabel` |
| `apps/app/test/import-process-settings.spec.ts` | Unit test of those helpers |
| `apps/app/lib/import-orders.ts` | `ProcessOption`, `processChoices`, `defaultProcessId`, `processLabel` |
| `apps/app/test/import-orders.spec.ts` | Three new tests |
| `apps/app/lib/trpc/cache.ts` | `cache.importProcesses`, wider fan-out of `importStages` and `importOrders` |
| `apps/app/app/(app)/[slug]/settings/import-processes/page.tsx` | Server page of the list |
| `apps/app/app/(app)/[slug]/settings/import-processes/import-processes-settings.tsx` | The list screen |
| `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/page.tsx` | Server page of one process |
| `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx` | The stage editor, moved, with a `processId` prop |
| `apps/app/app/(app)/[slug]/settings/import-stages/` | Removed |
| `apps/app/components/workspace-nav.tsx` | Settings menu entry |
| `apps/app/components/crm/quick-switcher.tsx` | Command palette entry |
| `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx` | The *Proceso* field |
| `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx` | The process name in the header |
| `docs/imports.md` | Processes |
| `AGENTS.md` | Index row |

---

### Task 1: Client helpers and cache

**Files:**
- Modify: `apps/app/lib/imports-config.ts`
- Create: `apps/app/lib/import-process-settings.ts`
- Create: `apps/app/test/import-process-settings.spec.ts`
- Modify: `apps/app/lib/import-orders.ts`
- Modify: `apps/app/test/import-orders.spec.ts`
- Modify: `apps/app/lib/trpc/cache.ts`

- [ ] **Step 1: Check the router is generated**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'importProcesses' apps/api/src/generated/server.ts`
Expected: at least one line. If none, part 1 Task 7 has not run. Stop.

- [ ] **Step 2: Write the failing tests**

Create `apps/app/test/import-process-settings.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	copyName,
	countLabel,
	countryFromChoice,
	countryLabel,
	type ImportProcessRow,
	NO_COUNTRY,
	splitImportProcesses,
} from "../lib/import-process-settings";

function row(id: string, archived: boolean): ImportProcessRow {
	return {
		id,
		name: id,
		countryCode: null,
		archived,
		stageCount: 3,
		orderCount: 0,
		activeShipmentCount: 0,
	};
}

describe("splitting the processes", () => {
	it("separates active and archived processes and keeps the order", () => {
		const split = splitImportProcesses([
			row("A", false),
			row("B", true),
			row("C", false),
		]);

		expect(split.active.map((item) => item.id)).toEqual(["A", "C"]);
		expect(split.archived.map((item) => item.id)).toEqual(["B"]);
	});
});

describe("the name of a copy", () => {
	it("adds the copy suffix", () => {
		expect(copyName("Courier", 60)).toBe("Courier (copia)");
	});

	it("stays within the limit", () => {
		const name = copyName("x".repeat(60), 60);

		expect(name.length).toBe(60);
		expect(name.endsWith(" (copia)")).toBe(true);
	});
});

describe("the country", () => {
	it("reads a choice and labels a code", () => {
		expect(countryFromChoice("AR")).toBe("AR");
		expect(countryFromChoice(NO_COUNTRY)).toBeNull();
		expect(countryFromChoice("CL")).toBeNull();
		expect(countryLabel("BR")).toBe("Brasil");
		expect(countryLabel(null)).toBeNull();
	});
});

describe("counts", () => {
	it("uses the singular for one only", () => {
		expect(countLabel(1, "etapa", "etapas")).toBe("1 etapa");
		expect(countLabel(0, "etapa", "etapas")).toBe("0 etapas");
		expect(countLabel(3, "etapa", "etapas")).toBe("3 etapas");
	});
});
```

In `apps/app/test/import-orders.spec.ts`, replace:

```ts
	NO_DEAL,
	productChoices,
```

with:

```ts
	defaultProcessId,
	NO_DEAL,
	type ProcessOption,
	processChoices,
	processLabel,
	productChoices,
```

At the end of `apps/app/test/import-orders.spec.ts`, add:

```ts

describe("processes", () => {
	const courier: ProcessOption = {
		id: "p-1",
		name: "Courier",
		countryCode: "AR",
	};
	const sea: ProcessOption = { id: "p-2", name: "Marítimo", countryCode: null };

	it("keeps the archived process of a saved order among the choices", () => {
		expect(
			processChoices([courier], {
				id: "p-old",
				name: "Viejo",
				archived: true,
			}).map((item) => item.id),
		).toEqual(["p-1", "p-old"]);
		expect(
			processChoices([courier], {
				id: "p-1",
				name: "Courier",
				archived: false,
			}),
		).toEqual([courier]);
		expect(processChoices([courier], null)).toEqual([courier]);
	});

	it("chooses the only process and nothing when there are several", () => {
		expect(defaultProcessId([courier])).toBe("p-1");
		expect(defaultProcessId([courier, sea])).toBe("");
		expect(defaultProcessId([])).toBe("");
	});

	it("labels a process with its country", () => {
		expect(processLabel(courier)).toBe("Courier, Argentina");
		expect(processLabel(sea)).toBe("Marítimo");
	});
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-process-settings.spec.ts test/import-orders.spec.ts`
Expected: FAIL with `Cannot find module '../lib/import-process-settings'` and a missing export `processChoices`.

- [ ] **Step 4: Add the labels**

Replace the whole content of `apps/app/lib/imports-config.ts` with:

```ts
import type { ImportCountry } from "@crm/db/enums";

export const IMPORTS_UI = {
	pageTitle: "Importaciones",
	locale: "es",
	copySuffix: " (copia)",
	countryLabels: {
		AR: "Argentina",
		PY: "Paraguay",
		BR: "Brasil",
	} satisfies Record<ImportCountry, string>,
} as const;
```

- [ ] **Step 5: Write the settings helpers**

Create `apps/app/lib/import-process-settings.ts`:

```ts
import { ImportCountry } from "@crm/db/enums";
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";

export type ImportProcessRow =
	RouterOutputs["importProcesses"]["list"]["processes"][number];

export const NO_COUNTRY = "none";

export function splitImportProcesses(rows: readonly ImportProcessRow[]) {
	return {
		active: rows.filter((row) => !row.archived),
		archived: rows.filter((row) => row.archived),
	};
}

export function copyName(name: string, maxLength: number): string {
	const suffix = IMPORTS_UI.copySuffix;
	return `${name.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

export function countryFromChoice(value: string): ImportCountry | null {
	return (
		Object.values(ImportCountry).find((country) => country === value) ?? null
	);
}

export function countryLabel(country: ImportCountry | null): string | null {
	return country === null ? null : IMPORTS_UI.countryLabels[country];
}

export function countLabel(count: number, one: string, many: string): string {
	return count === 1 ? `1 ${one}` : `${count} ${many}`;
}
```

- [ ] **Step 6: Add the order helpers**

In `apps/app/lib/import-orders.ts`, replace:

```ts
export type ProductOption = ImportOrderOptions["products"][number];
export type DealOption = ImportOrderOptions["deals"][number];
```

with:

```ts
export type ProductOption = ImportOrderOptions["products"][number];
export type DealOption = ImportOrderOptions["deals"][number];
export type ProcessOption = ImportOrderOptions["processes"][number];
```

Replace:

```ts
export function productLabel(product: ProductOption): string {
```

with:

```ts
export function processChoices(
	processes: readonly ProcessOption[],
	saved: ImportOrderDetail["process"] | null,
): ProcessOption[] {
	if (saved === null || processes.some((item) => item.id === saved.id)) {
		return [...processes];
	}
	return [...processes, { id: saved.id, name: saved.name, countryCode: null }];
}

export function defaultProcessId(processes: readonly ProcessOption[]): string {
	const [only, ...rest] = processes;
	return only !== undefined && rest.length === 0 ? only.id : "";
}

export function processLabel(option: ProcessOption): string {
	return option.countryCode === null
		? option.name
		: `${option.name}, ${IMPORTS_UI.countryLabels[option.countryCode]}`;
}

export function productLabel(product: ProductOption): string {
```

- [ ] **Step 7: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-process-settings.spec.ts test/import-orders.spec.ts test/import-stage-settings.spec.ts`
Expected: 5, 13 and 5 tests pass.

- [ ] **Step 8: Add the cache entry**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/app/lib/trpc/cache.ts`
Expected: no output. If there is output, stop and ask the owner.

In `apps/app/lib/trpc/cache.ts`, replace:

```ts
	importStages(options?: Options): Promise<void>;
```

with:

```ts
	importProcesses(options?: Options): Promise<void>;
	importStages(options?: Options): Promise<void>;
```

Replace:

```ts
		importStages: (options) =>
			run(
				[trpc.importStages.settings.queryKey()],
				[trpc.importOrders.byId.queryKey()],
				options,
			),

		importOrders: (options) =>
			run(
				[trpc.importOrders.list.queryKey(), trpc.importOrders.byId.queryKey()],
				[trpc.importStages.settings.queryKey()],
				options,
			),
```

with:

```ts
		importProcesses: (options) =>
			run(
				[trpc.importProcesses.list.queryKey()],
				[
					trpc.importStages.settings.queryKey(),
					trpc.importOrders.options.queryKey(),
				],
				options,
			),

		importStages: (options) =>
			run(
				[trpc.importStages.settings.queryKey()],
				[
					trpc.importOrders.byId.queryKey(),
					trpc.importProcesses.list.queryKey(),
				],
				options,
			),

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

- [ ] **Step 9: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/lib/imports-config.ts apps/app/lib/import-process-settings.ts apps/app/test/import-process-settings.spec.ts apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts apps/app/lib/trpc/cache.ts && bunx biome check apps/app/lib/imports-config.ts apps/app/lib/import-process-settings.ts apps/app/test/import-process-settings.spec.ts apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts apps/app/lib/trpc/cache.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 2: The settings screens

**Files:**
- Create: `apps/app/app/(app)/[slug]/settings/import-processes/page.tsx`
- Create: `apps/app/app/(app)/[slug]/settings/import-processes/import-processes-settings.tsx`
- Create: `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/page.tsx`
- Move: `apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx` to `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx`
- Delete: `apps/app/app/(app)/[slug]/settings/import-stages/page.tsx` and its folder

Open question 1 of part 1: the old path gets no redirect, as with the `/pipeline` to `/funnel` rename (commit `7a53b2a`). If the owner picks Option B, keep `import-stages/page.tsx` and replace its content with a server page that calls `redirect` to `/${slug}/settings/import-processes`.

- [ ] **Step 1: Move the stage editor and remove the old route**

Run: `cd "/Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app/app/(app)/[slug]/settings" && mkdir -p "import-processes/[processId]" && mv import-stages/import-stages-settings.tsx "import-processes/[processId]/import-stages-settings.tsx" && rm import-stages/page.tsx && rmdir import-stages && eza -T import-processes`
Expected: `import-processes` holds `[processId]/import-stages-settings.tsx`.

- [ ] **Step 2: Scope the stage editor to one process**

In `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx`, make these replacements.

Replace:

```tsx
} from "react";
import { toast } from "sonner";
```

with:

```tsx
} from "react";
import Link from "next/link";
import { toast } from "sonner";
```

Replace:

```tsx
import { useTRPC } from "@/lib/trpc/client";
```

with:

```tsx
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
```

Replace:

```tsx
export function ImportStagesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
```

with:

```tsx
export function ImportStagesSettings({ processId }: { processId: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const url = useWorkspaceUrl();
```

Replace:

```tsx
	const list = useQuery(trpc.importStages.settings.queryOptions());
```

with:

```tsx
	const list = useQuery(trpc.importStages.settings.queryOptions({ processId }));
```

Replace:

```tsx
			await reorder.mutateAsync({ keys }).catch(() => undefined);
```

with:

```tsx
			await reorder.mutateAsync({ processId, keys }).catch(() => undefined);
```

Replace:

```tsx
		<SettingsColumn>
			<SettingsCard
				title="Etapas de importación"
```

with:

```tsx
		<SettingsColumn>
			<Button asChild variant="link" size="inline" className="self-start">
				<Link href={url("/settings/import-processes")}>
					Volver a los procesos
				</Link>
			</Button>
			<SettingsCard
				title={list.data.process.name}
```

Replace:

```tsx
							? create.mutate(values)
```

with:

```tsx
							? create.mutate({ processId, ...values })
```

The archive dialog keeps `importArchiveTargets(rows, archiving.key)`. `rows` now holds only the stages of this process, so the dialog offers only the active in-progress stages of the same process (part 1 Decision 13).

- [ ] **Step 3: Write the server page of one process**

Create `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/page.tsx`:

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
import { ImportStagesSettings } from "./import-stages-settings";

type ProcessParams = Promise<{ slug: string; processId: string }>;

export const metadata: Metadata = {
	title: "Etapas del proceso",
};

export default function ImportProcessStagesPage({
	params,
}: {
	params: ProcessParams;
}) {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etapas del proceso</PageShellTitle>
					<PageShellDescription>
						Las etapas por las que pasa un envío de este proceso. Cambia
						nombres, orden y color, o agrega etapas intermedias. La primera
						etapa y las de recepción y cancelación son fijas y solo se
						renombran.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Stages params={params} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Stages({ params }: { params: ProcessParams }) {
	await requireSession();
	const { processId } = await params;

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		trpc.importStages.settings.queryOptions({ processId }),
	);

	return (
		<HydrateClient>
			<ImportStagesSettings processId={processId} />
		</HydrateClient>
	);
}
```

A missing process id makes the prefetch fail quietly. The client then shows the card "No se pudieron cargar las etapas" with the server message "No existe un proceso con ese id.".

- [ ] **Step 4: Write the list screen**

Create `apps/app/app/(app)/[slug]/settings/import-processes/import-processes-settings.tsx`:

```tsx
"use client";

import { ImportCountry } from "@crm/db/enums";
import { IMPORT_PROCESS } from "@crm/db/import-process";
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
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	copyName,
	countLabel,
	countryFromChoice,
	countryLabel,
	type ImportProcessRow,
	NO_COUNTRY,
	splitImportProcesses,
} from "@/lib/import-process-settings";
import { IMPORTS_UI } from "@/lib/imports-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const ROW =
	"flex flex-wrap items-center gap-2.5 border-b px-5 py-2.5 last:border-b-0";

const DIALOG_TEXT = {
	create: {
		title: "Nuevo proceso",
		description:
			"El proceso nuevo empieza con Pedido, Recibido y Cancelado. Agrega las demás etapas después.",
	},
	edit: {
		title: "Editar proceso",
		description: "El cambio se ve en todas las órdenes de este proceso.",
	},
	duplicate: {
		title: "Duplicar proceso",
		description:
			"La copia lleva las etapas activas y el país. No lleva órdenes ni envíos.",
	},
} as const;

type DialogState =
	| { mode: "create" }
	| { mode: "edit"; row: ImportProcessRow }
	| { mode: "duplicate"; row: ImportProcessRow };

type ProcessValues = { name: string; countryCode: ImportCountry | null };

function initialName(state: DialogState): string {
	if (state.mode === "create") return "";
	if (state.mode === "edit") return state.row.name;
	return copyName(state.row.name, IMPORT_PROCESS.nameMaxLength);
}

function dialogKey(state: DialogState): string {
	return state.mode === "create" ? "create" : `${state.mode}-${state.row.id}`;
}

function ProcessDialog({
	state,
	pending,
	onClose,
	onSubmit,
}: {
	state: DialogState;
	pending: boolean;
	onClose: () => void;
	onSubmit: (values: ProcessValues) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const countryId = useId();
	const [name, setName] = useState(() => initialName(state));
	const [country, setCountry] = useState<string>(
		state.mode === "create" ? NO_COUNTRY : (state.row.countryCode ?? NO_COUNTRY),
	);
	const text = DIALOG_TEXT[state.mode];

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{text.title}</DialogTitle>
					<DialogDescription>{text.description}</DialogDescription>
				</DialogHeader>

				<form
					id="import-process-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit({
							name: name.trim(),
							countryCode: countryFromChoice(country),
						});
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
								maxLength={IMPORT_PROCESS.nameMaxLength}
								placeholder="Courier Argentina"
								onChange={(event) => setName(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						{state.mode === "duplicate" ? null : (
							<Field>
								<FieldLabel htmlFor={countryId}>País</FieldLabel>
								<Select value={country} onValueChange={setCountry}>
									<SelectTrigger id={countryId} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_COUNTRY}>Sin país</SelectItem>
										{Object.values(ImportCountry).map((code) => (
											<SelectItem key={code} value={code}>
												{IMPORTS_UI.countryLabels[code]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="import-process-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ProcessSummary({ row }: { row: ImportProcessRow }) {
	const country = countryLabel(row.countryCode);

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-px">
			<span className="truncate font-medium">{row.name}</span>
			<MetaRow>
				{country ? <span>{country}</span> : null}
				<span className="tabular-nums">
					{countLabel(row.stageCount, "etapa", "etapas")}
				</span>
				<span className="tabular-nums">
					{countLabel(row.orderCount, "orden", "órdenes")}
				</span>
				{row.activeShipmentCount > 0 ? (
					<span className="tabular-nums">
						{countLabel(
							row.activeShipmentCount,
							"envío en curso",
							"envíos en curso",
						)}
					</span>
				) : null}
			</MetaRow>
		</div>
	);
}

export function ImportProcessesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const url = useWorkspaceUrl();

	const [dialog, setDialog] = useState<DialogState | null>(null);

	const list = useQuery(trpc.importProcesses.list.queryOptions());

	const settled = {
		onSettled: () => cache.importProcesses(),
		onError: (error: { message: string }) => toast.error(error.message),
	};
	const closeWith = (message: string) => () => {
		setDialog(null);
		toast.success(message);
	};

	const create = useMutation(
		trpc.importProcesses.create.mutationOptions({
			...settled,
			onSuccess: closeWith("Proceso creado."),
		}),
	);
	const update = useMutation(
		trpc.importProcesses.update.mutationOptions({
			...settled,
			onSuccess: closeWith("Proceso actualizado."),
		}),
	);
	const duplicate = useMutation(
		trpc.importProcesses.duplicate.mutationOptions({
			...settled,
			onSuccess: closeWith("Proceso duplicado."),
		}),
	);
	const archive = useMutation(
		trpc.importProcesses.archive.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Proceso archivado."),
		}),
	);
	const restore = useMutation(
		trpc.importProcesses.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Proceso restaurado."),
		}),
	);

	if (list.isError) {
		return (
			<SettingsColumn>
				<SettingsCard
					title="No se pudieron cargar los procesos"
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

	const { canManage, processes } = list.data;
	const { active, archived } = splitImportProcesses(processes);
	const saving = create.isPending || update.isPending || duplicate.isPending;
	const busy =
		!canManage || saving || archive.isPending || restore.isPending;

	const stagesLink = (row: ImportProcessRow) => (
		<Button asChild variant="ghost" size="sm">
			<Link href={url(`/settings/import-processes/${row.id}`)}>Etapas</Link>
		</Button>
	);

	return (
		<SettingsColumn>
			<SettingsCard
				title="Procesos de importación"
				description="Cada orden sigue un proceso. Abre las etapas de un proceso para cambiarlas."
				hint={
					canManage
						? "Los cambios se guardan al instante."
						: "Solo un propietario o un administrador puede cambiar los procesos."
				}
				control="table"
				action={
					<Button
						size="sm"
						disabled={busy}
						onClick={() => setDialog({ mode: "create" })}
					>
						Nuevo proceso
					</Button>
				}
			>
				<div>
					{active.map((row) => (
						<div key={row.id} className={ROW}>
							<ProcessSummary row={row} />
							{stagesLink(row)}
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
								onClick={() => setDialog({ mode: "duplicate", row })}
							>
								Duplicar
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
					title="Procesos archivados"
					description="Un proceso archivado no se elige en una orden nueva. Sus órdenes y su historial se conservan."
					control="table"
				>
					<Collapsible>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center gap-2 border-b px-5 py-2.5 text-left font-medium text-13"
							>
								Ver archivados ({archived.length})
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							{archived.map((row) => (
								<div key={row.id} className={ROW}>
									<span className="min-w-0 flex-1 truncate text-13 text-muted-foreground">
										{row.name}
									</span>
									{stagesLink(row)}
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
				<ProcessDialog
					key={dialogKey(dialog)}
					state={dialog}
					pending={saving}
					onClose={() => setDialog(null)}
					onSubmit={(values) => {
						if (dialog.mode === "create") create.mutate(values);
						else if (dialog.mode === "edit")
							update.mutate({ id: dialog.row.id, ...values });
						else duplicate.mutate({ id: dialog.row.id, name: values.name });
					}}
				/>
			) : null}
		</SettingsColumn>
	);
}
```

- [ ] **Step 5: Write the server page of the list**

Create `apps/app/app/(app)/[slug]/settings/import-processes/page.tsx`:

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
import { ImportProcessesSettings } from "./import-processes-settings";

export const metadata: Metadata = {
	title: "Procesos de importación",
};

export default function ImportProcessesSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Procesos de importación</PageShellTitle>
					<PageShellDescription>
						Un proceso es la lista de etapas que sigue un envío, por ejemplo
						según el país de destino o el transporte. Cada orden elige su
						proceso.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Processes />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Processes() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.importProcesses.list.queryOptions());

	return (
		<HydrateClient>
			<ImportProcessesSettings />
		</HydrateClient>
	);
}
```

- [ ] **Step 6: Check that no file names the old route**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'settings/import-stages' apps/app -g '!node_modules' -g '!.next'`
Expected: two lines, in `components/workspace-nav.tsx` and `components/crm/quick-switcher.tsx`. Task 3 changes both.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write "apps/app/app/(app)/[slug]/settings/import-processes/page.tsx" "apps/app/app/(app)/[slug]/settings/import-processes/import-processes-settings.tsx" "apps/app/app/(app)/[slug]/settings/import-processes/[processId]/page.tsx" "apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx" && bunx biome check "apps/app/app/(app)/[slug]/settings/import-processes/page.tsx" "apps/app/app/(app)/[slug]/settings/import-processes/import-processes-settings.tsx" "apps/app/app/(app)/[slug]/settings/import-processes/[processId]/page.tsx" "apps/app/app/(app)/[slug]/settings/import-processes/[processId]/import-stages-settings.tsx"`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 3: Settings menu and command palette

**Files:**
- Modify: `apps/app/components/workspace-nav.tsx`
- Modify: `apps/app/components/crm/quick-switcher.tsx`

- [ ] **Step 1: Check both files are clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Rename the menu entry**

In `apps/app/components/workspace-nav.tsx`, replace:

```tsx
	{ title: "Etapas de importación", href: "/settings/import-stages" },
```

with:

```tsx
	{ title: "Procesos de importación", href: "/settings/import-processes" },
```

The settings menu marks a page active by path prefix (`startsWithSegment`), so the entry stays active on `/settings/import-processes/<id>`.

- [ ] **Step 3: Rename the palette entry**

In `apps/app/components/crm/quick-switcher.tsx`, replace:

```tsx
		id: "settings-import-stages",
		label: "Etapas de importación",
		href: "/settings/import-stages",
		keywords: ["importaciones", "envíos", "aduana", "embarque", "estados"],
```

with:

```tsx
		id: "settings-import-processes",
		label: "Procesos de importación",
		href: "/settings/import-processes",
		keywords: [
			"importaciones",
			"envíos",
			"aduana",
			"embarque",
			"etapas",
			"courier",
			"país",
		],
```

- [ ] **Step 4: Check and format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'settings/import-stages' apps/app -g '!node_modules' -g '!.next'`
Expected: no output.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx && bunx biome check apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 4: The order form and the order detail

**Files:**
- Modify: `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx`
- Modify: `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx`

Open question 2 of part 1: the field always shows. With one active process it is already chosen.

- [ ] **Step 1: Import the helpers**

In `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx`, replace:

```tsx
	dealChoices,
	dealLabel,
	draftFromLine,
```

with:

```tsx
	dealChoices,
	dealLabel,
	defaultProcessId,
	draftFromLine,
```

Replace:

```tsx
	NO_DEAL,
	productChoices,
	productLabel,
	readLineDrafts,
} from "@/lib/import-orders";
```

with:

```tsx
	NO_DEAL,
	processChoices,
	processLabel,
	productChoices,
	productLabel,
	readLineDrafts,
} from "@/lib/import-orders";
```

- [ ] **Step 2: Hold the chosen process**

Replace:

```tsx
	const [notes, setNotes] = useState(order?.notes ?? "");
```

with:

```tsx
	const [notes, setNotes] = useState(order?.notes ?? "");
	const [processId, setProcessId] = useState(order?.process.id ?? "");
```

Replace:

```tsx
		orderedAt,
		notes,
		lines,
	});
	const [initial] = useState(snapshot);
```

with:

```tsx
		orderedAt,
		notes,
		processId,
		lines,
	});
	const [initial] = useState(snapshot);
```

Replace:

```tsx
	const notesId = useId();
```

with:

```tsx
	const notesId = useId();
	const processFieldId = useId();
```

Replace:

```tsx
	const deals = dealChoices(options.data?.deals ?? [], savedLines);
```

with:

```tsx
	const deals = dealChoices(options.data?.deals ?? [], savedLines);
	const processes = processChoices(
		options.data?.processes ?? [],
		order?.process ?? null,
	);
	const chosenProcessId =
		processId === "" ? defaultProcessId(processes) : processId;
	const processLocked = (order?.shipments.length ?? 0) > 0;
```

- [ ] **Step 3: Validate and send it**

Replace:

```tsx
						if (orderedAt === "") errors[dateId] = "Elige una fecha.";
```

with:

```tsx
						if (orderedAt === "") errors[dateId] = "Elige una fecha.";
						if (chosenProcessId === "")
							errors[processFieldId] = "Elige un proceso.";
```

Replace:

```tsx
							orderedAt,
							notes,
							lines: parsed.value,
						};
```

with:

```tsx
							orderedAt,
							notes,
							processId: chosenProcessId,
							lines: parsed.value,
						};
```

- [ ] **Step 4: Show the field**

Replace:

```tsx
						<Field data-invalid={!!validation.errors[dateId]}>
							<FieldLabel htmlFor={dateId}>Fecha de la orden</FieldLabel>
```

with:

```tsx
						<Field data-invalid={!!validation.errors[processFieldId]}>
							<FieldLabel htmlFor={processFieldId}>Proceso</FieldLabel>
							<Select
								value={chosenProcessId}
								disabled={processLocked}
								onValueChange={setProcessId}
							>
								<SelectTrigger
									id={processFieldId}
									className="w-full"
									aria-invalid={!!validation.errors[processFieldId]}
									aria-describedby={
										validation.errors[processFieldId]
											? `${processFieldId}-error`
											: undefined
									}
								>
									<SelectValue placeholder="Elige un proceso" />
								</SelectTrigger>
								<SelectContent>
									{processes.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{processLabel(item)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{processLocked ? (
								<FieldDescription>
									La orden ya tiene envíos. El proceso no cambia.
								</FieldDescription>
							) : null}
							<FieldError id={`${processFieldId}-error`}>
								{validation.errors[processFieldId]}
							</FieldError>
						</Field>

						<Field data-invalid={!!validation.errors[dateId]}>
							<FieldLabel htmlFor={dateId}>Fecha de la orden</FieldLabel>
```

- [ ] **Step 5: Name the process in the detail**

In `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx`, replace:

```tsx
					<span>{order.supplierName}</span>
					<span>{formatDay(order.orderedAt)}</span>
```

with:

```tsx
					<span>{order.supplierName}</span>
					<span>{order.process.name}</span>
					<span>{formatDay(order.orderedAt)}</span>
```

The move dialog reads `order.stages`. Part 1 made it the active stages of the order's process, so the dialog offers no stage of another process. No change here.

- [ ] **Step 6: Type check the app**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors. A mismatch in a `@crm/ui` prop (`Button` `size="inline"`, `SelectTrigger` `aria-invalid`) shows here. Fix it in the file of this plan, never in `packages/ui`.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write "apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx" "apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx" && bunx biome check "apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx" "apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx"`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 5: Docs

**Files:**
- Modify: `docs/imports.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Check both files are clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- docs/imports.md AGENTS.md`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Describe processes in `docs/imports.md`**

Replace:

```md
# Imports — read when touching import stages, purchase orders or shipments

The spec is `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`. This page
holds the rules the code depends on.
```

with:

```md
# Imports — read when touching import processes, stages, purchase orders or shipments

The specs are `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md` and
`docs/superpowers/specs/2026-11-15-import-processes-design.md`. This page holds the rules
the code depends on.
```

Replace:

```md
- `ImportStage` keys never change. Code reads `kind` (`IN_PROGRESS`, `RECEIVED`,
  `CANCELLED`), never `name`.
```

with:

```md
- `ImportStage` keys never change. Code reads `kind` (`IN_PROGRESS`, `RECEIVED`,
  `CANCELLED`), never `name`.
- `ImportProcess` is a named list of stages, with an optional country (`AR`, `PY`, `BR`)
  that is only a label. Every stage and every order has one `processId`.

## Processes

- A stage `key` is unique in the whole table, not per process. `keyedStages` in
  `packages/db/src/import-process.ts` gives new keys: it reads every key in the table
  and adds a suffix (`PEDIDO_2`). A key never changes, so `Shipment.stageKey` and
  `ShipmentStageEvent.stageKey` need no process column.
- A stage name is unique in its process, ignoring case. A process name is unique,
  ignoring case.
- Each process has one active entry stage (`import_stage_entry_key` on
  `("processId", "isEntry")`), one received and one cancelled stage. A new process
  starts with *Pedido*, *Recibido* and *Cancelado* (`IMPORT_PROCESS.fixedStages`).
- Duplicate copies the active stages with new keys and the country. It copies no
  order.
- A shipment moves only between the stages of its order's process
  (`moveShipmentInTx`). A stage archive moves its shipments only inside the process.
- An order changes its process only while it has no shipment.
- An archived process cannot be picked by an order and refuses new shipments. It
  cannot be archived while a shipment is in an `IN_PROGRESS` stage. `archive` locks the
  `import_process` row `FOR UPDATE`; order writes and `createShipment` lock it
  `FOR SHARE` (`assertProcessOpen`).
- The migration created "Importación estándar" (`import_process_standard`) and gave it
  every stage and order that existed.
```

Replace:

```md
- `apps/api/src/imports`: the stage list (`importStages`) and `moveShipmentInTx`.
- `apps/api/src/import-orders`: orders, shipments and moves (`importOrders`).
- `packages/db/src/import-stage.ts` and `packages/db/src/import-order.ts`: limits
  (`IMPORT_STAGE`, `IMPORT_ORDER`) and pure rules. The app imports these subpaths.
  They import only generated enums, so a client component may use them.
```

with:

```md
- `apps/api/src/import-processes`: the process list (`importProcesses`).
- `apps/api/src/imports`: the stages of one process (`importStages`) and
  `moveShipmentInTx`.
- `apps/api/src/import-orders`: orders, shipments and moves (`importOrders`).
- `packages/db/src/import-stage.ts`, `packages/db/src/import-process.ts` and
  `packages/db/src/import-order.ts`: limits (`IMPORT_STAGE`, `IMPORT_PROCESS`,
  `IMPORT_ORDER`) and pure rules. The app imports these subpaths. They import only
  generated enums and each other, so a client component may use them.
- Integration specs create their own process with
  `apps/api/test/import-process-fixture.ts` and remove it in foreign key order. No spec
  reads the default process.
```

Replace:

```md
- `/imports`: `orders-table.tsx`, `order-detail-sheet.tsx`, `order-form-sheet.tsx`,
  `shipment-dialogs.tsx`. Parsing and labels are in `apps/app/lib/import-orders.ts`.
- Every mutation returns the full order and calls `cache.importOrders()`, which also
  refreshes the stage counts in settings.
```

with:

```md
- `/imports`: `orders-table.tsx`, `order-detail-sheet.tsx`, `order-form-sheet.tsx`,
  `shipment-dialogs.tsx`. Parsing and labels are in `apps/app/lib/import-orders.ts`.
- `/settings/import-processes`: the process list. `/settings/import-processes/[processId]`:
  the stage editor of one process. Helpers are in
  `apps/app/lib/import-process-settings.ts` and `apps/app/lib/import-stage-settings.ts`.
- The order form has a required *Proceso* field. With one active process it is already
  chosen. It is locked after the first shipment.
- Every mutation returns the full order and calls `cache.importOrders()`, which also
  refreshes the stage and process counts in settings. Process writes call
  `cache.importProcesses()`.
```

- [ ] **Step 3: Update the index row in `AGENTS.md`**

Replace:

```md
| Import stages, purchase orders, shipments, lead times | `docs/imports.md` |
```

with:

```md
| Import processes and stages, purchase orders, shipments, lead times | `docs/imports.md` |
```

Do not commit; the owner approves commits.

---

### Task 6: Verification

- [ ] **Step 1: Type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=app && bun run check-types --filter=@crm/db`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run lint && bun run lint:slop`
Expected: no finding in a file this plan touched. A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 3: Run every test of A1**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-process.spec.ts test/import-stage.spec.ts test/import-order.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts test/import-stages.integration.spec.ts test/import-processes.integration.spec.ts test/import-orders.integration.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-process-settings.spec.ts test/import-orders.spec.ts test/import-stage-settings.spec.ts`

Expected: all green. API: 9, 25, 11 and 32. App: 5, 13 and 5.

- [ ] **Step 4: Check for leftover rows**

Run part 1 Task 7 Step 5 again.
Expected: `[] [] []`.

- [ ] **Step 5: Browser checklist for the owner**

Give the owner this list. Do not mark the plan closed without it.

1. Sign in as owner. Open *Configuración*. The settings menu shows *Procesos de importación*, not *Etapas de importación*. Open it.
2. The list shows *Importación estándar* with *6 etapas* and the number of existing orders. No country shows.
3. *Nuevo proceso* with an empty name. The form says *Escribe un nombre.*
4. Create *Courier Argentina* with *País* *Argentina*. It shows *Argentina* and *3 etapas*.
5. Create *courier ARGENTINA*. A toast says the process already exists.
6. Click *Etapas* on *Courier Argentina*. The page shows *Pedido*, then *Recibido* and *Cancelado*. The card title is *Courier Argentina*.
7. Add the stages *Documentos de fábrica*, *Enviado al courier*, *Con DHL*, *Costos de importación*, *Pago*, *Presentado al banco*, *Decisión del banco*. Drag *Pago* above *Costos de importación*. Reload. The order stays.
8. Add a stage called *Aduana* to *Courier Argentina*. It is accepted even though *Importación estándar* has *Aduana* too.
9. *Volver a los procesos*. The list shows *11 etapas* for *Courier Argentina*.
10. *Duplicar* on *Courier Argentina*. The dialog proposes *Courier Argentina (copia)*. Rename it *Courier Paraguay* and save. Open its *Etapas*: the same names in the same order. *Editar* the copy and set *País* to *Paraguay*.
11. *Archivar* *Courier Paraguay*. It moves to *Procesos archivados*. *Restaurar* brings it back.
12. Open *Importaciones* and *Nueva orden de compra*. The *Proceso* field shows *Courier Argentina, Argentina*, *Courier Paraguay, Paraguay* and *Importación estándar*. Nothing is chosen. Submit without a process. The field says *Elige un proceso.*
13. Create an order in *Courier Argentina* with 10 units. Add a shipment of 4. The shipment starts in *Pedido* of *Courier Argentina*. The detail header shows *Courier Argentina*.
14. *Mover* the shipment. The list of stages holds only the stages of *Courier Argentina*.
15. *Editar* the order. *Proceso* is disabled and says *La orden ya tiene envíos. El proceso no cambia.*
16. Create an order in *Courier Paraguay* with no shipment. *Editar* it and change *Proceso* to *Importación estándar*. Save. The header shows *Importación estándar*.
17. In settings, *Archivar* *Courier Argentina*. A toast says there are shipments in progress. Move the shipment to *Recibido*. *Archivar* again. It works. Open *Nueva orden de compra*: *Courier Argentina* is not offered. Open the existing order of *Courier Argentina*: the header still names it, and *Editar* with the same process saves.
18. In *Etapas* of *Importación estándar*, *Archivar* a stage that holds a shipment. *Mover a* offers only the in-progress stages of *Importación estándar*.
19. Archive processes until exactly one is active. A process with a shipment in progress refuses the archive, so move or receive those shipments first, or keep that process as the active one. Open *Nueva orden de compra*. *Proceso* already shows that one process. Restore the others after this step.
20. Visit `/settings/import-stages`. The page is not found (Open question 1, Option A).
21. Open the command palette and type *courier*. *Procesos de importación* appears.
22. Sign in as a member. Both settings pages show. Every button is disabled, and the hint says only an owner or an admin can change the processes.
23. Resize to 390 px. The process rows wrap their buttons. The page does not scroll sideways.
24. Switch to dark mode. Both pages keep contrast.

---

## Self-review

**A1 coverage (part 2).**

| Requirement | Where |
| --- | --- |
| Settings screen *Procesos de importación*: list, create, duplicate, rename, archive | Task 2 Steps 4 and 5; checklist 1 to 11 |
| The existing stage editor limited to one process | Task 2 Steps 1 to 3; checklist 6 to 9 |
| The archive dialog offers only stages of the same process | Task 2 Step 2 note; checklist 18 |
| Order form: process required, locked after the first shipment | Task 4 Steps 2 to 4; checklist 12, 15, 16 |
| One active process is already chosen | Task 1 `defaultProcessId`; Task 4 Step 2; checklist 19 |
| The archived process of an order stays among its choices | Task 1 `processChoices`; checklist 17 |
| The detail names the process; the move dialog offers only its stages | Task 4 Step 5; checklist 13 and 14 |
| Nav, palette, cache | Tasks 1 and 3 |
| Docs | Task 5 |
| Browser checklist | Task 6 Step 5 |

**Existing tests this part edits.** `apps/app/test/import-orders.spec.ts` gets three tests and three imports. `apps/app/test/import-stage-settings.spec.ts` is not edited: the row shape of `importStages.settings` did not change.

**Placeholder scan.** No step says "similar to", "TODO" or "add the rest". Every code step holds the whole file or the exact old and new text.

**Name consistency.** `ImportProcessRow`, `splitImportProcesses`, `copyName`, `countryFromChoice`, `countryLabel`, `countLabel`, `NO_COUNTRY` (Task 1) are the names Task 2 imports. `ProcessOption`, `processChoices`, `defaultProcessId`, `processLabel` (Task 1) are the names Task 4 imports. `cache.importProcesses` is declared and implemented in Task 1 and called in Task 2. `IMPORTS_UI.countryLabels` and `IMPORTS_UI.copySuffix` (Task 1) are read in Tasks 1 and 2.

**Known risks.**
- `useFormSheetValidation().validate` was written for inputs. Its handling of an error on a `Select` trigger is not checked by types. Checklist 12 checks that *Elige un proceso.* shows.
- A row with four buttons wraps on a phone. Checklist 23 checks it. A menu of actions is the alternative if the wrap looks wrong.
- `/settings/import-stages` returns not found with no redirect (Open question 1).
- The stage editor of an archived process still allows edits. The spec says the process stays readable and says nothing about edits.
