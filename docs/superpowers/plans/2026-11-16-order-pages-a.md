# Order Pages (part 1 of 2: helpers, path and API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure helpers that the order pages need exist and are tested: the route of a process, the path of one shipment, the path of the whole order, the next step, line subtotals, totals and the overall state. `ProcessPath`, a horizontal path of steps, exists in `packages/ui`. `importOrders.options` gives each process its active stages in order.

**Architecture:** The helpers live in `apps/app/lib/import-orders.ts`, beside the parsing and labels that exist. They return plain `PathStep` objects. `ProcessPath` renders those objects and knows nothing of imports. Its screen-reader words live in `packages/ui/src/lib/process-path-config.ts`. The API change is one nested `select` in `ImportOrdersService.options` and one field in `importOrderOptionsOutput`.

**Tech Stack:** bun test, React server render (`react-dom/server`) for the component test, NestJS with `nestjs-trpc`, Zod, Prisma 7.

Spec: `docs/superpowers/specs/2026-11-16-order-pages-design.md`. Part 2: `docs/superpowers/plans/2026-11-16-order-pages-b.md`. Run this part completely first. Part 2 imports every helper and the component of this part.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish. No voseo: "Elige", never "Elegí".
- Do not read `.env`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument and quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** The owner approves commits. No `git add`, no `git mv`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app` and `apps/api`. Before you edit a shared file (`apps/api/src/generated/server.ts`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- A `"use client"` file never imports `@crm/auth` or the `@crm/db` barrel. `@crm/db/enums`, `@crm/db/import-stage` and `@crm/db/import-order` import only generated enums, so they are allowed.
- UI comes from `packages/ui`. Semantic tokens and the scale only. No literal colours, radii or shadows.
- `noUncheckedIndexedAccess` is on. Guard `list[index]`.
- **Integration specs share `crm_test`.** `apps/api/test/import-orders.integration.spec.ts` cleans up in `afterAll`. If a run fails, run it again only after it passes its own cleanup.

## Decisions recorded in this plan

1. **The path leaves out the stage of kind `CANCELLED`.** A cancelled shipment has no current step on its path. Its card names the stage.
2. **A step before the current one with no event shows *Omitida*.** A shipment can skip steps. A plain pending bar before the current step reads as an error.
3. **A shipment that went back shows the steps after its current step as pending.** The date of a step is the day of its last event.
4. **The overall state has four values:** *Recibida* when every ordered unit is received, *En camino* when a shipment is in an `IN_PROGRESS` stage, *Sin envíos* when nothing counts as shipped, otherwise *Pendiente de envío*.
5. **`ProcessPath` wraps and never scrolls sideways.** A scroll region needs a tab stop and a lint override. A wrap needs neither. On a phone the list is vertical.
6. **`ProcessPath` has no motion.** A state change re-renders the bar colour. Reduced motion needs no branch.
7. **`options` returns `key`, `name` and `kind` per stage, not `tone`.** The preview shows every step as pending, so the tone has no use.

## File structure

| File | Responsibility |
| --- | --- |
| `apps/app/lib/import-orders.ts` | `RouteStage`, `StepState`, `PathStep`, `Totals`, `shipmentsLabel`, `shareOf`, `lineSubtotalCents`, `draftTotals`, `orderTotals`, `routeStages`, `routePreview`, `nextStageKey`, `shipmentPath`, `orderPath`, `orderStatusLabel`; `processChoices` gets `stages` |
| `apps/app/test/import-order-pages.spec.ts` | Unit tests of the new helpers |
| `apps/app/test/import-orders.spec.ts` | Two fixtures get `stages: []` |
| `packages/ui/src/lib/process-path-config.ts` | `PROCESS_PATH`, `ProcessPathState` |
| `packages/ui/src/components/process-path.tsx` | `ProcessPath`, `ProcessPathStep` |
| `packages/ui/test/process-path.spec.ts` | Server render test of `ProcessPath` |
| `apps/api/src/import-orders/import-orders.contracts.ts` | `stages` on each process of `importOrderOptionsOutput` |
| `apps/api/src/import-orders/import-orders.service.ts` | `options` selects the active stages |
| `apps/api/test/import-orders.integration.spec.ts` | The `options` test asserts the stages |

---

### Task 1: Pure helpers

**Files:**
- Modify: `apps/app/lib/import-orders.ts`
- Create: `apps/app/test/import-order-pages.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/app/test/import-order-pages.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	blankDraft,
	draftTotals,
	formatDay,
	type ImportOrderLine,
	type ImportShipment,
	type ImportStageOption,
	lineSubtotalCents,
	nextStageKey,
	orderPath,
	orderStatusLabel,
	orderTotals,
	routePreview,
	shareOf,
	shipmentPath,
	shipmentsLabel,
} from "../lib/import-orders";

const STAGES: ImportStageOption[] = [
	{ key: "PEDIDO", name: "Pedido", kind: "IN_PROGRESS", tone: "NEUTRAL" },
	{ key: "DOCS", name: "Documentos", kind: "IN_PROGRESS", tone: "NEUTRAL" },
	{ key: "RECIBIDO", name: "Recibido", kind: "RECEIVED", tone: "SUCCESS" },
	{ key: "CANCELADO", name: "Cancelado", kind: "CANCELLED", tone: "ERROR" },
];

function stageOf(key: string): ImportStageOption {
	const found = STAGES.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

type Visit = {
	key: string;
	day: string;
	days: number | null;
	running: boolean;
};

function shipment(visits: readonly Visit[]): ImportShipment {
	const last = visits.at(-1);
	if (!last) throw new Error("A shipment needs a visit.");
	return {
		id: "s-1",
		reference: null,
		trackingNumber: null,
		stage: stageOf(last.key),
		stageChangedAt: last.day,
		lines: [],
		events: visits.map((visit, index) => ({
			id: `e-${index}`,
			stage: stageOf(visit.key),
			occurredAt: visit.day,
			days: visit.days,
			running: visit.running,
		})),
		orderToReceivedDays: null,
	};
}

function line(
	quantity: number,
	shipped: number,
	received: number,
): ImportOrderLine {
	return {
		id: `l-${quantity}-${shipped}-${received}`,
		productId: "p-1",
		sku: "SKU-1",
		productName: "Equipo",
		quantity,
		unitCostCents: 12_345,
		dealId: null,
		dealName: null,
		shipped,
		received,
		remaining: quantity - shipped,
	};
}

const atDocs = shipment([
	{ key: "PEDIDO", day: "2026-01-10", days: 5, running: false },
	{ key: "DOCS", day: "2026-01-15", days: 3, running: true },
]);

const received = shipment([
	{ key: "PEDIDO", day: "2026-01-10", days: 10, running: false },
	{ key: "RECIBIDO", day: "2026-01-20", days: null, running: false },
]);

const cancelled = shipment([
	{ key: "PEDIDO", day: "2026-01-10", days: 2, running: false },
	{ key: "CANCELADO", day: "2026-01-12", days: null, running: false },
]);

describe("the route of a process", () => {
	it("leaves out the cancelled stage and shows every step as pending", () => {
		expect(routePreview(STAGES)).toEqual([
			{ key: "PEDIDO", label: "Pedido", state: "pending", detail: null },
			{ key: "DOCS", label: "Documentos", state: "pending", detail: null },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});

	it("gives the next step and nothing after the last one", () => {
		expect(nextStageKey(STAGES, "PEDIDO")).toBe("DOCS");
		expect(nextStageKey(STAGES, "DOCS")).toBe("RECIBIDO");
		expect(nextStageKey(STAGES, "RECIBIDO")).toBeNull();
		expect(nextStageKey(STAGES, "CANCELADO")).toBeNull();
		expect(nextStageKey(STAGES, "ARCHIVADA")).toBeNull();
	});
});

describe("the path of a shipment", () => {
	it("dates the done steps and counts the days of the current one", () => {
		expect(shipmentPath(STAGES, atDocs)).toEqual([
			{
				key: "PEDIDO",
				label: "Pedido",
				state: "done",
				detail: formatDay("2026-01-10"),
			},
			{ key: "DOCS", label: "Documentos", state: "current", detail: "3 días" },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});

	it("marks a received shipment done and names a skipped step", () => {
		expect(shipmentPath(STAGES, received)).toEqual([
			{
				key: "PEDIDO",
				label: "Pedido",
				state: "done",
				detail: formatDay("2026-01-10"),
			},
			{ key: "DOCS", label: "Documentos", state: "pending", detail: "Omitida" },
			{
				key: "RECIBIDO",
				label: "Recibido",
				state: "done",
				detail: formatDay("2026-01-20"),
			},
		]);
	});

	it("keeps the steps of a cancelled shipment pending after its last event", () => {
		expect(shipmentPath(STAGES, cancelled)).toEqual([
			{
				key: "PEDIDO",
				label: "Pedido",
				state: "done",
				detail: formatDay("2026-01-10"),
			},
			{ key: "DOCS", label: "Documentos", state: "pending", detail: null },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});

	it("shows the steps after the current one as pending when it went back", () => {
		const back = shipment([
			{ key: "PEDIDO", day: "2026-01-10", days: 2, running: false },
			{ key: "DOCS", day: "2026-01-12", days: 1, running: false },
			{ key: "PEDIDO", day: "2026-01-13", days: 4, running: true },
		]);

		expect(shipmentPath(STAGES, back)).toEqual([
			{ key: "PEDIDO", label: "Pedido", state: "current", detail: "4 días" },
			{ key: "DOCS", label: "Documentos", state: "pending", detail: null },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});
});

describe("the path of an order", () => {
	it("counts the shipments in each step", () => {
		expect(orderPath(STAGES, [atDocs, received, cancelled])).toEqual([
			{ key: "PEDIDO", label: "Pedido", state: "done", detail: null },
			{
				key: "DOCS",
				label: "Documentos",
				state: "current",
				detail: "1 envío",
			},
			{ key: "RECIBIDO", label: "Recibido", state: "done", detail: "1 envío" },
		]);
	});

	it("shows every step pending without shipments", () => {
		expect(orderPath(STAGES, []).map((step) => step.state)).toEqual([
			"pending",
			"pending",
			"pending",
		]);
	});
});

describe("totals", () => {
	it("gives the subtotal of a valid line only", () => {
		expect(
			lineSubtotalCents({ ...blankDraft("a"), quantity: "3", cost: "12.50" }),
		).toBe(3750);
		expect(
			lineSubtotalCents({ ...blankDraft("a"), quantity: "3", cost: "" }),
		).toBeNull();
		expect(
			lineSubtotalCents({ ...blankDraft("a"), quantity: "x", cost: "1" }),
		).toBeNull();
	});

	it("adds the valid lines of a draft and skips the others", () => {
		expect(
			draftTotals([
				{ ...blankDraft("a"), quantity: "3", cost: "12.50" },
				{ ...blankDraft("b"), quantity: "2", cost: "abc" },
				{ ...blankDraft("c"), quantity: "1", cost: "1,5" },
			]),
		).toEqual({ cents: 3900, units: 4 });
		expect(draftTotals([])).toEqual({ cents: 0, units: 0 });
	});

	it("adds the saved lines of an order", () => {
		expect(orderTotals([line(10, 0, 0), line(2, 0, 0)])).toEqual({
			cents: 148_140,
			units: 12,
		});
	});
});

describe("the state of an order", () => {
	it("names the four states", () => {
		expect(orderStatusLabel([line(10, 0, 0)], [])).toBe("Sin envíos");
		expect(orderStatusLabel([line(10, 0, 0)], [cancelled])).toBe(
			"Sin envíos",
		);
		expect(orderStatusLabel([line(10, 4, 0)], [atDocs])).toBe("En camino");
		expect(orderStatusLabel([line(10, 4, 4)], [received])).toBe(
			"Pendiente de envío",
		);
		expect(orderStatusLabel([line(10, 10, 10)], [received])).toBe("Recibida");
	});
});

describe("small labels", () => {
	it("counts shipments and computes a share", () => {
		expect(shipmentsLabel(1)).toBe("1 envío");
		expect(shipmentsLabel(3)).toBe("3 envíos");
		expect(shareOf(4, 10)).toBe(40);
		expect(shareOf(1, 0)).toBe(0);
	});
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-order-pages.spec.ts`
Expected: FAIL with a missing export, for example `Export named 'draftTotals' not found in module`.

- [ ] **Step 3: Add the imports**

In `apps/app/lib/import-orders.ts`, replace:

```ts
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";
```

with:

```ts
import { ImportStageKind } from "@crm/db/enums";
import { isClosedImportKind } from "@crm/db/import-stage";
import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";
```

- [ ] **Step 4: Add the helpers**

In `apps/app/lib/import-orders.ts`, replace:

```ts
export function dealLabel(deal: DealOption): string {
	return deal.companyName === ""
		? deal.name
		: `${deal.name}, ${deal.companyName}`;
}
```

with:

```ts
export function dealLabel(deal: DealOption): string {
	return deal.companyName === ""
		? deal.name
		: `${deal.name}, ${deal.companyName}`;
}

export type RouteStage = { key: string; name: string; kind: ImportStageKind };

export type StepState = "done" | "current" | "pending";

export type PathStep = {
	key: string;
	label: string;
	state: StepState;
	detail: string | null;
};

export type Totals = { cents: number; units: number };

export function shipmentsLabel(count: number): string {
	return count === 1 ? "1 envío" : `${count} envíos`;
}

export function shareOf(part: number, total: number): number {
	return total === 0 ? 0 : (part / total) * 100;
}

export function lineSubtotalCents(draft: LineDraft): number | null {
	const quantity = wholeNumber(draft.quantity);
	const cents = centsFromCost(draft.cost);
	return quantity === null || cents === null ? null : quantity * cents;
}

export function draftTotals(drafts: readonly LineDraft[]): Totals {
	let cents = 0;
	let units = 0;
	for (const draft of drafts) {
		const quantity = wholeNumber(draft.quantity);
		const cost = centsFromCost(draft.cost);
		if (quantity === null || cost === null) continue;
		cents += quantity * cost;
		units += quantity;
	}
	return { cents, units };
}

export function orderTotals(lines: readonly ImportOrderLine[]): Totals {
	return lines.reduce(
		(sum, line) => ({
			cents: sum.cents + line.quantity * line.unitCostCents,
			units: sum.units + line.quantity,
		}),
		{ cents: 0, units: 0 },
	);
}

export function routeStages<Stage extends RouteStage>(
	stages: readonly Stage[],
): Stage[] {
	return stages.filter((stage) => stage.kind !== ImportStageKind.CANCELLED);
}

export function routePreview(stages: readonly RouteStage[]): PathStep[] {
	return routeStages(stages).map(
		(stage): PathStep => ({
			key: stage.key,
			label: stage.name,
			state: "pending",
			detail: null,
		}),
	);
}

export function nextStageKey(
	stages: readonly RouteStage[],
	currentKey: string,
): string | null {
	const route = routeStages(stages);
	const index = route.findIndex((stage) => stage.key === currentKey);
	return index === -1 ? null : (route[index + 1]?.key ?? null);
}

export function shipmentPath(
	stages: readonly RouteStage[],
	shipment: ImportShipment,
): PathStep[] {
	const route = routeStages(stages);
	const currentIndex = route.findIndex(
		(stage) => stage.key === shipment.stage.key,
	);
	const open = !isClosedImportKind(shipment.stage.kind);
	const latest = shipment.events.at(-1);

	return route.map((stage, index): PathStep => {
		const step = { key: stage.key, label: stage.name };
		if (open && index === currentIndex) {
			return {
				...step,
				state: "current",
				detail:
					latest === undefined || latest.days === null
						? null
						: daysLabel(latest.days),
			};
		}
		const reached =
			currentIndex === -1 ||
			index < currentIndex ||
			(!open && index === currentIndex);
		const event = shipment.events.findLast(
			(item) => item.stage.key === stage.key,
		);
		if (reached && event !== undefined) {
			return { ...step, state: "done", detail: formatDay(event.occurredAt) };
		}
		if (reached && currentIndex !== -1) {
			return { ...step, state: "pending", detail: "Omitida" };
		}
		return { ...step, state: "pending", detail: null };
	});
}

export function orderPath(
	stages: readonly RouteStage[],
	shipments: readonly ImportShipment[],
): PathStep[] {
	const route = routeStages(stages);
	const counts = route.map(
		(stage) =>
			shipments.filter((shipment) => shipment.stage.key === stage.key).length,
	);
	const firstOccupied = counts.findIndex((count) => count > 0);

	return route.map((stage, index): PathStep => {
		const count = counts[index] ?? 0;
		const step = {
			key: stage.key,
			label: stage.name,
			detail: count === 0 ? null : shipmentsLabel(count),
		};
		if (count > 0 && stage.kind !== ImportStageKind.RECEIVED) {
			return { ...step, state: "current" };
		}
		if (count > 0 || index < firstOccupied) {
			return { ...step, state: "done" };
		}
		return { ...step, state: "pending" };
	});
}

export function orderStatusLabel(
	lines: readonly ImportOrderLine[],
	shipments: readonly ImportShipment[],
): string {
	const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
	const received = lines.reduce((sum, line) => sum + line.received, 0);
	const shipped = lines.reduce((sum, line) => sum + line.shipped, 0);
	if (ordered > 0 && received >= ordered) return "Recibida";
	if (shipments.some((shipment) => !isClosedImportKind(shipment.stage.kind))) {
		return "En camino";
	}
	if (shipped === 0) return "Sin envíos";
	return "Pendiente de envío";
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-order-pages.spec.ts test/import-orders.spec.ts`
Expected: 13 and 13 tests pass.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/lib/import-orders.ts apps/app/test/import-order-pages.spec.ts && bunx biome check apps/app/lib/import-orders.ts apps/app/test/import-order-pages.spec.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 2: The path component

**Files:**
- Create: `packages/ui/src/lib/process-path-config.ts`
- Create: `packages/ui/src/components/process-path.tsx`
- Create: `packages/ui/test/process-path.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/process-path.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	ProcessPath,
	type ProcessPathStep,
} from "@crm/ui/components/process-path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const STEPS: ProcessPathStep[] = [
	{ key: "a", label: "Pedido", state: "done", detail: "10 ene 2026" },
	{ key: "b", label: "Con DHL", state: "current", detail: "3 días" },
	{ key: "c", label: "Recibido", state: "pending", detail: null },
];

function render(steps: ProcessPathStep[] = STEPS): string {
	return renderToStaticMarkup(
		createElement(ProcessPath, { label: "Recorrido del envío 1", steps }),
	);
}

describe("ProcessPath", () => {
	it("lists the steps in order inside a labelled list", () => {
		const markup = render();

		expect(markup.startsWith("<ol")).toBe(true);
		expect(markup).toContain('aria-label="Recorrido del envío 1"');
		expect(markup.indexOf("Pedido")).toBeLessThan(markup.indexOf("Con DHL"));
		expect(markup.indexOf("Con DHL")).toBeLessThan(markup.indexOf("Recibido"));
	});

	it("marks only the current step", () => {
		const markup = render();
		const current = markup.match(/<li[^>]*aria-current="step"[^>]*>.*?<\/li>/);

		expect(markup.match(/aria-current="step"/g)?.length).toBe(1);
		expect(current?.[0]).toContain("Con DHL");
	});

	it("names each state for screen readers", () => {
		const markup = render();

		expect(markup).toContain('<span class="sr-only">Completada</span>');
		expect(markup).toContain('<span class="sr-only">Etapa actual</span>');
		expect(markup).toContain('<span class="sr-only">Pendiente</span>');
	});

	it("shows a detail only when the step has one", () => {
		const markup = render();

		expect(markup.match(/data-slot="process-path-detail"/g)?.length).toBe(2);
		expect(markup).toContain("3 días");
	});

	it("keeps the state on each step", () => {
		const markup = render();

		expect(markup).toContain('data-state="done"');
		expect(markup).toContain('data-state="current"');
		expect(markup).toContain('data-state="pending"');
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/ui && bun test test/process-path.spec.ts`
Expected: FAIL with `Cannot find module '@crm/ui/components/process-path'`.

- [ ] **Step 3: Write the config**

Create `packages/ui/src/lib/process-path-config.ts`:

```ts
export const PROCESS_PATH = {
	stateLabels: {
		done: "Completada",
		current: "Etapa actual",
		pending: "Pendiente",
	},
} as const;

export type ProcessPathState = keyof typeof PROCESS_PATH.stateLabels;
```

- [ ] **Step 4: Write the component**

Create `packages/ui/src/components/process-path.tsx`:

```tsx
import {
	PROCESS_PATH,
	type ProcessPathState,
} from "@crm/ui/lib/process-path-config";
import { cn } from "@crm/ui/lib/utils";

export type ProcessPathStep = {
	key: string;
	label: string;
	state: ProcessPathState;
	detail: string | null;
};

const BAR_CLASS: Record<ProcessPathState, string> = {
	done: "bg-brand forced-colors:bg-[CanvasText]",
	current: "bg-brand/40 forced-colors:bg-[Highlight]",
	pending: "bg-muted",
};

function ProcessPath({
	steps,
	label,
	className,
}: {
	steps: readonly ProcessPathStep[];
	label: string;
	className?: string;
}) {
	return (
		<ol
			data-slot="process-path"
			aria-label={label}
			className={cn(
				"flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-2",
				className,
			)}
		>
			{steps.map((step) => (
				<li
					key={step.key}
					data-slot="process-path-step"
					data-state={step.state}
					aria-current={step.state === "current" ? "step" : undefined}
					className="flex min-w-0 flex-col gap-1.5 sm:min-w-28 sm:flex-1"
				>
					<span
						aria-hidden="true"
						className={cn(
							"h-1 rounded-sm forced-colors:outline-1 forced-colors:outline-[CanvasText] forced-colors:outline-solid",
							BAR_CLASS[step.state],
						)}
					/>
					<span
						className={cn(
							"text-pretty text-sm",
							step.state === "pending"
								? "text-muted-foreground"
								: "font-medium text-foreground",
						)}
					>
						{step.label}
					</span>
					<span className="sr-only">
						{PROCESS_PATH.stateLabels[step.state]}
					</span>
					{step.detail === null ? null : (
						<span
							data-slot="process-path-detail"
							className="text-13 text-muted-foreground tabular-nums"
						>
							{step.detail}
						</span>
					)}
				</li>
			))}
		</ol>
	);
}

export { ProcessPath };
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/ui && bun test test/process-path.spec.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Check the types match the app helpers**

`PathStep` in `apps/app/lib/import-orders.ts` and `ProcessPathStep` have the same fields: `key`, `label`, `state` (`"done" | "current" | "pending"`) and `detail` (`string | null`). Part 2 passes one to the other. Do not change either shape.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=@crm/ui`
Expected: no errors.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/ui/src/lib/process-path-config.ts packages/ui/src/components/process-path.tsx packages/ui/test/process-path.spec.ts && bunx biome check packages/ui/src/lib/process-path-config.ts packages/ui/src/components/process-path.tsx packages/ui/test/process-path.spec.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 3: The stages of each process in `options`

**Files:**
- Modify: `apps/api/test/import-orders.integration.spec.ts`
- Modify: `apps/api/src/import-orders/import-orders.contracts.ts`
- Modify: `apps/api/src/import-orders/import-orders.service.ts`
- Modify: `apps/app/lib/import-orders.ts`
- Modify: `apps/app/test/import-orders.spec.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/test/import-orders.integration.spec.ts`, replace:

```ts
	it("offers active processes only", async () => {
		await setArchived(closedProcess.id, true);
		try {
			const options = await orders.options();

			expect(options.processes).toContainEqual({
				id: mainProcess.id,
				name: mainProcess.name,
				countryCode: null,
			});
```

with:

```ts
	it("offers active processes only, each with its active stages in order", async () => {
		await setArchived(closedProcess.id, true);
		try {
			const options = await orders.options();

			expect(options.processes).toContainEqual({
				id: mainProcess.id,
				name: mainProcess.name,
				countryCode: null,
				stages: [
					{
						key: mainProcess.entryKey,
						name: "Pedido",
						kind: ImportStageKind.IN_PROGRESS,
					},
					{
						key: mainProcess.receivedKey,
						name: "Recibido",
						kind: ImportStageKind.RECEIVED,
					},
					{
						key: mainProcess.cancelledKey,
						name: "Cancelado",
						kind: ImportStageKind.CANCELLED,
					},
				],
			});
```

`orders.options()` already runs `expectOutput(importOrderOptionsOutput, …)`.

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: 35 pass, 1 fail: "offers active processes only, each with its active stages in order".

- [ ] **Step 3: Add the field to the contract**

In `apps/api/src/import-orders/import-orders.contracts.ts`, replace:

```ts
	processes: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			countryCode: z.enum(ImportCountry).nullable(),
		}),
	),
});
```

with:

```ts
	processes: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			countryCode: z.enum(ImportCountry).nullable(),
			stages: z.array(stageOutput.pick({ key: true, name: true, kind: true })),
		}),
	),
});
```

- [ ] **Step 4: Select the stages**

In `apps/api/src/import-orders/import-orders.service.ts`, replace:

```ts
				select: { id: true, name: true, countryCode: true },
```

with:

```ts
				select: {
					id: true,
					name: true,
					countryCode: true,
					stages: {
						where: { archivedAt: null },
						orderBy: { position: "asc" },
						select: { key: true, name: true, kind: true },
					},
				},
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: 36 tests pass.

- [ ] **Step 6: Regenerate the router**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected: no output. If there is output, stop and ask the owner.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected: no output. The router imports `importOrderOptionsOutput` from the contract, so the new field reaches the app without a change in this file. If there is output, show it to the owner.

- [ ] **Step 7: Give the saved archived process its stages field**

In `apps/app/lib/import-orders.ts`, replace:

```ts
	return [...processes, { id: saved.id, name: saved.name, countryCode: null }];
```

with:

```ts
	return [
		...processes,
		{ id: saved.id, name: saved.name, countryCode: null, stages: [] },
	];
```

The edit page reads `byId().stages` for the saved process, so an empty list here is never shown.

In `apps/app/test/import-orders.spec.ts`, replace:

```ts
	const courier: ProcessOption = {
		id: "p-1",
		name: "Courier",
		countryCode: "AR",
	};
	const sea: ProcessOption = { id: "p-2", name: "Marítimo", countryCode: null };
```

with:

```ts
	const courier: ProcessOption = {
		id: "p-1",
		name: "Courier",
		countryCode: "AR",
		stages: [],
	};
	const sea: ProcessOption = {
		id: "p-2",
		name: "Marítimo",
		countryCode: null,
		stages: [],
	};
```

- [ ] **Step 8: Run the app tests and type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts test/import-order-pages.spec.ts`
Expected: 13 and 13 tests pass.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=app`
Expected: no errors.

- [ ] **Step 9: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/test/import-orders.integration.spec.ts apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts && bunx biome check apps/api/test/import-orders.integration.spec.ts apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

## Self-review (part 1)

| Spec item | Where |
| --- | --- |
| Route preview without *Cancelado* | Task 1 `routePreview`; test "the route of a process" |
| Shipment path: done with date, current with days, pending, *Omitida* | Task 1 `shipmentPath`; four tests |
| Order path with shipment counts | Task 1 `orderPath`; two tests |
| Next step for *Avanzar* | Task 1 `nextStageKey` |
| Subtotal, draft totals, order totals | Task 1; three tests |
| Overall state | Task 1 `orderStatusLabel`; one test with five cases |
| Path component: list, label, `aria-current`, screen-reader words, no motion, wrap | Task 2 |
| `options` gives the stages of each process | Task 3 |

**Placeholder scan.** No step says "similar to" or "TODO". Every code step holds the whole file or the exact old and new text.

**Name consistency.** Part 2 imports `routePreview`, `draftTotals`, `lineSubtotalCents`, `orderTotals`, `orderPath`, `orderStatusLabel`, `shipmentPath`, `nextStageKey`, `shareOf` from `@/lib/import-orders`, and `ProcessPath` from `@crm/ui/components/process-path`.

**Known risks.**
- `Array.prototype.findLast` needs the ES2023 library. `packages/ui/test/evilcharts-engine.spec.tsx` already calls it. If `check-types --filter=app` refuses it, replace it with `[...shipment.events].reverse().find(…)` in `shipmentPath`.
- `routePreview` and `orderPath` trust the order of `stages`. Both API reads sort by `position`.
