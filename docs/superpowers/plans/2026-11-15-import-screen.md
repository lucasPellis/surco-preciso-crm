# Importaciones Screen (Phase 2a-2, part 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The *Importaciones* screen at `/imports`: a table of purchase orders, a side sheet with the lines (received over ordered), the shipments with their stage events and the days between stages, and the forms to create and edit an order, create a shipment, change its stage with a date, and edit its reference and tracking number. A nav entry, a command palette entry, `cache.importOrders`, `docs/imports.md` and its row in the `AGENTS.md` index.

**Architecture:** The server page prefetches `importOrders.list` and renders a client table, as `products/page.tsx` does. Row click opens a read sheet that queries `importOrders.byId`. Every mutation returns the full order and calls `cache.importOrders()`. Parsing and labels live in `apps/app/lib/import-orders.ts` (pure, unit-tested). The client files import only `@crm/ui`, the tRPC client, React and the client-safe subpaths `@crm/db/import-order` and `@crm/db/import-stage` (they import only generated enums), never the `@crm/db` or `@crm/auth` barrels.

**Tech Stack:** Next.js, TanStack Query, `@crm/ui` (`DataTable`, `FormSheet`, `Sheet`, `Dialog`, `Select`, `SimpleTable`, `StatusIndicator`, `MetaRow`, `PageSection`), bun test.

**This is part 2 of 2.** Part 1 is `docs/superpowers/plans/2026-11-15-import-orders-shipments.md`. Part 1 must be complete: this part reads `trpc.importOrders.*` from the regenerated `apps/api/src/generated/server.ts`. The decisions and the open questions of part 1 apply here too.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish. No voseo: "Escribe", never "Escribí".
- UI comes only from `packages/ui`. No literal colours, radii or shadows at the call site. No `className` that restyles a shared component. Layout classes on a plain `div` are allowed.
- Separate inline metadata with `MetaRow`, never with a glyph. A string that cannot hold layout (an option label) joins with a comma.
- A `"use client"` file never imports `@crm/db` or `@crm/auth` by their barrels.
- Do not read `.env`. Do not build.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument and quote every path that contains `[slug]` or `(app)`, or zsh expands it as a glob. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** The owner approves commits. No `git add`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app` and docs. Before you edit a shared file (`cache.ts`, `workspace-nav.tsx`, `quick-switcher.tsx`, `AGENTS.md`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- `lint:slop` rejects parameters typed `unknown` or `object`, `Record<string, unknown>` and `...(condition ? {...} : {})`. `Record<string, string>` is allowed.

## Decisions recorded in this part

1. **The detail is a side sheet, not a page.** It keeps the list and the order in one place, as the record sheet does for deals. The URL does not hold the open order.
2. **The order form is one `FormSheet` for create and edit**, with a line editor. It sends the full line list, as `importOrders.update` expects.
3. **The pickers are `Select` lists** filled by `importOrders.options`. A saved line keeps its product or deal in the list even when it is archived or closed (`productChoices`, `dealChoices`).
4. **The form proposes the product's reference cost** when the cost field is empty and a product is chosen.
5. **"Today" in every date input is `utcDay()`** from `apps/app/lib/import-stage-settings.ts`, the helper Plan 2a-1 added. Each date input has `max` today. The shipment date has `min` the order date. The move date has `min` the current stage date.
6. **Days are formatted in UTC** (`timeZone: "UTC"`), so a day never shows as the previous day in a negative offset.
7. **`apps/app/lib/imports-config.ts` holds the page title and the locale** (the `products-config.ts` pattern). The limits stay in `@crm/db/import-order`.
8. **The nav icon is `ShipIcon`** from `lucide-react`.

## File structure

| File | Responsibility |
| --- | --- |
| `apps/app/lib/imports-config.ts` | `IMPORTS_UI` |
| `apps/app/lib/import-orders.ts` | Row types, labels, day format, line and shipment parsing, picker choices |
| `apps/app/test/import-orders.spec.ts` | Unit test of the helpers |
| `apps/app/lib/trpc/cache.ts` | `importOrders` invalidator, `importStages` widened |
| `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx` | Create and edit an order |
| `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx` | New shipment, change stage, shipment details |
| `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx` | The order sheet |
| `apps/app/app/(app)/[slug]/imports/orders-table.tsx` | The table |
| `apps/app/app/(app)/[slug]/imports/imports-search-params.ts` | URL state of the table |
| `apps/app/app/(app)/[slug]/imports/page.tsx` | Server page |
| `apps/app/components/workspace-nav.tsx` | Nav entry |
| `apps/app/components/crm/quick-switcher.tsx` | Command palette entry |
| `docs/imports.md` | Rules of the imports area |
| `AGENTS.md` | Index row |

---

### Task 1: Client helpers

**Files:**
- Create: `apps/app/lib/imports-config.ts`
- Create: `apps/app/lib/import-orders.ts`
- Create: `apps/app/test/import-orders.spec.ts`

- [ ] **Step 1: Check part 1 is in place**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'importOrders: t.router' apps/api/src/generated/server.ts`
Expected: one line. If there is no line, stop: part 1 is not done.

- [ ] **Step 2: Write the failing test**

Create `apps/app/test/import-orders.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	blankDraft,
	centsFromCost,
	daysLabel,
	dealChoices,
	dealLabel,
	draftFromLine,
	formatDay,
	type ImportOrderLine,
	type ImportStageOption,
	moveTargets,
	NO_DEAL,
	productChoices,
	productLabel,
	readLineDrafts,
	readShipmentQuantities,
	unitsLabel,
} from "../lib/import-orders";

function line(
	id: string,
	extra: Partial<ImportOrderLine> = {},
): ImportOrderLine {
	return {
		id,
		productId: `p-${id}`,
		sku: `SKU-${id}`,
		productName: `Equipo ${id}`,
		quantity: 10,
		unitCostCents: 12_345,
		dealId: null,
		dealName: null,
		shipped: 0,
		received: 0,
		remaining: 10,
		...extra,
	};
}

function stage(key: string): ImportStageOption {
	return { key, name: key, kind: "IN_PROGRESS", tone: "NEUTRAL" };
}

describe("labels", () => {
	it("formats counts and days", () => {
		expect(unitsLabel(4, 10)).toBe("4 de 10");
		expect(daysLabel(1)).toBe("1 día");
		expect(daysLabel(0)).toBe("0 días");
		expect(daysLabel(22)).toBe("22 días");
	});

	it("formats a UTC day without moving it", () => {
		const text = formatDay("2026-01-10");
		expect(text).toContain("10");
		expect(text).toContain("2026");
	});
});

describe("costs", () => {
	it("reads a cost in cents and refuses anything else", () => {
		expect(centsFromCost("123.45")).toBe(12_345);
		expect(centsFromCost("123,4")).toBe(12_340);
		expect(centsFromCost(" 7 ")).toBe(700);
		for (const bad of ["", "-1", "1.234", "abc"]) {
			expect(centsFromCost(bad)).toBeNull();
		}
	});
});

describe("order lines", () => {
	it("turns a saved line into a draft and back", () => {
		const draft = draftFromLine(line("a", { dealId: "d1", shipped: 2 }));

		expect(draft).toEqual({
			key: "a",
			id: "a",
			productId: "p-a",
			quantity: "10",
			cost: "123.45",
			dealId: "d1",
			shipped: 2,
		});
		expect(readLineDrafts([draft])).toEqual({
			ok: true,
			value: [
				{
					id: "a",
					productId: "p-a",
					quantity: 10,
					unitCostCents: 12_345,
					dealId: "d1",
				},
			],
		});
	});

	it("reads a new line without id and without deal", () => {
		const result = readLineDrafts([
			{ ...blankDraft("k"), productId: "p", quantity: "3", cost: "5" },
		]);

		expect(result).toEqual({
			ok: true,
			value: [
				{
					id: undefined,
					productId: "p",
					quantity: 3,
					unitCostCents: 500,
					dealId: null,
				},
			],
		});
		expect(blankDraft("k").dealId).toBe(NO_DEAL);
	});

	it("names the first wrong line", () => {
		const ready = { ...blankDraft("k"), productId: "p", cost: "1" };

		expect(readLineDrafts([])).toEqual({
			ok: false,
			error: "Agrega al menos una línea.",
		});
		expect(readLineDrafts([blankDraft("k")])).toEqual({
			ok: false,
			error: "Elige el producto de la línea 1.",
		});
		for (const quantity of ["0", "1.5", ""]) {
			expect(readLineDrafts([ready, { ...ready, quantity }])).toEqual({
				ok: false,
				error:
					"La cantidad de la línea 2 debe ser un número entero mayor que cero.",
			});
		}
		expect(readLineDrafts([{ ...ready, cost: "" }])).toEqual({
			ok: false,
			error: "Escribe el costo unitario de la línea 1.",
		});
	});
});

describe("shipment quantities", () => {
	const lines = [line("a", { remaining: 6 }), line("b", { remaining: 4 })];

	it("reads the quantities and skips empty lines", () => {
		expect(readShipmentQuantities(lines, { a: "4", b: " " })).toEqual({
			ok: true,
			value: [{ orderLineId: "a", quantity: 4 }],
		});
		expect(readShipmentQuantities(lines, { a: "0", b: "4" })).toEqual({
			ok: true,
			value: [{ orderLineId: "b", quantity: 4 }],
		});
	});

	it("refuses more than what is left, a fraction and an empty shipment", () => {
		expect(readShipmentQuantities(lines, { a: "7" })).toEqual({
			ok: false,
			error: "SKU-a tiene 6 unidades pendientes.",
		});
		expect(readShipmentQuantities(lines, { b: "1.5" })).toEqual({
			ok: false,
			error: "La cantidad de SKU-b debe ser un número entero.",
		});
		expect(readShipmentQuantities(lines, {})).toEqual({
			ok: false,
			error: "Escribe la cantidad de al menos una línea.",
		});
	});
});

describe("choices", () => {
	it("offers every stage but the current one", () => {
		expect(
			moveTargets([stage("A"), stage("B"), stage("C")], "B").map(
				(item) => item.key,
			),
		).toEqual(["A", "C"]);
	});

	it("keeps the product and the deal of a saved line among the choices", () => {
		const saved = [line("a", { dealId: "d-old", dealName: "Vieja" })];
		const products = productChoices(
			[{ id: "p-x", sku: "SKU-x", name: "Equipo x", referenceCostCents: 100 }],
			saved,
		);
		const deals = dealChoices(
			[{ id: "d-new", name: "Nueva", companyName: "Acme" }],
			saved,
		);

		expect(products.map(productLabel)).toEqual([
			"SKU-x, Equipo x",
			"SKU-a, Equipo a",
		]);
		expect(deals.map(dealLabel)).toEqual(["Nueva, Acme", "Vieja"]);
	});
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts`
Expected: FAIL with `Cannot find module '../lib/import-orders'`.

- [ ] **Step 4: Write the config**

Create `apps/app/lib/imports-config.ts`:

```ts
export const IMPORTS_UI = {
	pageTitle: "Importaciones",
	locale: "es",
} as const;
```

- [ ] **Step 5: Write the helpers**

Create `apps/app/lib/import-orders.ts`:

```ts
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";

export type ImportOrderRow =
	RouterOutputs["importOrders"]["list"]["rows"][number];
export type ImportOrderDetail = RouterOutputs["importOrders"]["byId"];
export type ImportOrderLine = ImportOrderDetail["lines"][number];
export type ImportShipment = ImportOrderDetail["shipments"][number];
export type ImportStageOption = ImportOrderDetail["stages"][number];

type ImportOrderOptions = RouterOutputs["importOrders"]["options"];

export type ProductOption = ImportOrderOptions["products"][number];
export type DealOption = ImportOrderOptions["deals"][number];

export const NO_DEAL = "none";

export type LineDraft = {
	key: string;
	id: string | null;
	productId: string;
	quantity: string;
	cost: string;
	dealId: string;
	shipped: number;
};

export type OrderLineValue = {
	id?: string;
	productId: string;
	quantity: number;
	unitCostCents: number;
	dealId: string | null;
};

export type ShipmentLineValue = { orderLineId: string; quantity: number };

export type Parsed<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: string };

const dayFormat = new Intl.DateTimeFormat(IMPORTS_UI.locale, {
	dateStyle: "medium",
	timeZone: "UTC",
});

export function formatDay(day: string): string {
	return dayFormat.format(new Date(`${day}T00:00:00.000Z`));
}

export function unitsLabel(done: number, total: number): string {
	return `${done} de ${total}`;
}

export function daysLabel(days: number): string {
	return days === 1 ? "1 día" : `${days} días`;
}

export function costFromCents(cents: number | null): string {
	return cents === null ? "" : (cents / 100).toFixed(2);
}

export function centsFromCost(value: string): number | null {
	const trimmed = value.trim().replace(",", ".");
	if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
	return Math.round(Number(trimmed) * 100);
}

function wholeNumber(value: string): number | null {
	const trimmed = value.trim();
	return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function blankDraft(key: string): LineDraft {
	return {
		key,
		id: null,
		productId: "",
		quantity: "1",
		cost: "",
		dealId: NO_DEAL,
		shipped: 0,
	};
}

export function draftFromLine(line: ImportOrderLine): LineDraft {
	return {
		key: line.id,
		id: line.id,
		productId: line.productId,
		quantity: String(line.quantity),
		cost: costFromCents(line.unitCostCents),
		dealId: line.dealId ?? NO_DEAL,
		shipped: line.shipped,
	};
}

export function readLineDrafts(
	drafts: readonly LineDraft[],
): Parsed<OrderLineValue[]> {
	if (drafts.length === 0) {
		return { ok: false, error: "Agrega al menos una línea." };
	}
	const lines: OrderLineValue[] = [];
	for (const [index, draft] of drafts.entries()) {
		const position = index + 1;
		if (draft.productId === "") {
			return { ok: false, error: `Elige el producto de la línea ${position}.` };
		}
		const quantity = wholeNumber(draft.quantity);
		if (quantity === null || quantity < 1) {
			return {
				ok: false,
				error: `La cantidad de la línea ${position} debe ser un número entero mayor que cero.`,
			};
		}
		const cents = centsFromCost(draft.cost);
		if (cents === null) {
			return {
				ok: false,
				error: `Escribe el costo unitario de la línea ${position}.`,
			};
		}
		lines.push({
			id: draft.id ?? undefined,
			productId: draft.productId,
			quantity,
			unitCostCents: cents,
			dealId: draft.dealId === NO_DEAL ? null : draft.dealId,
		});
	}
	return { ok: true, value: lines };
}

export function readShipmentQuantities(
	lines: readonly ImportOrderLine[],
	values: Readonly<Record<string, string>>,
): Parsed<ShipmentLineValue[]> {
	const picked: ShipmentLineValue[] = [];
	for (const line of lines) {
		const raw = (values[line.id] ?? "").trim();
		if (raw === "" || raw === "0") continue;
		const quantity = wholeNumber(raw);
		if (quantity === null) {
			return {
				ok: false,
				error: `La cantidad de ${line.sku} debe ser un número entero.`,
			};
		}
		if (quantity > line.remaining) {
			return {
				ok: false,
				error: `${line.sku} tiene ${line.remaining} unidades pendientes.`,
			};
		}
		picked.push({ orderLineId: line.id, quantity });
	}
	return picked.length === 0
		? { ok: false, error: "Escribe la cantidad de al menos una línea." }
		: { ok: true, value: picked };
}

export function moveTargets(
	stages: readonly ImportStageOption[],
	currentKey: string,
): ImportStageOption[] {
	return stages.filter((stage) => stage.key !== currentKey);
}

export function productChoices(
	products: readonly ProductOption[],
	saved: readonly ImportOrderLine[],
): ProductOption[] {
	const known = new Set(products.map((product) => product.id));
	const missing = new Map<string, ProductOption>();
	for (const line of saved) {
		if (known.has(line.productId)) continue;
		missing.set(line.productId, {
			id: line.productId,
			sku: line.sku,
			name: line.productName,
			referenceCostCents: null,
		});
	}
	return [...products, ...missing.values()];
}

export function dealChoices(
	deals: readonly DealOption[],
	saved: readonly ImportOrderLine[],
): DealOption[] {
	const known = new Set(deals.map((deal) => deal.id));
	const missing = new Map<string, DealOption>();
	for (const line of saved) {
		if (line.dealId === null || known.has(line.dealId)) continue;
		missing.set(line.dealId, {
			id: line.dealId,
			name: line.dealName ?? line.dealId,
			companyName: "",
		});
	}
	return [...deals, ...missing.values()];
}

export function productLabel(product: ProductOption): string {
	return `${product.sku}, ${product.name}`;
}

export function dealLabel(deal: DealOption): string {
	return deal.companyName === "" ? deal.name : `${deal.name}, ${deal.companyName}`;
}
```

- [ ] **Step 6: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/lib/imports-config.ts apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts && bunx biome check apps/app/lib/imports-config.ts apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 2: Cache invalidator

**Files:**
- Modify: `apps/app/lib/trpc/cache.ts`

A new shipment or move changes the shipment count of a stage, so `importOrders` also refreshes `importStages.settings`. A renamed stage changes the stage names in an open order, so `importStages` also refreshes `importOrders.byId`.

- [ ] **Step 1: Check the file is clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/app/lib/trpc/cache.ts`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Declare it**

In `apps/app/lib/trpc/cache.ts`, replace:

```ts
	importStages(options?: Options): Promise<void>;
```

with:

```ts
	importStages(options?: Options): Promise<void>;
	importOrders(options?: Options): Promise<void>;
```

- [ ] **Step 3: Implement it**

In the same file, replace:

```ts
		importStages: (options) =>
			run([trpc.importStages.settings.queryKey()], [], options),
```

with:

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

- [ ] **Step 4: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/lib/trpc/cache.ts && bunx biome check apps/app/lib/trpc/cache.ts`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 3: The order form sheet

**Files:**
- Create: `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx`

The parent mounts this sheet with a `key` that changes each time it opens, so the form starts from the order (or blank) every time.

- [ ] **Step 1: Write the sheet**

Create `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx`:

```tsx
"use client";

import { IMPORT_ORDER } from "@crm/db/import-order";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@crm/ui/components/field";
import {
	FormSheet,
	FormSheetContent,
	FormSheetFooter,
	FormSheetForm,
	useFormSheetValidation,
} from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	blankDraft,
	costFromCents,
	dealChoices,
	dealLabel,
	draftFromLine,
	type ImportOrderDetail,
	type LineDraft,
	NO_DEAL,
	productChoices,
	productLabel,
	readLineDrafts,
} from "@/lib/import-orders";
import { utcDay } from "@/lib/import-stage-settings";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type OrderFormSheetProps = {
	order: ImportOrderDetail | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: (saved: ImportOrderDetail) => void;
};

export function OrderFormSheet({
	order,
	open,
	onOpenChange,
	onSaved,
}: OrderFormSheetProps) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const options = useQuery({
		...trpc.importOrders.options.queryOptions(),
		enabled: open,
	});

	const [today] = useState(() => utcDay());
	const [number, setNumber] = useState(order?.number ?? "");
	const [supplierName, setSupplierName] = useState(order?.supplierName ?? "");
	const [orderedAt, setOrderedAt] = useState(order?.orderedAt ?? today);
	const [notes, setNotes] = useState(order?.notes ?? "");
	const [lines, setLines] = useState<LineDraft[]>(() =>
		order ? order.lines.map(draftFromLine) : [blankDraft(crypto.randomUUID())],
	);
	const [linesError, setLinesError] = useState<string | null>(null);

	const snapshot = JSON.stringify({
		number,
		supplierName,
		orderedAt,
		notes,
		lines,
	});
	const [initial] = useState(snapshot);

	const numberId = useId();
	const supplierId = useId();
	const dateId = useId();
	const notesId = useId();

	const editing = order !== null;
	const savedLines = order?.lines ?? [];
	const products = productChoices(options.data?.products ?? [], savedLines);
	const deals = dealChoices(options.data?.deals ?? [], savedLines);

	const onSuccess = async (saved: ImportOrderDetail) => {
		await cache.importOrders();
		toast.success(
			editing ? "Orden actualizada." : `Orden ${saved.number} creada.`,
		);
		onSaved?.(saved);
		onOpenChange(false);
	};
	const onError = (error: { message: string }) => toast.error(error.message);

	const create = useMutation(
		trpc.importOrders.create.mutationOptions({ onSuccess, onError }),
	);
	const update = useMutation(
		trpc.importOrders.update.mutationOptions({ onSuccess, onError }),
	);
	const pending = create.isPending || update.isPending;

	const change = (key: string, patch: Partial<LineDraft>) => {
		setLinesError(null);
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
		);
	};

	const pickProduct = (key: string, productId: string) => {
		const product = products.find((item) => item.id === productId);
		const cost = lines.find((item) => item.key === key)?.cost ?? "";
		change(key, {
			productId,
			cost:
				cost === "" && product ? costFromCents(product.referenceCostCents) : cost,
		});
	};

	const addLine = () => {
		setLinesError(null);
		setLines((current) => [...current, blankDraft(crypto.randomUUID())]);
	};

	const removeLine = (key: string) => {
		setLinesError(null);
		setLines((current) => current.filter((line) => line.key !== key));
	};

	return (
		<FormSheet
			dirty={snapshot !== initial}
			pending={pending}
			onDiscard={validation.reset}
			open={open}
			onOpenChange={onOpenChange}
		>
			<FormSheetContent side="right" size="md">
				<SheetHeader>
					<SheetTitle>
						{order ? `Editar orden ${order.number}` : "Nueva orden de compra"}
					</SheetTitle>
					<SheetDescription>
						Cada línea es un producto con su cantidad y su costo unitario en
						USD. Una línea puede apartar las unidades para una oportunidad
						abierta.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="import-order-form"
					onSubmit={(event) => {
						event.preventDefault();
						const errors: Record<string, string> = {};
						if (number.trim() === "")
							errors[numberId] = "Escribe el número de la orden.";
						if (supplierName.trim() === "")
							errors[supplierId] = "Escribe el proveedor.";
						if (orderedAt === "") errors[dateId] = "Elige una fecha.";
						const parsed = readLineDrafts(lines);
						setLinesError(parsed.ok ? null : parsed.error);
						if (!validation.validate(event.currentTarget, errors) || !parsed.ok)
							return;
						const values = {
							number,
							supplierName,
							orderedAt,
							notes,
							lines: parsed.value,
						};
						if (order) update.mutate({ id: order.id, ...values });
						else create.mutate(values);
					}}
				>
					<FieldGroup>
						<Field data-invalid={!!validation.errors[numberId]}>
							<FieldLabel htmlFor={numberId}>Número de orden</FieldLabel>
							<Input
								id={numberId}
								aria-invalid={!!validation.errors[numberId]}
								aria-describedby={
									validation.errors[numberId] ? `${numberId}-error` : undefined
								}
								value={number}
								onChange={(event) => setNumber(event.target.value)}
								maxLength={IMPORT_ORDER.numberMaxLength}
								placeholder="OC-2026-001"
								autoComplete="off"
							/>
							<FieldError id={`${numberId}-error`}>
								{validation.errors[numberId]}
							</FieldError>
						</Field>

						<Field data-invalid={!!validation.errors[supplierId]}>
							<FieldLabel htmlFor={supplierId}>Proveedor</FieldLabel>
							<Input
								id={supplierId}
								aria-invalid={!!validation.errors[supplierId]}
								aria-describedby={
									validation.errors[supplierId]
										? `${supplierId}-error`
										: undefined
								}
								value={supplierName}
								onChange={(event) => setSupplierName(event.target.value)}
								maxLength={IMPORT_ORDER.supplierNameMaxLength}
								autoComplete="off"
							/>
							<FieldError id={`${supplierId}-error`}>
								{validation.errors[supplierId]}
							</FieldError>
						</Field>

						<Field data-invalid={!!validation.errors[dateId]}>
							<FieldLabel htmlFor={dateId}>Fecha de la orden</FieldLabel>
							<Input
								id={dateId}
								type="date"
								required
								max={today}
								aria-invalid={!!validation.errors[dateId]}
								aria-describedby={
									validation.errors[dateId] ? `${dateId}-error` : undefined
								}
								value={orderedAt}
								onChange={(event) => setOrderedAt(event.target.value)}
							/>
							<FieldError id={`${dateId}-error`}>
								{validation.errors[dateId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={notesId}>Notas</FieldLabel>
							<Textarea
								id={notesId}
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								maxLength={IMPORT_ORDER.notesMaxLength}
							/>
						</Field>

						{lines.map((line, index) => (
							<FieldSet key={line.key}>
								<FieldLegend variant="label">{`Línea ${index + 1}`}</FieldLegend>
								<Field>
									<FieldLabel htmlFor={`${line.key}-product`}>Producto</FieldLabel>
									<Select
										value={line.productId}
										disabled={line.shipped > 0}
										onValueChange={(value) => pickProduct(line.key, value)}
									>
										<SelectTrigger id={`${line.key}-product`} className="w-full">
											<SelectValue placeholder="Elige un producto" />
										</SelectTrigger>
										<SelectContent>
											{products.map((product) => (
												<SelectItem key={product.id} value={product.id}>
													{productLabel(product)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{line.shipped > 0 ? (
										<FieldDescription>
											{`Ya hay ${line.shipped} unidades enviadas. El producto no cambia y la cantidad no baja de ${line.shipped}.`}
										</FieldDescription>
									) : null}
								</Field>

								<div className="grid grid-cols-2 gap-3">
									<Field>
										<FieldLabel htmlFor={`${line.key}-quantity`}>
											Cantidad
										</FieldLabel>
										<Input
											id={`${line.key}-quantity`}
											inputMode="numeric"
											value={line.quantity}
											onChange={(event) =>
												change(line.key, { quantity: event.target.value })
											}
											autoComplete="off"
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor={`${line.key}-cost`}>
											Costo unitario (USD)
										</FieldLabel>
										<Input
											id={`${line.key}-cost`}
											inputMode="decimal"
											placeholder="0.00"
											value={line.cost}
											onChange={(event) =>
												change(line.key, { cost: event.target.value })
											}
											autoComplete="off"
										/>
									</Field>
								</div>

								<Field>
									<FieldLabel htmlFor={`${line.key}-deal`}>Oportunidad</FieldLabel>
									<Select
										value={line.dealId}
										onValueChange={(value) => change(line.key, { dealId: value })}
									>
										<SelectTrigger id={`${line.key}-deal`} className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_DEAL}>Sin oportunidad</SelectItem>
											{deals.map((deal) => (
												<SelectItem key={deal.id} value={deal.id}>
													{dealLabel(deal)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>

								<div className="flex justify-end">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={lines.length === 1 || line.shipped > 0}
										onClick={() => removeLine(line.key)}
									>
										Quitar línea
									</Button>
								</div>
							</FieldSet>
						))}

						<div className="flex flex-col gap-2">
							<Button
								type="button"
								variant="outline"
								disabled={lines.length >= IMPORT_ORDER.maxLines}
								onClick={addLine}
							>
								<PlusIcon data-icon="inline-start" />
								Agregar línea
							</Button>
							{linesError ? <FieldError>{linesError}</FieldError> : null}
						</div>
					</FieldGroup>
				</FormSheetForm>

				<FormSheetFooter>
					<Button
						type="submit"
						form="import-order-form"
						disabled={pending || options.isPending}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{editing ? "Guardar" : "Crear orden"}
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
```

- [ ] **Step 2: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write 'apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx' && bunx biome check 'apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx'`
Expected: no findings.

Do not commit; the owner approves commits. The type check runs in Task 6, when the page that mounts this sheet exists.

---

### Task 4: The shipment dialogs

**Files:**
- Create: `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`

Three dialogs. `NewShipmentDialog` creates a shipment from the lines that still have units. `MoveShipmentDialog` changes the stage with a date. `ShipmentInfoDialog` edits the reference and the tracking number. The server checks every rule again.

- [ ] **Step 1: Write the dialogs**

Create `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`:

```tsx
"use client";

import { IMPORT_ORDER } from "@crm/db/import-order";
import { Button } from "@crm/ui/components/button";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	formatDay,
	type ImportOrderDetail,
	type ImportShipment,
	type ImportStageOption,
	moveTargets,
	readShipmentQuantities,
} from "@/lib/import-orders";
import { utcDay } from "@/lib/import-stage-settings";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const onError = (error: { message: string }) => toast.error(error.message);

export function NewShipmentDialog({
	order,
	onClose,
}: {
	order: ImportOrderDetail;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const dateId = useId();
	const referenceId = useId();
	const trackingId = useId();
	const [today] = useState(() => utcDay());
	const [occurredAt, setOccurredAt] = useState(today);
	const [reference, setReference] = useState("");
	const [trackingNumber, setTrackingNumber] = useState("");
	const [quantities, setQuantities] = useState<Record<string, string>>({});
	const [linesError, setLinesError] = useState<string | null>(null);
	const open = order.lines.filter((line) => line.remaining > 0);

	const create = useMutation(
		trpc.importOrders.createShipment.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				toast.success("Envío creado en la etapa de entrada.");
				onClose();
			},
			onError,
		}),
	);

	return (
		<Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Nuevo envío</DialogTitle>
					<DialogDescription>
						Un envío lleva parte de la orden. Escribe cuántas unidades de cada
						línea van en este envío. El envío empieza en la etapa de entrada
						con la fecha que elijas.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-shipment-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (create.isPending) return;
						const errors: Record<string, string> = {};
						if (occurredAt === "") errors[dateId] = "Elige una fecha.";
						const parsed = readShipmentQuantities(open, quantities);
						setLinesError(parsed.ok ? null : parsed.error);
						if (!validation.validate(event.currentTarget, errors) || !parsed.ok)
							return;
						create.mutate({
							orderId: order.id,
							reference,
							trackingNumber,
							occurredAt,
							lines: parsed.value,
						});
					}}
				>
					<FieldGroup>
						{open.map((line) => (
							<Field key={line.id}>
								<FieldLabel htmlFor={`${line.id}-ship`}>
									{`${line.sku}, ${line.productName}`}
								</FieldLabel>
								<Input
									id={`${line.id}-ship`}
									inputMode="numeric"
									placeholder="0"
									value={quantities[line.id] ?? ""}
									onChange={(event) => {
										setLinesError(null);
										setQuantities((current) => ({
											...current,
											[line.id]: event.target.value,
										}));
									}}
									autoComplete="off"
								/>
								<FieldDescription>
									{`Pendientes: ${line.remaining} de ${line.quantity}.`}
								</FieldDescription>
							</Field>
						))}
						{linesError ? <FieldError>{linesError}</FieldError> : null}

						<Field data-invalid={!!validation.errors[dateId]}>
							<FieldLabel htmlFor={dateId}>Fecha del pedido</FieldLabel>
							<Input
								id={dateId}
								type="date"
								required
								min={order.orderedAt}
								max={today}
								aria-invalid={!!validation.errors[dateId]}
								aria-describedby={
									validation.errors[dateId] ? `${dateId}-error` : undefined
								}
								value={occurredAt}
								onChange={(event) => setOccurredAt(event.target.value)}
							/>
							<FieldError id={`${dateId}-error`}>
								{validation.errors[dateId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={referenceId}>Referencia</FieldLabel>
							<Input
								id={referenceId}
								value={reference}
								onChange={(event) => setReference(event.target.value)}
								maxLength={IMPORT_ORDER.referenceMaxLength}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={trackingId}>Número de guía</FieldLabel>
							<Input
								id={trackingId}
								value={trackingNumber}
								onChange={(event) => setTrackingNumber(event.target.value)}
								maxLength={IMPORT_ORDER.trackingNumberMaxLength}
								autoComplete="off"
							/>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						form="new-shipment-form"
						disabled={create.isPending}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Crear envío
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function MoveShipmentDialog({
	shipment,
	stages,
	onClose,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const targetId = useId();
	const dateId = useId();
	const targets = moveTargets(stages, shipment.stage.key);
	const [today] = useState(() => utcDay());
	const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
	const [occurredAt, setOccurredAt] = useState(today);

	const move = useMutation(
		trpc.importOrders.moveShipment.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				toast.success("Etapa cambiada.");
				onClose();
			},
			onError,
		}),
	);

	return (
		<Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Cambiar etapa</DialogTitle>
					<DialogDescription>
						{`El envío está en ${shipment.stage.name} desde el ${formatDay(shipment.stageChangedAt)}. La fecha del cambio no puede ser anterior a ese día ni posterior a hoy. Un envío recibido o cancelado ya no cambia de etapa.`}
					</DialogDescription>
				</DialogHeader>

				<form
					id="move-shipment-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (move.isPending || targetKey === "") return;
						const errors: Record<string, string> = {};
						if (occurredAt === "") errors[dateId] = "Elige una fecha.";
						if (!validation.validate(event.currentTarget, errors)) return;
						move.mutate({ shipmentId: shipment.id, targetKey, occurredAt });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={targetId}>Nueva etapa</FieldLabel>
							<Select value={targetKey} onValueChange={setTargetKey}>
								<SelectTrigger id={targetId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{targets.map((target) => (
										<SelectItem key={target.key} value={target.key}>
											{target.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field data-invalid={!!validation.errors[dateId]}>
							<FieldLabel htmlFor={dateId}>Fecha del cambio</FieldLabel>
							<Input
								id={dateId}
								type="date"
								required
								min={shipment.stageChangedAt}
								max={today}
								aria-invalid={!!validation.errors[dateId]}
								aria-describedby={
									validation.errors[dateId] ? `${dateId}-error` : undefined
								}
								value={occurredAt}
								onChange={(event) => setOccurredAt(event.target.value)}
							/>
							<FieldError id={`${dateId}-error`}>
								{validation.errors[dateId]}
							</FieldError>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						form="move-shipment-form"
						disabled={move.isPending || targetKey === ""}
					>
						{move.isPending ? <Spinner data-icon="inline-start" /> : null}
						Cambiar etapa
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ShipmentInfoDialog({
	shipment,
	onClose,
}: {
	shipment: ImportShipment;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const referenceId = useId();
	const trackingId = useId();
	const [reference, setReference] = useState(shipment.reference ?? "");
	const [trackingNumber, setTrackingNumber] = useState(
		shipment.trackingNumber ?? "",
	);

	const save = useMutation(
		trpc.importOrders.updateShipment.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				toast.success("Envío actualizado.");
				onClose();
			},
			onError,
		}),
	);

	return (
		<Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Datos del envío</DialogTitle>
					<DialogDescription>
						La referencia y el número de guía ayudan a encontrar el envío con el
						proveedor y el transportista.
					</DialogDescription>
				</DialogHeader>

				<form
					id="shipment-info-form"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						if (save.isPending) return;
						save.mutate({ id: shipment.id, reference, trackingNumber });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={referenceId}>Referencia</FieldLabel>
							<Input
								id={referenceId}
								value={reference}
								onChange={(event) => setReference(event.target.value)}
								maxLength={IMPORT_ORDER.referenceMaxLength}
								autoComplete="off"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={trackingId}>Número de guía</FieldLabel>
							<Input
								id={trackingId}
								value={trackingNumber}
								onChange={(event) => setTrackingNumber(event.target.value)}
								maxLength={IMPORT_ORDER.trackingNumberMaxLength}
								autoComplete="off"
							/>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						form="shipment-info-form"
						disabled={save.isPending}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write 'apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx' && bunx biome check 'apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx'`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 5: The order sheet

**Files:**
- Create: `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx`

The sheet shows: the order header, the actions, the lines (ordered, shipped, received over ordered, deal) and one block per shipment with its stage, reference, tracking number, lines and events. Each event shows its day and the days until the next event, or the days until today for the open stage.

- [ ] **Step 1: Write the sheet**

Create `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx`:

```tsx
"use client";

import { isClosedImportKind } from "@crm/db/import-stage";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { MetaRow } from "@crm/ui/components/meta-row";
import { PageSection } from "@crm/ui/components/page-section";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { STAGE_TONE_STATUS } from "@/lib/deal-stage-config";
import {
	daysLabel,
	formatDay,
	type ImportOrderDetail,
	type ImportShipment,
	unitsLabel,
} from "@/lib/import-orders";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { OrderFormSheet } from "./order-form-sheet";
import {
	MoveShipmentDialog,
	NewShipmentDialog,
	ShipmentInfoDialog,
} from "./shipment-dialogs";

const NUMBER = "text-right tabular-nums";

const LINE_COLUMNS: SimpleTableColumn[] = [
	{ id: "product", header: "Producto" },
	{ id: "ordered", header: "Pedido", align: "right" },
	{ id: "shipped", header: "Enviado", align: "right" },
	{ id: "received", header: "Recibido", align: "right" },
	{ id: "deal", header: "Oportunidad" },
];

type DialogState =
	| { kind: "ship" }
	| { kind: "move"; shipment: ImportShipment }
	| { kind: "info"; shipment: ImportShipment }
	| null;

type OrderDetailSheetProps = {
	orderId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function OrderDetailSheet({
	orderId,
	open,
	onOpenChange,
}: OrderDetailSheetProps) {
	const trpc = useTRPC();
	const detail = useQuery({
		...trpc.importOrders.byId.queryOptions({ id: orderId ?? "" }),
		enabled: orderId !== null,
	});
	const order = detail.data;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" size="lg">
				<SheetHeader>
					<SheetTitle>
						{order ? `Orden ${order.number}` : "Orden de compra"}
					</SheetTitle>
					<SheetDescription>Líneas, envíos y días entre etapas.</SheetDescription>
				</SheetHeader>
				{order ? (
					<OrderBody order={order} />
				) : detail.isError ? (
					<p className="px-6 text-muted-foreground">{detail.error.message}</p>
				) : (
					<div className="flex justify-center p-6">
						<Spinner />
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

function OrderBody({ order }: { order: ImportOrderDetail }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [dialog, setDialog] = useState<DialogState>(null);
	const [form, setForm] = useState({ key: 0, open: false });

	const onError = (error: { message: string }) => toast.error(error.message);
	const archive = useMutation(
		trpc.importOrders.archive.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				toast.success("Orden archivada.");
			},
			onError,
		}),
	);
	const restore = useMutation(
		trpc.importOrders.restore.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				toast.success("Orden restaurada.");
			},
			onError,
		}),
	);

	const archived = order.archivedAt !== null;
	const busy = !order.canManage || archive.isPending || restore.isPending;
	const hasPending = order.lines.some((line) => line.remaining > 0);
	const close = () => setDialog(null);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 pb-6">
			<div className="flex flex-col gap-3">
				<MetaRow>
					<span>{order.supplierName}</span>
					<span>{formatDay(order.orderedAt)}</span>
					{archived ? <span>Archivada</span> : null}
				</MetaRow>
				{order.notes ? (
					<p className="text-muted-foreground">{order.notes}</p>
				) : null}
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={busy || archived}
						onClick={() =>
							setForm((current) => ({ key: current.key + 1, open: true }))
						}
					>
						Editar orden
					</Button>
					<Button
						disabled={busy || archived || !hasPending}
						onClick={() => setDialog({ kind: "ship" })}
					>
						Nuevo envío
					</Button>
					{archived ? (
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => restore.mutate({ id: order.id })}
						>
							Restaurar
						</Button>
					) : (
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => archive.mutate({ id: order.id })}
						>
							Archivar
						</Button>
					)}
				</div>
				{order.canManage ? null : (
					<p className="text-13 text-muted-foreground">
						Solo un propietario o un administrador puede cambiar las órdenes.
					</p>
				)}
			</div>

			<PageSection
				title="Líneas"
				description="Enviado y recibido sobre lo pedido. Un envío cancelado no cuenta."
			>
				<SimpleTable columns={LINE_COLUMNS}>
					{order.lines.map((line) => (
						<SimpleTableRow key={line.id}>
							<TableCell>{`${line.sku}, ${line.productName}`}</TableCell>
							<TableCell className={NUMBER}>{line.quantity}</TableCell>
							<TableCell className={NUMBER}>
								{unitsLabel(line.shipped, line.quantity)}
							</TableCell>
							<TableCell className={NUMBER}>
								{unitsLabel(line.received, line.quantity)}
							</TableCell>
							<TableCell>{line.dealName ?? <EmptyCellValue />}</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			</PageSection>

			<PageSection
				title="Envíos"
				description="Cada envío lleva parte de la orden. Los días cuentan desde cada etapa hasta la siguiente."
			>
				{order.shipments.length === 0 ? (
					<p className="text-muted-foreground">Todavía no hay envíos.</p>
				) : (
					<div className="flex flex-col gap-4">
						{order.shipments.map((shipment, index) => (
							<ShipmentBlock
								key={shipment.id}
								shipment={shipment}
								position={index + 1}
								canManage={order.canManage}
								onMove={() => setDialog({ kind: "move", shipment })}
								onEdit={() => setDialog({ kind: "info", shipment })}
							/>
						))}
					</div>
				)}
			</PageSection>

			{dialog?.kind === "ship" ? (
				<NewShipmentDialog order={order} onClose={close} />
			) : null}
			{dialog?.kind === "move" ? (
				<MoveShipmentDialog
					shipment={dialog.shipment}
					stages={order.stages}
					onClose={close}
				/>
			) : null}
			{dialog?.kind === "info" ? (
				<ShipmentInfoDialog shipment={dialog.shipment} onClose={close} />
			) : null}
			<OrderFormSheet
				key={form.key}
				order={order}
				open={form.open}
				onOpenChange={(next) =>
					setForm((current) => ({ ...current, open: next }))
				}
			/>
		</div>
	);
}

function ShipmentBlock({
	shipment,
	position,
	canManage,
	onMove,
	onEdit,
}: {
	shipment: ImportShipment;
	position: number;
	canManage: boolean;
	onMove: () => void;
	onEdit: () => void;
}) {
	const closed = isClosedImportKind(shipment.stage.kind);

	return (
		<section
			aria-label={`Envío ${position}`}
			className="flex flex-col gap-3 rounded-lg p-4 shadow-border"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<StatusIndicator
					tone={STAGE_TONE_STATUS[shipment.stage.tone]}
					label={`Envío ${position}: ${shipment.stage.name}`}
				/>
				<div className="flex gap-1">
					<Button
						variant="ghost"
						size="sm"
						disabled={!canManage}
						onClick={onEdit}
					>
						Datos
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={!canManage || closed}
						onClick={onMove}
					>
						Cambiar etapa
					</Button>
				</div>
			</div>

			<MetaRow>
				<span>
					{shipment.reference
						? `Referencia ${shipment.reference}`
						: "Sin referencia"}
				</span>
				<span>
					{shipment.trackingNumber
						? `Guía ${shipment.trackingNumber}`
						: "Sin guía"}
				</span>
				{shipment.orderToReceivedDays === null ? null : (
					<span>
						{`Recibido a los ${daysLabel(shipment.orderToReceivedDays)} de la orden`}
					</span>
				)}
			</MetaRow>

			<MetaRow>
				{shipment.lines.map((line) => (
					<span key={line.orderLineId}>
						{`${line.sku}: ${line.quantity}`}
					</span>
				))}
			</MetaRow>

			<ol className="flex flex-col gap-1">
				{shipment.events.map((event) => (
					<li
						key={event.id}
						className="flex flex-wrap items-center justify-between gap-2"
					>
						<StatusIndicator
							size="sm"
							tone={STAGE_TONE_STATUS[event.stage.tone]}
							label={event.stage.name}
						/>
						<MetaRow>
							<span>{formatDay(event.occurredAt)}</span>
							{event.days === null ? null : (
								<span className="tabular-nums">
									{event.running
										? `${daysLabel(event.days)} hasta hoy`
										: daysLabel(event.days)}
								</span>
							)}
						</MetaRow>
					</li>
				))}
			</ol>
		</section>
	);
}
```

- [ ] **Step 2: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write 'apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx' && bunx biome check 'apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx'`
Expected: no findings. If biome reports a nested ternary in `OrderDetailSheet`, replace the ternary with three conditional blocks (`{order ? … : null}`, `{!order && detail.isError ? … : null}`, `{!order && !detail.isError ? … : null}`) and run the format again.

Do not commit; the owner approves commits.

---

### Task 6: The page and the table

**Files:**
- Create: `apps/app/app/(app)/[slug]/imports/imports-search-params.ts`
- Create: `apps/app/app/(app)/[slug]/imports/orders-table.tsx`
- Create: `apps/app/app/(app)/[slug]/imports/page.tsx`

- [ ] **Step 1: Search params**

Create `apps/app/app/(app)/[slug]/imports/imports-search-params.ts`:

```ts
import { createListSearchParams } from "@/components/data-table/list-search-params";

export const importsSearchParams = createListSearchParams({
	defaultSort: "orderedAt",
	defaultDir: "desc",
});
```

- [ ] **Step 2: The table**

The sort ids `number`, `supplierName` and `orderedAt` are the keys of `SORTABLE` in `import-orders.service.ts`.

Create `apps/app/app/(app)/[slug]/imports/orders-table.tsx`:

```tsx
"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
} from "@crm/ui/components/data-table";
import { Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { ListEmpty } from "@/components/data-table/list-empty";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	formatDay,
	type ImportOrderRow,
	unitsLabel,
} from "@/lib/import-orders";
import { useTRPC } from "@/lib/trpc/client";
import { importsSearchParams } from "./imports-search-params";
import { OrderDetailSheet } from "./order-detail-sheet";
import { OrderFormSheet } from "./order-form-sheet";

const COLUMNS: DataTableColumn<ImportOrderRow>[] = [
	{
		id: "number",
		header: "Número",
		sortable: true,
		hideable: false,
		width: "36",
		cell: (row) => <span className="font-medium">{row.number}</span>,
	},
	{
		id: "supplierName",
		header: "Proveedor",
		sortable: true,
		hideable: false,
		cell: (row) => <span className="block truncate">{row.supplierName}</span>,
	},
	{
		id: "orderedAt",
		header: "Fecha",
		sortable: true,
		width: "32",
		cell: (row) => (
			<span className="text-muted-foreground">{formatDay(row.orderedAt)}</span>
		),
	},
	{
		id: "shipped",
		header: "Enviado",
		label: "Unidades enviadas",
		align: "right",
		width: "28",
		hideBelow: "md",
		cell: (row) => unitsLabel(row.shippedUnits, row.orderedUnits),
	},
	{
		id: "received",
		header: "Recibido",
		label: "Unidades recibidas",
		align: "right",
		width: "28",
		cell: (row) => unitsLabel(row.receivedUnits, row.orderedUnits),
	},
	{
		id: "shipments",
		header: "Envíos",
		align: "right",
		width: "24",
		hideBelow: "md",
		cell: (row) => row.shipmentCount,
	},
];

export function OrdersTable() {
	const trpc = useTRPC();
	const { query, input, setArchived } = useTableQuery(importsSearchParams);
	const [detail, setDetail] = useState<{ id: string | null; open: boolean }>({
		id: null,
		open: false,
	});
	const [form, setForm] = useState({ key: 0, open: false });

	const orders = useQuery({
		...trpc.importOrders.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const canManage = orders.data?.canManage ?? false;

	return (
		<>
			<DataTable
				label="Órdenes de compra"
				query={query}
				search={<ListSearch placeholder="Buscar por número o proveedor…" />}
				actions={
					<>
						<Button
							variant={input.archived ? "contrast" : "outline"}
							aria-pressed={input.archived}
							onClick={() => setArchived(!input.archived)}
						>
							<ArchiveIcon data-icon="inline-start" />
							Archivadas
						</Button>
						<Button
							disabled={!canManage}
							onClick={() =>
								setForm((current) => ({ key: current.key + 1, open: true }))
							}
						>
							<Icon icon={PlusIcon} data-icon="inline-start" />
							Nueva orden
						</Button>
					</>
				}
				columns={COLUMNS}
				rows={orders.data?.rows ?? []}
				total={orders.data?.total ?? 0}
				facetCounts={orders.data?.facetCounts}
				getRowId={(row) => row.id}
				onRowClick={(row) => setDetail({ id: row.id, open: true })}
				loading={orders.isFetching}
				empty={
					<ListEmpty
						query={query}
						noun="órdenes"
						archived={input.archived}
						blank={{
							title: "Todavía no hay órdenes de compra",
							description:
								"Crea la primera orden para seguir sus envíos por etapa.",
						}}
					/>
				}
			/>
			<OrderFormSheet
				key={form.key}
				order={null}
				open={form.open}
				onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
				onSaved={(saved) => setDetail({ id: saved.id, open: true })}
			/>
			<OrderDetailSheet
				orderId={detail.id}
				open={detail.open}
				onOpenChange={(open) => setDetail((current) => ({ ...current, open }))}
			/>
		</>
	);
}
```

- [ ] **Step 3: The server page**

Create `apps/app/app/(app)/[slug]/imports/page.tsx`:

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
import { IMPORTS_UI } from "@/lib/imports-config";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { importsSearchParams } from "./imports-search-params";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = {
	title: IMPORTS_UI.pageTitle,
};

export default function ImportsPage({
	searchParams,
}: PageProps<"/[slug]/imports">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{IMPORTS_UI.pageTitle}</PageShellTitle>
					<PageShellDescription>
						Las órdenes de compra a proveedores, sus envíos por etapa y los días
						entre etapas.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Orders searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Orders({
	searchParams,
}: Pick<PageProps<"/[slug]/imports">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		importsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.importOrders.list.queryOptions(importsSearchParams.toInput(values)),
	);

	return (
		<HydrateClient>
			<OrdersTable />
		</HydrateClient>
	);
}
```

- [ ] **Step 4: Generate the route types**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun run typegen`
Expected: exit 0. `PageProps<"/[slug]/imports">` now exists. This is not a build.

- [ ] **Step 5: Type check the app**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors. A mismatch in a `@crm/ui` prop (for example `FieldLegend variant`, `SheetContent size`, `SimpleTableColumn`) shows here. Fix it in the call site of this plan and report it. Do not change `packages/ui`.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write 'apps/app/app/(app)/[slug]/imports/imports-search-params.ts' 'apps/app/app/(app)/[slug]/imports/orders-table.tsx' 'apps/app/app/(app)/[slug]/imports/page.tsx' && bunx biome check 'apps/app/app/(app)/[slug]/imports/imports-search-params.ts' 'apps/app/app/(app)/[slug]/imports/orders-table.tsx' 'apps/app/app/(app)/[slug]/imports/page.tsx'`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 7: Nav and command palette

**Files:**
- Modify: `apps/app/components/workspace-nav.tsx`
- Modify: `apps/app/components/crm/quick-switcher.tsx`

- [ ] **Step 1: Check the files are clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Nav icon import**

In `apps/app/components/workspace-nav.tsx`, replace:

```tsx
	PackageIcon,
	SettingsIcon,
	UserPlusIcon,
```

with:

```tsx
	PackageIcon,
	SettingsIcon,
	ShipIcon,
	UserPlusIcon,
```

- [ ] **Step 3: Nav entry**

In the same file, replace:

```tsx
	{ title: "Productos", href: "/products", icon: PackageIcon, match: "prefix" },
```

with:

```tsx
	{ title: "Productos", href: "/products", icon: PackageIcon, match: "prefix" },
	{ title: "Importaciones", href: "/imports", icon: ShipIcon, match: "prefix" },
```

- [ ] **Step 4: Command palette icon import**

In `apps/app/components/crm/quick-switcher.tsx`, replace:

```tsx
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
```

with:

```tsx
	SettingsIcon,
	ShipIcon,
	UsersIcon,
} from "lucide-react";
```

- [ ] **Step 5: Command palette entry**

In the same file, replace:

```tsx
		icon: PackageIcon,
		keywords: ["catálogo", "equipos", "sku"],
	},
```

with:

```tsx
		icon: PackageIcon,
		keywords: ["catálogo", "equipos", "sku"],
	},
	{
		id: "imports",
		label: "Importaciones",
		href: "/imports",
		icon: ShipIcon,
		keywords: [
			"órdenes de compra",
			"envíos",
			"proveedores",
			"aduana",
			"embarque",
		],
	},
```

- [ ] **Step 6: Type check the app**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx && bunx biome check apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 8: `docs/imports.md` and the index row

**Files:**
- Create: `docs/imports.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Write the doc**

Create `docs/imports.md`:

````md
# Imports — read when touching import stages, purchase orders or shipments

The spec is `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`. This page
holds the rules the code depends on.

## Shape

- `PurchaseOrder` has `PurchaseOrderLine`s: a product, a quantity, a unit cost in USD
  (`Decimal(14,2)`, `unitCostCents` on the wire) and an optional deal.
- A `Shipment` carries part of one order. `ShipmentLine` says how many units of each
  order line it carries. One order of 10 can ship as 4, 4 and 2.
- `ShipmentStageEvent` is one stage change with a calendar day. `Shipment.stageKey`
  and `stageChangedAt` always equal the latest event.
- `ImportStage` keys never change. Code reads `kind` (`IN_PROGRESS`, `RECEIVED`,
  `CANCELLED`), never `name`.

## Modules

- `apps/api/src/imports`: the stage list (`importStages`) and `moveShipmentInTx`.
- `apps/api/src/import-orders`: orders, shipments and moves (`importOrders`).
- `packages/db/src/import-stage.ts` and `packages/db/src/import-order.ts`: limits
  (`IMPORT_STAGE`, `IMPORT_ORDER`) and pure rules. The app imports these subpaths.
  They import only generated enums, so a client component may use them.

## Days

- A stage day is `"YYYY-MM-DD"` on the wire and `00:00 UTC` in the database.
- "Today" is the UTC day (`TASKS.day.timeZone`).
- A day is never after today. A move is never before the previous event. A first
  event is never before the order day, and the order day never passes the first event.
- Lead times are computed on read by `withLeadTimes` and `receivedAfterDays`. Nothing
  is stored. The open stage counts until today. A closed stage has no count.

## Quantities

- For each order line, the sum of its shipment lines never passes the ordered
  quantity. `lineProgress` computes shipped, received and remaining.
- A cancelled shipment does not count (`countsTowardOrdered`). Its units can ship again.
- Received is the sum of shipment lines in a `RECEIVED` stage. The screen shows it over
  the ordered quantity ("4 de 10"). A short or extra delivery is not stored. Phase 4
  corrects it with an `ADJUST` movement.
- **Every writer of order lines or shipment lines locks the `purchase_order` row
  `FOR UPDATE` first** (`lockOpenOrder`). Two writers on one order run one after the
  other, and the second reads what the first committed. A new writer must take the
  same lock before it reads a quantity. The two-writers test in
  `apps/api/test/import-orders.integration.spec.ts` fails without it.
- Never call `Promise.all` on the transaction client.

## Lines and deals

- A line with any shipment line keeps its product and cannot be removed. Its quantity
  never goes below what shipped.
- A new or changed deal link needs an active deal in an `OPEN` stage
  (`OPEN_STAGE_FILTER`). A link that exists survives the deal closing.
- A new or changed product needs an active product.

## Archive and permissions

- Archiving an order is a bare `archivedAt` update. An archived order refuses edits
  and new shipments. Its shipments still move.
- Writes need `canManageInventory(role)` (owner and admin). Members read. Every output
  carries `canManage` so the screen disables its controls.

## Screen

- `/imports`: `orders-table.tsx`, `order-detail-sheet.tsx`, `order-form-sheet.tsx`,
  `shipment-dialogs.tsx`. Parsing and labels are in `apps/app/lib/import-orders.ts`.
- Every mutation returns the full order and calls `cache.importOrders()`, which also
  refreshes the stage counts in settings.
````

- [ ] **Step 2: Add the index row**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- AGENTS.md`
Expected: no output. If there is output, stop and ask the owner.

In `AGENTS.md`, replace:

```md
| The tracking script, the collector, form submissions | `docs/tracking.md` |
```

with:

```md
| The tracking script, the collector, form submissions | `docs/tracking.md` |
| Import stages, purchase orders, shipments, lead times | `docs/imports.md` |
```

Do not commit; the owner approves commits.

---

### Task 9: Verification

- [ ] **Step 1: Type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=app && bun run check-types --filter=@crm/db`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run lint && bun run lint:slop`
Expected: no finding in a file of Plan 2a-2 (both parts). A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 3: Run the tests of Phase 2a**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts test/import-stage.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts test/shipment-moves.integration.spec.ts test/import-stages.integration.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts test/import-stage-settings.spec.ts`

Expected: 9 + 4, 25 + 8 + 21, and 10 + 5 tests pass.

- [ ] **Step 4: Run the neighbour tests**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/products.integration.spec.ts test/pipeline-stages.integration.spec.ts`
Expected: all green.

- [ ] **Step 5: Browser checklist for the owner**

Give the owner this list. Do not mark the plan closed without it. Before step 1, the catalog has at least two active products with a reference cost, and the funnel has at least one open deal.

1. Sign in as owner. The sidebar shows *Importaciones* after *Productos*. Open it. The table says *Todavía no hay órdenes de compra*.
2. *Nueva orden*. Submit it empty. The form says *Escribe el número de la orden.* and *Escribe el proveedor.*, and below the lines *Elige el producto de la línea 1.*
3. *Fecha de la orden* shows today's UTC day and does not accept a later day.
4. Number *OC-001*, a supplier, line 1: product A. The cost fills with A's reference cost. Quantity 10. Pick an open deal. *Agregar línea*: product B, quantity 3, a cost. *Crear orden*. A toast says *Orden OC-001 creada.* The order sheet opens. *Líneas* shows A *Enviado 0 de 10*, *Recibido 0 de 10*, and the deal name.
5. *Nueva orden* with number *OC-001* again. A toast says *Ya existe una orden con el número OC-001.*
6. In OC-001, *Nuevo envío*. The dialog lists A (*Pendientes: 10 de 10.*) and B. *Fecha del pedido* shows today. Write 4 for A and *Crear envío*. *Envío 1* shows *Pedido* with today's day and *0 días hasta hoy*. A shows *Enviado 4 de 10*.
7. *Nuevo envío* again with A 4. Then *Nuevo envío* with A 3. The dialog says *SKU-A tiene 2 unidades pendientes.* (the SKU of A) and sends nothing.
8. *Envío 1* → *Cambiar etapa*. The date shows today and does not accept a day before the shipment's last day or after today. Pick *Embarcado* and a past day on or after the *Pedido* day. The events show *Pedido* with the days until *Embarcado*, and *Embarcado* with the days until today.
9. *Envío 1* → *Cambiar etapa* → *Recibido*. *Cambiar etapa* of *Envío 1* is now disabled. The block says *Recibido a los N días de la orden*. A shows *Recibido 4 de 10*. The table row shows *Recibido 4 de 10*.
10. *Envío 2* → *Cambiar etapa* → *Cancelado*. A shows *Enviado 4 de 10* again. *Nuevo envío* accepts 6 for A.
11. *Envío 1* → *Datos*. Write a reference and a tracking number. The block shows *Referencia …* and *Guía …*.
12. *Editar orden*. A's product is disabled and its *Quitar línea* is disabled, with the text about shipped units. Set A's quantity below what shipped and save. A toast names the shipped units. Restore it, remove line B (if B has no shipment) and save. B is gone.
13. *Archivar*. The order leaves the table. *Archivadas* shows it. In its sheet *Editar orden* and *Nuevo envío* are disabled. *Restaurar* brings it back.
14. Search *OC-001* and search the supplier name. The row shows each time.
15. Open the command palette and type *aduana*. *Importaciones* appears.
16. *Configuración* → *Etapas de importación*. The stages show the shipment counts of this order. Create a shipment from *Importaciones*, then archive the stage it is in from settings with a date. The shipment moves to the target stage. In the order sheet its new event has that date.
17. Sign in as a member. *Importaciones* shows the orders. *Nueva orden* is disabled. In the sheet every action is disabled, and the hint says only an owner or an admin can change the orders.
18. Resize to 390 px. The page and the sheet do not scroll sideways.
19. Switch to dark mode. The table, the sheet and the dialogs keep contrast.

The two-writers rule has no browser step. The integration test "lets exactly one of two writers take the last units" covers it.

---

## Self-review

**Coverage of part 2.**

| Requirement | Where |
| --- | --- |
| *Importaciones* screen with orders | Task 6 |
| Order lines with product, quantity, optional open deal | Task 3, `productChoices`, `dealChoices` |
| Received over ordered, "4 de 10" | `unitsLabel`, Task 5 lines table, Task 6 columns |
| Shipment in batches with a date that defaults to today, not in the future | Task 4 `NewShipmentDialog`, `readShipmentQuantities` |
| Move dialog with a date that defaults to today | Task 4 `MoveShipmentDialog` |
| Lead times per stage and order to received | Task 5 `ShipmentBlock` |
| Nav entry, quick switcher entry, cache invalidator | Tasks 7 and 2 |
| `docs/imports.md` and the `AGENTS.md` row | Task 8 |
| Controls disabled for members | `canManage` in Tasks 5 and 6 |
| Browser checklist | Task 9 |

**Placeholder scan.** No step says "similar to", "TODO" or "add the rest". Every code step holds the whole file or the exact old and new text.

**Name consistency.**
- `importOrders.list`, `options`, `byId`, `create`, `update`, `archive`, `restore`, `createShipment`, `updateShipment`, `moveShipment` are the procedures of part 1 Task 4.
- The output fields used here (`shipped`, `received`, `remaining`, `stageChangedAt`, `events[].id`, `days`, `running`, `orderToReceivedDays`, `stages`, `canManage`, `shippedUnits`, `receivedUnits`, `orderedUnits`, `shipmentCount`) are the fields of `importOrderDetailOutput` and `importOrderRowOutput` in part 1 Task 3.
- `moveShipment` takes `occurredAt`, as `shipmentMoveRequest` in part 1.
- `cache.importOrders` is declared and implemented in Task 2 and called in Tasks 3, 4 and 5.
- `utcDay` comes from `apps/app/lib/import-stage-settings.ts` (Plan 2a-1).

**Known risks.**
- The `@crm/ui` props were copied from shipped call sites (`product-sheet.tsx`, `import-stages-settings.tsx`, `products-table.tsx`, `dashboard-summary.tsx`). `FieldSet` and `FieldLegend` have no call site in `apps/app` yet. `check-types` shows any mismatch.
- `formatDay` runs on the server (table cells) and in the browser. Both use `timeZone: "UTC"`. A different ICU version can still format the month name differently and cause a hydration warning.
- The pickers show at most 500 products and 500 deals (part 1 Decision 18).
- `centsFromCost` and `costFromCents` repeat two small private functions of `products/product-sheet.tsx`. Moving the product sheet to the shared ones is a separate change.
- The detail sheet does not keep the open order in the URL. A reload closes it.
