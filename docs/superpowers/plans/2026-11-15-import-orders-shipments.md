# Import Orders and Shipments (Phase 2a-2, part 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purchase orders with lines (product, quantity, unit cost in USD, optional open deal), shipments that carry part of an order in batches, the quantity rule under a row lock, the first stage event on shipment creation, the move procedure that calls the shipped `moveShipmentInTx`, and lead times computed on read. Owner and admin write. Members read.

**Architecture:** No migration: `20261114220000_imports` already holds every table and column. One new Nest module `import-orders` with one router `importOrders`, a service and Zod contracts (`docs/api.md`: one router per module, so the stage router stays alone in `imports`). The pure rules (line progress, lead times, the limits) live in `@crm/db/import-order`, next to `@crm/db/import-stage`, so the API and the app read the same code. Every writer of order lines or shipment lines locks the `purchase_order` row `FOR UPDATE` first, in the `$queryRaw` style of `moveShipmentInTx`. A shipment move reuses `moveShipmentInTx` unchanged.

**Tech Stack:** Prisma, NestJS with `nestjs-trpc`, Zod, bun test.

Spec: `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`. Plan 2a-1 (executed): `docs/superpowers/plans/2026-11-14-import-stages.md`.

**This is part 1 of 2.** Part 2 is `docs/superpowers/plans/2026-11-15-import-screen.md`: client helpers, `cache.importOrders`, the *Importaciones* screen, nav and command palette entries, `docs/imports.md`, the `AGENTS.md` row and the browser checklist. Run part 1 completely before part 2. Part 2 reads the router that this part generates.

**Not in Phase 2a-2:** documents and labels (`DocumentLabel`, `Attachment`, Vercel Blob). They are a separate plan. Payments and the real cost are Phase 3. Stock is Phase 4.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server error messages. No voseo: "Escribe", never "Escribí".
- Do not run `migrate dev`, `reset` or `db push`. This plan adds no migration.
- Do not read `.env`. Use `--env-file`.
- Do not build.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`: it exited 0 twice without changing a file.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument. If `biome check` reports only import order, run `bunx biome check --write <paths>`. Never run the repo-wide `bun run format`.
- **Do not commit.** The owner approves commits. No `git add`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app`, `apps/api/src/enrichment`, `apps/agent` and docs. Before you edit a shared file (`app.module.ts`, `generated/server.ts`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- Never call `Promise.all` on a transaction client (`tx`) inside `$transaction`. Reads on the plain `db` may use `Promise.all`.
- `lint:slop` rejects `.catch((x: unknown) => x)`, parameters typed `unknown` or `object`, `Record<string, unknown>` and `...(condition ? {...} : {})`. Use `try/catch`, or `await expect(...).rejects`.
- `noUncheckedIndexedAccess` is on. Guard `rows[0]` and `list[index]`.

## Decisions recorded in this plan

Each line is one decision that the spec and the brief do not make. The owner can veto any of them.

1. **No migration.** `20261114220000_imports` has `purchase_order` (`number` unique, `supplierName`, `orderedAt`, `notes`, `archivedAt`), `purchase_order_line` (`quantity > 0`, `unitCostUsd Decimal(14,2)`, `dealId` `SET NULL`), `shipment` (`reference`, `trackingNumber`, `stageKey`, `stageChangedAt`), `shipment_line` (`quantity > 0`, unique per shipment and order line) and `shipment_stage_event`. Task 1 checks this.
2. **A new module folder `apps/api/src/import-orders`, router alias `importOrders`.** `docs/api.md` says one router per module. The stage router keeps its module.
3. **The limits and the pure rules live in `packages/db/src/import-order.ts` (`IMPORT_ORDER`).** The app reads the same limits for `maxLength`, as `PRODUCT` in `@crm/db/product` does. No `apps/api/src/imports/imports-config.ts`: no value is API-only. Part 2 adds `apps/app/lib/imports-config.ts` for the UI strings.
4. **The order number is typed by the user** (the supplier's purchase order number) and is unique. A duplicate is `Conflict`.
5. **A line needs a unit cost.** `unitCostUsd` is `NOT NULL` in the shipped table. The wire carries `unitCostCents`, an integer, as the product catalog does. The form proposes the product's reference cost.
6. **The order date is a calendar day** (`"YYYY-MM-DD"`, stored at `00:00 UTC`), not after today (UTC). This is the convention of Plan 2a-1 (Decisions 4 and 5).
7. **The first event of a shipment cannot be before the order date.** A later edit of the order date cannot pass the first event of any of its shipments. Without this rule, "order to received" can be negative.
8. **One lock per order.** `createShipment` and `update` lock the `purchase_order` row `FOR UPDATE` before they read any quantity. Two writers on the same order run one after the other. The second one reads the rows that the first one committed (READ COMMITTED takes a new snapshot per statement).
9. **A line with any shipment line cannot be removed and cannot change product.** The database refuses the delete too (`NO ACTION`). Its quantity cannot go below what is shipped.
10. **A link to a deal is checked only when it is new or changed.** A new link needs an active deal whose stage kind is `OPEN` (`OPEN_STAGE_FILTER` from `@crm/db/deal-stage`, the filter the deals list uses). A `PAUSED` deal is not open. A link that exists stays when the deal later closes.
11. **A line needs an active product when the line is new or its product changes.** An existing line keeps an archived product.
12. **An archived order refuses `update` and `createShipment`** with `Conflict`. A shipment of an archived order can still move, as Plan 2a-1 Decision 12 does. `archive` and `restore` are a bare `archivedAt` update (`docs/api.md`).
13. **`createShipment` defaults the date to today (UTC)** when `occurredAt` is missing, as `moveShipment` does. The client always sends a date.
14. **No shipment delete.** A wrong shipment is moved to *Cancelado*. With Open question 2 answered as recommended, its units are free again.
15. **Shipment lines are fixed after creation.** Only `reference` and `trackingNumber` change (`updateShipment`).
16. **Lead times are calendar days between two event days.** For each event: the days until the next event. For the last event of a shipment that is not closed: the days until today, with `running: true`. For the last event of a closed shipment: `null`. "Order to received" is the days from `orderedAt` to the *Recibido* event. Nothing is stored.
17. **Every mutation returns the full order (`importOrderDetailOutput`).** The screen shows the order in a side sheet, and one shape keeps the client simple.
18. **The pickers come from one query, `importOrders.options`**: active products by SKU and open deals by last update, each capped at `IMPORT_ORDER.optionsLimit` (500).
19. **Service methods take `now: Date = new Date()` as their last argument** so that tests fix "today", as `moveShipmentInTx` does.

## Open questions for the owner

The plan implements the recommendation of each question. The change for the other option is named.

1. **What is stored when the received quantity differs from the shipped quantity?** The spec says "received over ordered" and has no received column.
   - Option A (recommended): store nothing new. *Recibido* means every unit of the shipment arrived. The screen shows received over ordered per line ("4 de 10"), where received is the sum of shipment lines in a `RECEIVED` stage. A short or extra delivery is corrected in Phase 4 with an `ADJUST` movement, as spec rule 6 says for mistakes. No migration.
   - Option B: add `receivedQuantity INTEGER NULL` to `shipment_line`, ask for it in the move dialog when the target is *Recibido*, and show it beside the shipped quantity. Needs a migration and an owner `db:deploy` before Task 3.
2. **Does a cancelled shipment count toward the ordered quantity?** Spec rule 7 sums every shipment line.
   - Option A (recommended): no. A cancelled shipment frees its units, so the user can ship them again. One function decides it: `countsTowardOrdered` in `packages/db/src/import-order.ts`.
   - Option B: yes, it counts. A wrong shipment then blocks its units for good, because there is no shipment delete. To pick B, make `countsTowardOrdered` return `true` and change the test "frees the units of a cancelled shipment" to expect `ConflictException`.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/db/src/import-order.ts` | `IMPORT_ORDER` limits, `countsTowardOrdered`, `lineProgress`, `isoDay`, `daysBetween`, `withLeadTimes`, `receivedAfterDays` |
| `packages/db/test/import-order.spec.ts` | Unit test of those functions |
| `packages/db/package.json` | `./import-order` export |
| `apps/api/src/import-orders/import-orders.contracts.ts` | Zod inputs and outputs |
| `apps/api/src/import-orders/import-orders.service.ts` | Order, shipment and move rules, permission, lock |
| `apps/api/test/import-orders.integration.spec.ts` | Service and contract tests, two-writers test |
| `apps/api/src/import-orders/import-orders.router.ts` | tRPC procedures |
| `apps/api/src/import-orders/import-orders.module.ts` | Nest module |
| `apps/api/src/app.module.ts` | Registers the module |
| `apps/api/src/generated/server.ts` | Regenerated |

---

### Task 1: Database check

**Files:** none. This task changes nothing.

- [ ] **Step 1: Check that the shipped migration has every column**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n '"(number|supplierName|orderedAt|notes|archivedAt|unitCostUsd|dealId|reference|trackingNumber|stageKey|stageChangedAt|orderLineId|occurredAt|actorId)" ' packages/db/prisma/migrations/20261114220000_imports/migration.sql`
Expected: lines for every name in the pattern. `purchase_order_number_key`, `shipment_line_shipmentId_orderLineId_key` and the two `CHECK ("quantity" > 0)` constraints are in the same file.

- [ ] **Step 2: Check the Prisma models match**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n "^model (PurchaseOrder|PurchaseOrderLine|Shipment|ShipmentLine|ShipmentStageEvent) " packages/db/prisma/schema.prisma`
Expected: 5 lines. If a model is missing, stop and ask the owner. Do not write a migration.

- [ ] **Step 3: Check the schema is clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- packages/db/prisma/schema.prisma`
Expected: no output. If there is output, stop and ask the owner.

Do not commit; the owner approves commits.

---

### Task 2: Order rules in `@crm/db`

**Files:**
- Create: `packages/db/src/import-order.ts`
- Create: `packages/db/test/import-order.spec.ts`
- Modify: `packages/db/package.json` (exports map)

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/import-order.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { ImportStageKind } from "../src/generated/prisma/enums";
import {
	countsTowardOrdered,
	daysBetween,
	IMPORT_ORDER,
	isoDay,
	lineProgress,
	receivedAfterDays,
	withLeadTimes,
} from "../src/import-order";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const TODAY = day("2026-03-01");

describe("line progress", () => {
	it("counts shipped and received units and what is left", () => {
		expect(
			lineProgress(10, [
				{ quantity: 4, kind: ImportStageKind.RECEIVED },
				{ quantity: 4, kind: ImportStageKind.IN_PROGRESS },
			]),
		).toEqual({ shipped: 8, received: 4, remaining: 2 });
	});

	it("frees the units of a cancelled shipment", () => {
		expect(
			lineProgress(10, [
				{ quantity: 6, kind: ImportStageKind.CANCELLED },
				{ quantity: 3, kind: ImportStageKind.IN_PROGRESS },
			]),
		).toEqual({ shipped: 3, received: 0, remaining: 7 });
		expect(countsTowardOrdered(ImportStageKind.CANCELLED)).toBe(false);
		expect(countsTowardOrdered(ImportStageKind.RECEIVED)).toBe(true);
		expect(countsTowardOrdered(ImportStageKind.IN_PROGRESS)).toBe(true);
	});

	it("leaves the whole line when nothing shipped", () => {
		expect(lineProgress(5, [])).toEqual({
			shipped: 0,
			received: 0,
			remaining: 5,
		});
	});
});

describe("days", () => {
	it("counts calendar days between two UTC days", () => {
		expect(daysBetween(day("2026-01-10"), day("2026-02-01"))).toBe(22);
		expect(daysBetween(day("2026-01-10"), day("2026-01-10"))).toBe(0);
		expect(isoDay(day("2026-03-01"))).toBe("2026-03-01");
	});
});

describe("lead times", () => {
	it("measures each stage until the next one and the open stage until today", () => {
		const steps = withLeadTimes(
			[
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-20") },
			],
			TODAY,
		);

		expect(steps.map(({ days, running }) => ({ days, running }))).toEqual([
			{ days: 10, running: false },
			{ days: 40, running: true },
		]);
	});

	it("stops the clock at a closed stage", () => {
		const steps = withLeadTimes(
			[
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
				{ kind: ImportStageKind.RECEIVED, occurredAt: day("2026-02-01") },
			],
			TODAY,
		);

		expect(steps.map(({ days, running }) => ({ days, running }))).toEqual([
			{ days: 22, running: false },
			{ days: null, running: false },
		]);
	});

	it("keeps the other fields of each step", () => {
		const [first] = withLeadTimes(
			[
				{
					kind: ImportStageKind.IN_PROGRESS,
					occurredAt: day("2026-02-28"),
					stageKey: "ORDERED",
				},
			],
			TODAY,
		);

		expect(first?.stageKey).toBe("ORDERED");
		expect(first?.days).toBe(1);
	});

	it("measures from the order day to the received day", () => {
		expect(
			receivedAfterDays(day("2026-01-05"), [
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
				{ kind: ImportStageKind.RECEIVED, occurredAt: day("2026-02-01") },
			]),
		).toBe(27);
		expect(
			receivedAfterDays(day("2026-01-05"), [
				{ kind: ImportStageKind.IN_PROGRESS, occurredAt: day("2026-01-10") },
			]),
		).toBeNull();
	});
});

describe("IMPORT_ORDER", () => {
	it("keeps every limit positive", () => {
		for (const value of Object.values(IMPORT_ORDER)) {
			expect(value).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts`
Expected: FAIL with `Cannot find module '../src/import-order'`.

- [ ] **Step 3: Write the module**

Create `packages/db/src/import-order.ts`:

```ts
import { ImportStageKind } from "./generated/prisma/enums";
import { isClosedImportKind } from "./import-stage";

const DAY_MS = 86_400_000;

export const IMPORT_ORDER = {
	numberMaxLength: 40,
	supplierNameMaxLength: 120,
	notesMaxLength: 2000,
	referenceMaxLength: 80,
	trackingNumberMaxLength: 80,
	maxLines: 100,
	maxQuantity: 1_000_000,
	optionsLimit: 500,
} as const;

export type ShippedPart = { quantity: number; kind: ImportStageKind };

export type LineProgress = {
	shipped: number;
	received: number;
	remaining: number;
};

export type StageStep = { kind: ImportStageKind; occurredAt: Date };

export type LeadTime = { days: number | null; running: boolean };

export function countsTowardOrdered(kind: ImportStageKind): boolean {
	return kind !== ImportStageKind.CANCELLED;
}

export function lineProgress(
	ordered: number,
	parts: readonly ShippedPart[],
): LineProgress {
	const shipped = parts
		.filter((part) => countsTowardOrdered(part.kind))
		.reduce((sum, part) => sum + part.quantity, 0);
	const received = parts
		.filter((part) => part.kind === ImportStageKind.RECEIVED)
		.reduce((sum, part) => sum + part.quantity, 0);

	return { shipped, received, remaining: ordered - shipped };
}

export function isoDay(value: Date): string {
	return value.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
	return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function withLeadTimes<Step extends StageStep>(
	steps: readonly Step[],
	today: Date,
): Array<Step & LeadTime> {
	return steps.map((step, index) => {
		const next = steps[index + 1];
		if (next) {
			return {
				...step,
				days: daysBetween(step.occurredAt, next.occurredAt),
				running: false,
			};
		}
		if (isClosedImportKind(step.kind)) {
			return { ...step, days: null, running: false };
		}
		return { ...step, days: daysBetween(step.occurredAt, today), running: true };
	});
}

export function receivedAfterDays(
	orderedAt: Date,
	steps: readonly StageStep[],
): number | null {
	const received = steps.find(
		(step) => step.kind === ImportStageKind.RECEIVED,
	);
	return received ? daysBetween(orderedAt, received.occurredAt) : null;
}
```

- [ ] **Step 4: Export it**

In `packages/db/package.json`, in the `exports` map, replace:

```json
		"./import-stage": "./src/import-stage.ts",
```

with:

```json
		"./import-order": "./src/import-order.ts",
		"./import-stage": "./src/import-stage.ts",
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/db/src/import-order.ts packages/db/test/import-order.spec.ts packages/db/package.json && bunx biome check packages/db/src/import-order.ts packages/db/test/import-order.spec.ts packages/db/package.json`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 3: Order contracts and service

**Files:**
- Create: `apps/api/src/import-orders/import-orders.contracts.ts`
- Create: `apps/api/test/import-orders.integration.spec.ts`
- Create: `apps/api/src/import-orders/import-orders.service.ts`

The rules, in the order the service checks them:

`create` and `update`:
1. The user can manage inventory (`canManageInventory`), or `Forbidden`.
2. The order day is not after today (UTC), or `BadRequest`.
3. `update` only: lock the order `FOR UPDATE`. A missing order is `NotFound`. An archived order is `Conflict`.
4. `update` only: every line id belongs to the order and appears once, or `BadRequest`. A line with shipment lines keeps its product and keeps at least its shipped quantity, or `Conflict`. A line with shipment lines that is not in the input is `Conflict`.
5. A new or changed product is active, or `BadRequest`. A new or changed deal is active and `OPEN`, or `BadRequest`.
6. `update` only: the order day is not after the first event of any of its shipments, or `BadRequest`.
7. A duplicate number is `Conflict`.

`createShipment`:
1. Permission, as above.
2. The day is not after today. A missing day is today.
3. Every order line appears once in the shipment, or `BadRequest`.
4. Lock the order `FOR UPDATE`. Missing is `NotFound`, archived is `Conflict`.
5. The day is not before the order day, or `BadRequest`.
6. Every line belongs to the order, or `BadRequest`.
7. For each line, the requested quantity is not more than what is left (`lineProgress(...).remaining`), or `Conflict`.
8. Write the shipment in the entry stage, its lines and its first `ShipmentStageEvent` with the acting user as actor.

`moveShipment` calls `moveShipmentInTx` unchanged, with today when the day is missing.

- [ ] **Step 1: Write the contracts**

Create `apps/api/src/import-orders/import-orders.contracts.ts`:

```ts
import { ImportStageKind, PipelineStageTone } from "@crm/db/enums";
import { IMPORT_ORDER } from "@crm/db/import-order";
import { z } from "zod";
import { taskDueDayInput } from "../activities/task-due-date";
import { MAX_AMOUNT_CENTS } from "../deals/deals.contracts";
import { listInput } from "../trpc/list-input";

const text = (max: number) =>
	z.string().trim().max(max, `Máximo ${max} caracteres.`);

const recordId = z.string().min(1);

const quantity = z
	.number()
	.int("La cantidad debe ser un número entero.")
	.min(1, "La cantidad debe ser mayor que cero.")
	.max(IMPORT_ORDER.maxQuantity, "La cantidad es demasiado grande.");

export const importOrderLineInput = z.object({
	id: recordId.optional(),
	productId: recordId,
	quantity,
	unitCostCents: z
		.number()
		.int("El costo debe tener como máximo dos decimales.")
		.min(0, "El costo no puede ser negativo.")
		.max(MAX_AMOUNT_CENTS, "El costo es demasiado grande."),
	dealId: recordId.nullable(),
});

const orderFields = {
	number: text(IMPORT_ORDER.numberMaxLength).min(
		1,
		"La orden necesita un número.",
	),
	supplierName: text(IMPORT_ORDER.supplierNameMaxLength).min(
		1,
		"La orden necesita un proveedor.",
	),
	orderedAt: taskDueDayInput,
	notes: text(IMPORT_ORDER.notesMaxLength),
	lines: z
		.array(importOrderLineInput)
		.min(1, "La orden necesita al menos una línea.")
		.max(IMPORT_ORDER.maxLines, `Máximo ${IMPORT_ORDER.maxLines} líneas.`),
};

export const importOrderCreateInput = z.object(orderFields);

export const importOrderUpdateInput = z.object({
	id: recordId,
	...orderFields,
});

export const importOrderIdInput = z.object({ id: recordId });

export const importOrderListInput = listInput.extend({
	archived: z.boolean().default(false),
});

const shipmentText = {
	reference: text(IMPORT_ORDER.referenceMaxLength),
	trackingNumber: text(IMPORT_ORDER.trackingNumberMaxLength),
};

export const shipmentCreateInput = z.object({
	orderId: recordId,
	...shipmentText,
	occurredAt: taskDueDayInput.optional(),
	lines: z
		.array(z.object({ orderLineId: recordId, quantity }))
		.min(1, "El envío necesita al menos una línea.")
		.max(IMPORT_ORDER.maxLines, `Máximo ${IMPORT_ORDER.maxLines} líneas.`),
});

export const shipmentUpdateInput = z.object({
	id: recordId,
	...shipmentText,
});

export const shipmentMoveRequest = z.object({
	shipmentId: recordId,
	targetKey: z.string().trim().min(1),
	occurredAt: taskDueDayInput.optional(),
});

const day = z.iso.date();

export const importOrderRowOutput = z.object({
	id: z.string(),
	number: z.string(),
	supplierName: z.string(),
	orderedAt: day,
	lineCount: z.number(),
	orderedUnits: z.number(),
	shippedUnits: z.number(),
	receivedUnits: z.number(),
	shipmentCount: z.number(),
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
});

export const importOrderListOutput = z.object({
	rows: z.array(importOrderRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	canManage: z.boolean(),
});

const stageOutput = z.object({
	key: z.string(),
	name: z.string(),
	kind: z.enum(ImportStageKind),
	tone: z.enum(PipelineStageTone),
});

const orderLineOutput = z.object({
	id: z.string(),
	productId: z.string(),
	sku: z.string(),
	productName: z.string(),
	quantity: z.number(),
	unitCostCents: z.number(),
	dealId: z.string().nullable(),
	dealName: z.string().nullable(),
	shipped: z.number(),
	received: z.number(),
	remaining: z.number(),
});

const shipmentOutput = z.object({
	id: z.string(),
	reference: z.string().nullable(),
	trackingNumber: z.string().nullable(),
	stage: stageOutput,
	stageChangedAt: day,
	lines: z.array(
		z.object({
			orderLineId: z.string(),
			sku: z.string(),
			productName: z.string(),
			quantity: z.number(),
		}),
	),
	events: z.array(
		z.object({
			id: z.string(),
			stage: stageOutput,
			occurredAt: day,
			days: z.number().nullable(),
			running: z.boolean(),
		}),
	),
	orderToReceivedDays: z.number().nullable(),
});

export const importOrderDetailOutput = z.object({
	id: z.string(),
	number: z.string(),
	supplierName: z.string(),
	orderedAt: day,
	notes: z.string().nullable(),
	archivedAt: z.string().nullable(),
	lines: z.array(orderLineOutput),
	shipments: z.array(shipmentOutput),
	stages: z.array(stageOutput),
	canManage: z.boolean(),
});

export const importOrderOptionsOutput = z.object({
	products: z.array(
		z.object({
			id: z.string(),
			sku: z.string(),
			name: z.string(),
			referenceCostCents: z.number().nullable(),
		}),
	),
	deals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			companyName: z.string(),
		}),
	),
});

export type ImportOrderLineInput = z.infer<typeof importOrderLineInput>;
export type ImportOrderCreateInput = z.infer<typeof importOrderCreateInput>;
export type ImportOrderUpdateInput = z.infer<typeof importOrderUpdateInput>;
export type ImportOrderIdInput = z.infer<typeof importOrderIdInput>;
export type ImportOrderListInput = z.infer<typeof importOrderListInput>;
export type ShipmentCreateInput = z.infer<typeof shipmentCreateInput>;
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateInput>;
export type ShipmentMoveRequest = z.infer<typeof shipmentMoveRequest>;
export type ImportOrderRow = z.infer<typeof importOrderRowOutput>;
export type ImportOrderList = z.infer<typeof importOrderListOutput>;
export type ImportOrderDetail = z.infer<typeof importOrderDetailOutput>;
export type ImportOrderOptions = z.infer<typeof importOrderOptionsOutput>;
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/test/import-orders.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { ImportStageKind, PipelineStageKind } from "@crm/db/enums";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import {
	type ImportOrderCreateInput,
	type ImportOrderDetail,
	type ImportOrderListInput,
	type ImportOrderUpdateInput,
	importOrderCreateInput,
	importOrderDetailOutput,
	importOrderListInput,
	importOrderListOutput,
	importOrderOptionsOutput,
	type ShipmentCreateInput,
	type ShipmentMoveRequest,
	type ShipmentUpdateInput,
} from "../src/import-orders/import-orders.contracts";
import { ImportOrdersService } from "../src/import-orders/import-orders.service";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
const adminId = `io-admin-${suffix}`;
const memberId = `io-member-${suffix}`;
const prefix = `IO${suffix}`;
const NOW = new Date("2026-03-01T15:00:00.000Z");
const TODAY = "2026-03-01";
const ORDER_DAY = "2026-01-05";

const service = new ImportOrdersService(db);
const detailOf = (value: ImportOrderDetail) =>
	expectOutput(importOrderDetailOutput, value);
const orders = {
	list: async (userId: string, input: ImportOrderListInput) =>
		expectOutput(importOrderListOutput, await service.list(userId, input)),
	options: async () =>
		expectOutput(importOrderOptionsOutput, await service.options()),
	detail: async (userId: string, id: string) =>
		detailOf(await service.detail(userId, id, NOW)),
	create: async (userId: string, input: ImportOrderCreateInput) =>
		detailOf(await service.create(userId, input, NOW)),
	update: async (userId: string, input: ImportOrderUpdateInput) =>
		detailOf(await service.update(userId, input, NOW)),
	archive: async (userId: string, id: string) =>
		detailOf(await service.archive(userId, id, NOW)),
	restore: async (userId: string, id: string) =>
		detailOf(await service.restore(userId, id, NOW)),
	createShipment: async (userId: string, input: ShipmentCreateInput) =>
		detailOf(await service.createShipment(userId, input, NOW)),
	updateShipment: async (userId: string, input: ShipmentUpdateInput) =>
		detailOf(await service.updateShipment(userId, input, NOW)),
	moveShipment: async (userId: string, input: ShipmentMoveRequest) =>
		detailOf(await service.moveShipment(userId, input, NOW)),
};

let entryKey: string;
let receivedKey: string;
let cancelledKey: string;
let openStageKey: string;
let wonStageKey: string;
let productId: string;
let otherProductId: string;
let archivedProductId: string;
let companyId: string;
let openDealId: string;
let wonDealId: string;
let nextNumber = 0;

type DraftLine = { productId?: string; quantity: number; dealId?: string };

function orderInput(
	lines: DraftLine[],
	overrides: Partial<ImportOrderCreateInput> = {},
): ImportOrderCreateInput {
	nextNumber += 1;
	return {
		number: `${prefix}-${String(nextNumber).padStart(3, "0")}`,
		supplierName: "Proveedor de prueba",
		orderedAt: ORDER_DAY,
		notes: "",
		lines: lines.map((line) => ({
			productId: line.productId ?? productId,
			quantity: line.quantity,
			unitCostCents: 12_345,
			dealId: line.dealId ?? null,
		})),
		...overrides,
	};
}

function orderWith(quantity: number) {
	return orders.create(adminId, orderInput([{ quantity }]));
}

function listFor(q: string, archived = false) {
	return importOrderListInput.parse({ q, archived });
}

function firstLine(order: ImportOrderDetail) {
	const [line] = order.lines;
	if (!line) throw new Error("The order has no line.");
	return line;
}

function lineFor(order: ImportOrderDetail, product: string) {
	const line = order.lines.find((item) => item.productId === product);
	if (!line) throw new Error(`The order has no line for ${product}.`);
	return line;
}

function lastShipment(order: ImportOrderDetail) {
	const shipment = order.shipments.at(-1);
	if (!shipment) throw new Error("The order has no shipment.");
	return shipment;
}

function ship(order: ImportOrderDetail, quantity: number, occurredAt = "2026-01-10") {
	return orders.createShipment(adminId, {
		orderId: order.id,
		reference: "",
		trackingNumber: "",
		occurredAt,
		lines: [{ orderLineId: firstLine(order).id, quantity }],
	});
}

function headerOf(order: ImportOrderDetail) {
	return {
		id: order.id,
		number: order.number,
		supplierName: order.supplierName,
		orderedAt: order.orderedAt,
		notes: "",
	};
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
				name: "Import Order Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Order Member",
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
	const [entry, received, cancelled, openStage, wonStage] = await Promise.all(
		[
			db.importStage.findFirstOrThrow({
				where: { isEntry: true, archivedAt: null },
				select: { key: true },
			}),
			db.importStage.findFirstOrThrow({
				where: { kind: ImportStageKind.RECEIVED, archivedAt: null },
				select: { key: true },
			}),
			db.importStage.findFirstOrThrow({
				where: { kind: ImportStageKind.CANCELLED, archivedAt: null },
				select: { key: true },
			}),
			db.pipelineStage.findFirstOrThrow({
				where: { kind: PipelineStageKind.OPEN, archivedAt: null },
				select: { key: true },
			}),
			db.pipelineStage.findFirstOrThrow({
				where: { kind: PipelineStageKind.WON, archivedAt: null },
				select: { key: true },
			}),
		],
	);
	entryKey = entry.key;
	receivedKey = received.key;
	cancelledKey = cancelled.key;
	openStageKey = openStage.key;
	wonStageKey = wonStage.key;

	const product = async (sku: string, name: string, archivedAt: Date | null) =>
		(
			await db.product.create({
				data: { sku, name, archivedAt },
				select: { id: true },
			})
		).id;
	productId = await product(`${prefix}-A`, "Equipo A", null);
	otherProductId = await product(`${prefix}-B`, "Equipo B", null);
	archivedProductId = await product(
		`${prefix}-Z`,
		"Equipo archivado",
		new Date(),
	);

	companyId = (
		await db.company.create({
			data: { name: `Empresa ${suffix}` },
			select: { id: true },
		})
	).id;
	const deal = async (name: string, stage: string) =>
		(
			await db.deal.create({
				data: { name, companyId, ownerId: adminId, stage },
				select: { id: true },
			})
		).id;
	openDealId = await deal(`Oportunidad abierta ${suffix}`, openStageKey);
	wonDealId = await deal(`Oportunidad ganada ${suffix}`, wonStageKey);
});

afterAll(async () => {
	await db.shipment.deleteMany({
		where: { order: { number: { startsWith: prefix } } },
	});
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("creating an order", () => {
	it("creates the order with its lines and nothing shipped", async () => {
		const order = await orders.create(
			adminId,
			orderInput([
				{ quantity: 10, dealId: openDealId },
				{ productId: otherProductId, quantity: 3 },
			]),
		);

		expect(order.orderedAt).toBe(ORDER_DAY);
		expect(order.shipments).toEqual([]);
		expect(order.canManage).toBe(true);
		expect(lineFor(order, productId)).toMatchObject({
			sku: `${prefix}-A`,
			productName: "Equipo A",
			quantity: 10,
			unitCostCents: 12_345,
			dealId: openDealId,
			dealName: `Oportunidad abierta ${suffix}`,
			shipped: 0,
			received: 0,
			remaining: 10,
		});
		expect(lineFor(order, otherProductId)).toMatchObject({
			quantity: 3,
			dealId: null,
			remaining: 3,
		});
	});

	it("refuses a number that exists", async () => {
		const order = await orderWith(1);

		await expect(
			orders.create(
				adminId,
				orderInput([{ quantity: 1 }], { number: order.number }),
			),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses an order day after today", async () => {
		await expect(
			orders.create(
				adminId,
				orderInput([{ quantity: 1 }], { orderedAt: "2026-03-02" }),
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived product and a deal that is not open", async () => {
		await expect(
			orders.create(
				adminId,
				orderInput([{ productId: archivedProductId, quantity: 1 }]),
			),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			orders.create(adminId, orderInput([{ quantity: 1, dealId: wonDealId }])),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("validates the order at the boundary", () => {
		const valid = orderInput([{ quantity: 1 }]);
		const [line] = valid.lines;
		if (!line) throw new Error("No line.");

		expect(importOrderCreateInput.safeParse(valid).success).toBe(true);
		expect(
			importOrderCreateInput.safeParse({ ...valid, lines: [] }).success,
		).toBe(false);
		expect(
			importOrderCreateInput.safeParse({ ...valid, number: "  " }).success,
		).toBe(false);
		expect(
			importOrderCreateInput.safeParse({ ...valid, orderedAt: "2026-13-01" })
				.success,
		).toBe(false);
		for (const bad of [
			{ quantity: 0 },
			{ quantity: 1.5 },
			{ unitCostCents: -1 },
			{ unitCostCents: 1.5 },
		]) {
			expect(
				importOrderCreateInput.safeParse({
					...valid,
					lines: [{ ...line, ...bad }],
				}).success,
			).toBe(false);
		}
	});
});

describe("listing orders", () => {
	it("lists ordered, shipped and received units and hides archived orders", async () => {
		const order = await orderWith(10);
		const first = lastShipment(await ship(order, 4));
		await orders.moveShipment(adminId, {
			shipmentId: first.id,
			targetKey: receivedKey,
			occurredAt: "2026-02-01",
		});
		await ship(order, 3, "2026-02-02");

		const active = await orders.list(adminId, listFor(order.number));
		expect(active.total).toBe(1);
		expect(active.rows).toEqual([
			expect.objectContaining({
				id: order.id,
				orderedAt: ORDER_DAY,
				lineCount: 1,
				orderedUnits: 10,
				shippedUnits: 7,
				receivedUnits: 4,
				shipmentCount: 2,
				archivedAt: null,
			}),
		]);

		await orders.archive(adminId, order.id);
		expect((await orders.list(adminId, listFor(order.number))).total).toBe(0);
		expect(
			(await orders.list(adminId, listFor(order.number, true))).rows.map(
				(row) => row.id,
			),
		).toEqual([order.id]);
	});
});

describe("creating a shipment", () => {
	it("writes the first event in the entry stage on the chosen day", async () => {
		const order = await orderWith(10);

		const after = await ship(order, 4, "2026-01-12");

		const shipment = lastShipment(after);
		expect(shipment.stage.key).toBe(entryKey);
		expect(shipment.stageChangedAt).toBe("2026-01-12");
		expect(
			shipment.events.map((event) => [event.stage.key, event.occurredAt]),
		).toEqual([[entryKey, "2026-01-12"]]);
		expect(shipment.lines).toEqual([
			{
				orderLineId: firstLine(order).id,
				sku: `${prefix}-A`,
				productName: "Equipo A",
				quantity: 4,
			},
		]);
		expect(firstLine(after)).toMatchObject({ shipped: 4, remaining: 6 });
		const event = await db.shipmentStageEvent.findFirstOrThrow({
			where: { shipmentId: shipment.id },
			select: { actorId: true },
		});
		expect(event.actorId).toBe(adminId);
	});

	it("dates the first event today when no day is given", async () => {
		const order = await orderWith(1);

		const after = await orders.createShipment(adminId, {
			orderId: order.id,
			reference: "",
			trackingNumber: "",
			lines: [{ orderLineId: firstLine(order).id, quantity: 1 }],
		});

		const shipment = lastShipment(after);
		expect(shipment.stageChangedAt).toBe(TODAY);
		expect(shipment.events.map((event) => [event.days, event.running])).toEqual(
			[[0, true]],
		);
	});

	it("ships in batches and refuses more than what is left", async () => {
		const order = await orderWith(10);
		await ship(order, 4);
		await ship(order, 4);

		const third = await ship(order, 2);

		expect(firstLine(third)).toMatchObject({ shipped: 10, remaining: 0 });
		await expect(ship(order, 1)).rejects.toBeInstanceOf(ConflictException);
		await expect(ship(order, 1)).rejects.toMatchObject({
			message: expect.stringContaining("0 unidades pendientes"),
		});
	});

	it("refuses a day before the order, a day after today and an archived order", async () => {
		const order = await orderWith(2);

		await expect(ship(order, 1, "2026-01-04")).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await expect(ship(order, 1, "2026-03-02")).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await orders.archive(adminId, order.id);
		await expect(ship(order, 1)).rejects.toBeInstanceOf(ConflictException);
		expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
	});

	it("refuses a line of another order and a repeated line", async () => {
		const order = await orderWith(5);
		const other = await orderWith(5);

		await expect(
			orders.createShipment(adminId, {
				orderId: order.id,
				reference: "",
				trackingNumber: "",
				lines: [{ orderLineId: firstLine(other).id, quantity: 1 }],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			orders.createShipment(adminId, {
				orderId: order.id,
				reference: "",
				trackingNumber: "",
				lines: [
					{ orderLineId: firstLine(order).id, quantity: 1 },
					{ orderLineId: firstLine(order).id, quantity: 1 },
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("lets exactly one of two writers take the last units", async () => {
		const order = await orderWith(10);
		const line = firstLine(order);
		const request = (reference: string): ShipmentCreateInput => ({
			orderId: order.id,
			reference,
			trackingNumber: "",
			occurredAt: "2026-01-10",
			lines: [{ orderLineId: line.id, quantity: 6 }],
		});

		const results = await Promise.allSettled([
			service.createShipment(adminId, request("A"), NOW),
			service.createShipment(adminId, request("B"), NOW),
		]);

		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const reasons = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		expect(fulfilled.length).toBe(1);
		expect(reasons.length).toBe(1);
		expect(reasons[0]).toBeInstanceOf(ConflictException);
		const shipped = await db.shipmentLine.aggregate({
			where: { orderLineId: line.id },
			_sum: { quantity: true },
		});
		expect(shipped._sum.quantity).toBe(6);
	});

	it("frees the units of a cancelled shipment", async () => {
		const order = await orderWith(10);
		const wrong = lastShipment(await ship(order, 10));
		await orders.moveShipment(adminId, {
			shipmentId: wrong.id,
			targetKey: cancelledKey,
			occurredAt: "2026-01-11",
		});

		const again = await ship(order, 10, "2026-01-12");

		expect(firstLine(again)).toMatchObject({
			shipped: 10,
			received: 0,
			remaining: 0,
		});
		expect(again.shipments.length).toBe(2);
	});
});

describe("moving a shipment", () => {
	it("moves on the chosen day and measures each stage", async () => {
		const order = await orderWith(5);
		const shipment = lastShipment(await ship(order, 5, "2026-01-10"));

		const moved = await orders.moveShipment(adminId, {
			shipmentId: shipment.id,
			targetKey: receivedKey,
			occurredAt: "2026-02-01",
		});

		const after = lastShipment(moved);
		expect(after.stage.kind).toBe(ImportStageKind.RECEIVED);
		expect(
			after.events.map((event) => [
				event.stage.key,
				event.occurredAt,
				event.days,
				event.running,
			]),
		).toEqual([
			[entryKey, "2026-01-10", 22, false],
			[receivedKey, "2026-02-01", null, false],
		]);
		expect(after.orderToReceivedDays).toBe(27);
		expect(firstLine(moved)).toMatchObject({ shipped: 5, received: 5 });
	});

	it("counts the open stage until today", async () => {
		const order = await orderWith(1);

		const shipment = lastShipment(await ship(order, 1, "2026-02-20"));

		expect(
			shipment.events.map((event) => [
				event.stage.key,
				event.occurredAt,
				event.days,
				event.running,
			]),
		).toEqual([[entryKey, "2026-02-20", 9, true]]);
		expect(shipment.orderToReceivedDays).toBeNull();
	});

	it("moves on today when no day is given and refuses a move after reception", async () => {
		const order = await orderWith(1);
		const shipment = lastShipment(await ship(order, 1));

		const moved = await orders.moveShipment(adminId, {
			shipmentId: shipment.id,
			targetKey: receivedKey,
		});

		expect(lastShipment(moved).stageChangedAt).toBe(TODAY);
		await expect(
			orders.moveShipment(adminId, {
				shipmentId: shipment.id,
				targetKey: cancelledKey,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("reports a missing shipment as not found", async () => {
		await expect(
			orders.moveShipment(adminId, {
				shipmentId: `no-such-shipment-${suffix}`,
				targetKey: receivedKey,
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});

describe("editing an order", () => {
	it("changes the header and replaces the lines that have no shipments", async () => {
		const order = await orders.create(
			adminId,
			orderInput([
				{ quantity: 4 },
				{ productId: otherProductId, quantity: 2 },
			]),
		);
		const kept = lineFor(order, productId);
		const dropped = lineFor(order, otherProductId);

		const updated = await orders.update(adminId, {
			...headerOf(order),
			supplierName: "Otro proveedor",
			orderedAt: "2026-01-06",
			notes: "Urgente",
			lines: [
				{
					id: kept.id,
					productId,
					quantity: 6,
					unitCostCents: 500,
					dealId: openDealId,
				},
				{
					productId: otherProductId,
					quantity: 1,
					unitCostCents: 0,
					dealId: null,
				},
			],
		});

		expect(updated).toMatchObject({
			supplierName: "Otro proveedor",
			orderedAt: "2026-01-06",
			notes: "Urgente",
		});
		expect(updated.lines.length).toBe(2);
		expect(lineFor(updated, productId)).toMatchObject({
			id: kept.id,
			quantity: 6,
			unitCostCents: 500,
			dealId: openDealId,
		});
		expect(lineFor(updated, otherProductId).quantity).toBe(1);
		expect(lineFor(updated, otherProductId).id).not.toBe(dropped.id);
	});

	it("refuses to lower a line below what shipped, change its product or remove it", async () => {
		const order = await orders.create(
			adminId,
			orderInput([
				{ quantity: 10 },
				{ productId: otherProductId, quantity: 2 },
			]),
		);
		const sent = lineFor(order, productId);
		const spare = lineFor(order, otherProductId);
		await orders.createShipment(adminId, {
			orderId: order.id,
			reference: "",
			trackingNumber: "",
			occurredAt: "2026-01-10",
			lines: [{ orderLineId: sent.id, quantity: 6 }],
		});
		const edit = (lines: ImportOrderUpdateInput["lines"]) =>
			orders.update(adminId, { ...headerOf(order), lines });
		const keepSpare = {
			id: spare.id,
			productId: otherProductId,
			quantity: 2,
			unitCostCents: 100,
			dealId: null,
		};

		await expect(
			edit([
				{ id: sent.id, productId, quantity: 5, unitCostCents: 100, dealId: null },
				keepSpare,
			]),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			edit([
				{
					id: sent.id,
					productId: otherProductId,
					quantity: 10,
					unitCostCents: 100,
					dealId: null,
				},
				keepSpare,
			]),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(edit([keepSpare])).rejects.toBeInstanceOf(ConflictException);

		const updated = await edit([
			{ id: sent.id, productId, quantity: 6, unitCostCents: 100, dealId: null },
		]);

		expect(
			updated.lines.map((line) => [line.id, line.quantity, line.remaining]),
		).toEqual([[sent.id, 6, 0]]);
	});

	it("refuses an order day after the first shipment", async () => {
		const order = await orderWith(3);
		await ship(order, 1, "2026-01-10");

		await expect(
			orders.update(adminId, {
				...headerOf(order),
				orderedAt: "2026-01-11",
				lines: [
					{
						id: firstLine(order).id,
						productId,
						quantity: 3,
						unitCostCents: 12_345,
						dealId: null,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("keeps a deal that closed after it was linked", async () => {
		const closing = await db.deal.create({
			data: {
				name: `Se cierra ${suffix}`,
				companyId,
				ownerId: adminId,
				stage: openStageKey,
			},
			select: { id: true },
		});
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 2, dealId: closing.id }]),
		);
		await db.deal.update({
			where: { id: closing.id },
			data: { stage: wonStageKey },
		});
		const line = firstLine(order);

		const kept = await orders.update(adminId, {
			...headerOf(order),
			lines: [
				{
					id: line.id,
					productId,
					quantity: 3,
					unitCostCents: 100,
					dealId: closing.id,
				},
			],
		});

		expect(firstLine(kept).dealId).toBe(closing.id);
		await expect(
			orders.update(adminId, {
				...headerOf(order),
				lines: [
					{
						id: line.id,
						productId,
						quantity: 3,
						unitCostCents: 100,
						dealId: wonDealId,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses to change an archived order and restores it", async () => {
		const order = await orderWith(1);
		const change = {
			...headerOf(order),
			supplierName: "Cambio",
			lines: [
				{
					id: firstLine(order).id,
					productId,
					quantity: 1,
					unitCostCents: 100,
					dealId: null,
				},
			],
		};

		const archived = await orders.archive(adminId, order.id);

		expect(archived.archivedAt).not.toBeNull();
		await expect(orders.update(adminId, change)).rejects.toBeInstanceOf(
			ConflictException,
		);
		const restored = await orders.restore(adminId, order.id);
		expect(restored.archivedAt).toBeNull();
		expect((await orders.update(adminId, change)).supplierName).toBe("Cambio");
	});
});

describe("shipment details", () => {
	it("saves the reference and the tracking number", async () => {
		const order = await orderWith(1);
		const shipment = lastShipment(await ship(order, 1));

		const saved = await orders.updateShipment(adminId, {
			id: shipment.id,
			reference: "BL-1",
			trackingNumber: " TRK-9 ",
		});

		expect(lastShipment(saved)).toMatchObject({
			reference: "BL-1",
			trackingNumber: "TRK-9",
		});
		const cleared = await orders.updateShipment(adminId, {
			id: shipment.id,
			reference: "",
			trackingNumber: "",
		});
		expect(lastShipment(cleared)).toMatchObject({
			reference: null,
			trackingNumber: null,
		});
	});
});

describe("picker options", () => {
	it("offers active products and open deals only", async () => {
		const options = await orders.options();

		const products = options.products.map((product) => product.id);
		expect(products).toContain(productId);
		expect(products).not.toContain(archivedProductId);
		expect(options.deals).toContainEqual({
			id: openDealId,
			name: `Oportunidad abierta ${suffix}`,
			companyName: `Empresa ${suffix}`,
		});
		expect(options.deals.map((deal) => deal.id)).not.toContain(wonDealId);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const order = await orderWith(2);
		const shipment = lastShipment(await ship(order, 1));

		expect((await orders.detail(memberId, order.id)).canManage).toBe(false);
		expect(
			(await orders.list(memberId, listFor(order.number))).canManage,
		).toBe(false);
		const writes = [
			() => service.create(memberId, orderInput([{ quantity: 1 }]), NOW),
			() =>
				service.update(
					memberId,
					{
						...headerOf(order),
						lines: [
							{
								id: firstLine(order).id,
								productId,
								quantity: 2,
								unitCostCents: 100,
								dealId: null,
							},
						],
					},
					NOW,
				),
			() => service.archive(memberId, order.id, NOW),
			() => service.restore(memberId, order.id, NOW),
			() =>
				service.createShipment(
					memberId,
					{
						orderId: order.id,
						reference: "",
						trackingNumber: "",
						lines: [{ orderLineId: firstLine(order).id, quantity: 1 }],
					},
					NOW,
				),
			() =>
				service.updateShipment(
					memberId,
					{ id: shipment.id, reference: "X", trackingNumber: "" },
					NOW,
				),
			() =>
				service.moveShipment(
					memberId,
					{ shipmentId: shipment.id, targetKey: receivedKey },
					NOW,
				),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: FAIL with `Cannot find module '../src/import-orders/import-orders.service'`.

- [ ] **Step 4: Write the service**

Create `apps/api/src/import-orders/import-orders.service.ts`:

```ts
import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { Prisma } from "@crm/db";
import { OPEN_STAGE_FILTER } from "@crm/db/deal-stage";
import {
	IMPORT_ORDER,
	isoDay,
	lineProgress,
	receivedAfterDays,
	type ShippedPart,
	withLeadTimes,
} from "@crm/db/import-order";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { taskDayBoundaries, taskDueDay } from "../activities/task-due-date";
import { blankToNull, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { moveShipmentInTx } from "../imports/shipment-moves";
import {
	archivedFilter,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ImportOrderCreateInput,
	ImportOrderDetail,
	ImportOrderLineInput,
	ImportOrderList,
	ImportOrderListInput,
	ImportOrderOptions,
	ImportOrderRow,
	ImportOrderUpdateInput,
	ShipmentCreateInput,
	ShipmentMoveRequest,
	ShipmentUpdateInput,
} from "./import-orders.contracts";

const SORTABLE: OrderByColumns<Prisma.PurchaseOrderOrderByWithRelationInput> =
	{
		number: (dir) => ({ number: dir }),
		supplierName: (dir) => ({ supplierName: dir }),
		orderedAt: (dir) => ({ orderedAt: dir }),
		createdAt: (dir) => ({ createdAt: dir }),
		archivedAt: (dir) => ({ archivedAt: { sort: dir, nulls: "last" } }),
	};

const STAGE_SELECT = {
	key: true,
	name: true,
	kind: true,
	tone: true,
} satisfies Prisma.ImportStageSelect;

const SHIPPED_SELECT = {
	quantity: true,
	shipment: { select: { stage: { select: { kind: true } } } },
} satisfies Prisma.ShipmentLineSelect;

const LIST_SELECT = {
	id: true,
	number: true,
	supplierName: true,
	orderedAt: true,
	archivedAt: true,
	createdAt: true,
	lines: {
		select: { quantity: true, shipmentLines: { select: SHIPPED_SELECT } },
	},
	_count: { select: { shipments: true } },
} satisfies Prisma.PurchaseOrderSelect;

const DETAIL_SELECT = {
	id: true,
	number: true,
	supplierName: true,
	orderedAt: true,
	notes: true,
	archivedAt: true,
	lines: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: {
			id: true,
			productId: true,
			quantity: true,
			unitCostUsd: true,
			dealId: true,
			product: { select: { sku: true, name: true } },
			deal: { select: { name: true } },
			shipmentLines: { select: SHIPPED_SELECT },
		},
	},
	shipments: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: {
			id: true,
			reference: true,
			trackingNumber: true,
			stageChangedAt: true,
			stage: { select: STAGE_SELECT },
			lines: {
				orderBy: { createdAt: "asc" },
				select: {
					orderLineId: true,
					quantity: true,
					orderLine: {
						select: { product: { select: { sku: true, name: true } } },
					},
				},
			},
			events: {
				orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
				select: {
					id: true,
					occurredAt: true,
					stage: { select: STAGE_SELECT },
				},
			},
		},
	},
} satisfies Prisma.PurchaseOrderSelect;

type ShippedRecord = Prisma.ShipmentLineGetPayload<{
	select: typeof SHIPPED_SELECT;
}>;

type ListRecord = Prisma.PurchaseOrderGetPayload<{
	select: typeof LIST_SELECT;
}>;

type LockedOrder = { id: string; orderedAt: Date; archivedAt: Date | null };

function partsOf(rows: readonly ShippedRecord[]): ShippedPart[] {
	return rows.map((row) => ({
		quantity: row.quantity,
		kind: row.shipment.stage.kind,
	}));
}

function toListRow(record: ListRecord): ImportOrderRow {
	const totals = record.lines.reduce(
		(sum, line) => {
			const progress = lineProgress(line.quantity, partsOf(line.shipmentLines));
			return {
				ordered: sum.ordered + line.quantity,
				shipped: sum.shipped + progress.shipped,
				received: sum.received + progress.received,
			};
		},
		{ ordered: 0, shipped: 0, received: 0 },
	);

	return {
		id: record.id,
		number: record.number,
		supplierName: record.supplierName,
		orderedAt: isoDay(record.orderedAt),
		lineCount: record.lines.length,
		orderedUnits: totals.ordered,
		shippedUnits: totals.shipped,
		receivedUnits: totals.received,
		shipmentCount: record._count.shipments,
		archivedAt: record.archivedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
	};
}

function lineData(line: ImportOrderLineInput) {
	return {
		productId: line.productId,
		quantity: line.quantity,
		unitCostUsd: new Prisma.Decimal(line.unitCostCents).dividedBy(100),
		dealId: line.dealId,
	};
}

@Injectable()
export class ImportOrdersService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		actingUserId: string,
		input: ImportOrderListInput,
	): Promise<ImportOrderList> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [records, total, role] = await Promise.all([
			this.db.purchaseOrder.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, { orderedAt: "desc" }),
				select: LIST_SELECT,
			}),
			this.db.purchaseOrder.count({ where }),
			workspaceRoleOf(actingUserId),
		]);

		return {
			rows: records.map(toListRow),
			total,
			facetCounts: {},
			canManage: canManageInventory(role),
		};
	}

	async options(): Promise<ImportOrderOptions> {
		const [products, deals] = await Promise.all([
			this.db.product.findMany({
				where: { archivedAt: null },
				orderBy: { sku: "asc" },
				take: IMPORT_ORDER.optionsLimit,
				select: { id: true, sku: true, name: true, referenceCostUsd: true },
			}),
			this.db.deal.findMany({
				where: { AND: [{ archivedAt: null }, OPEN_STAGE_FILTER] },
				orderBy: { updatedAt: "desc" },
				take: IMPORT_ORDER.optionsLimit,
				select: { id: true, name: true, company: { select: { name: true } } },
			}),
		]);

		return {
			products: products.map((product) => ({
				id: product.id,
				sku: product.sku,
				name: product.name,
				referenceCostCents: toCents(product.referenceCostUsd),
			})),
			deals: deals.map((deal) => ({
				id: deal.id,
				name: deal.name,
				companyName: deal.company.name,
			})),
		};
	}

	async detail(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		const [order, stages, role] = await Promise.all([
			this.db.purchaseOrder.findUnique({
				where: { id },
				select: DETAIL_SELECT,
			}),
			this.db.importStage.findMany({
				where: { archivedAt: null },
				orderBy: { position: "asc" },
				select: STAGE_SELECT,
			}),
			workspaceRoleOf(actingUserId),
		]);
		if (!order) {
			throw new NotFoundException("No existe una orden con ese id.");
		}
		const { startOfToday } = taskDayBoundaries(now);

		return {
			id: order.id,
			number: order.number,
			supplierName: order.supplierName,
			orderedAt: isoDay(order.orderedAt),
			notes: order.notes,
			archivedAt: order.archivedAt?.toISOString() ?? null,
			lines: order.lines.map((line) => {
				const progress = lineProgress(
					line.quantity,
					partsOf(line.shipmentLines),
				);
				return {
					id: line.id,
					productId: line.productId,
					sku: line.product.sku,
					productName: line.product.name,
					quantity: line.quantity,
					unitCostCents: line.unitCostUsd.times(100).toNumber(),
					dealId: line.dealId,
					dealName: line.deal?.name ?? null,
					shipped: progress.shipped,
					received: progress.received,
					remaining: progress.remaining,
				};
			}),
			shipments: order.shipments.map((shipment) => {
				const steps = shipment.events.map((event) => ({
					id: event.id,
					stage: event.stage,
					kind: event.stage.kind,
					occurredAt: event.occurredAt,
				}));
				return {
					id: shipment.id,
					reference: shipment.reference,
					trackingNumber: shipment.trackingNumber,
					stage: shipment.stage,
					stageChangedAt: isoDay(shipment.stageChangedAt),
					lines: shipment.lines.map((line) => ({
						orderLineId: line.orderLineId,
						sku: line.orderLine.product.sku,
						productName: line.orderLine.product.name,
						quantity: line.quantity,
					})),
					events: withLeadTimes(steps, startOfToday).map((step) => ({
						id: step.id,
						stage: step.stage,
						occurredAt: isoDay(step.occurredAt),
						days: step.days,
						running: step.running,
					})),
					orderToReceivedDays: receivedAfterDays(order.orderedAt, steps),
				};
			}),
			stages,
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ImportOrderCreateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const orderedAt = this.pastDay(input.orderedAt, now);

		const id = await this.withNumber(input.number, () =>
			this.db.$transaction(async (tx) => {
				await this.assertReferences(
					tx,
					input.lines.map((line) => line.productId),
					input.lines.flatMap((line) =>
						line.dealId === null ? [] : [line.dealId],
					),
				);
				const created = await tx.purchaseOrder.create({
					data: {
						number: input.number,
						supplierName: input.supplierName,
						orderedAt,
						notes: blankToNull(input.notes),
						lines: { create: input.lines.map(lineData) },
					},
					select: { id: true },
				});
				return created.id;
			}),
		);

		return this.detail(actingUserId, id, now);
	}

	async update(
		actingUserId: string,
		input: ImportOrderUpdateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const orderedAt = this.pastDay(input.orderedAt, now);

		await this.withNumber(input.number, () =>
			this.db.$transaction(async (tx) => {
				await this.lockOpenOrder(tx, input.id);
				const existing = await tx.purchaseOrderLine.findMany({
					where: { orderId: input.id },
					select: {
						id: true,
						productId: true,
						dealId: true,
						product: { select: { sku: true } },
						shipmentLines: { select: SHIPPED_SELECT },
					},
				});
				const current = new Map(existing.map((line) => [line.id, line]));
				const kept = new Set<string>();

				for (const line of input.lines) {
					if (line.id === undefined) continue;
					const before = current.get(line.id);
					if (!before) {
						throw new BadRequestException("Una línea no pertenece a esta orden.");
					}
					if (kept.has(line.id)) {
						throw new BadRequestException("Una línea aparece dos veces.");
					}
					kept.add(line.id);
					if (before.shipmentLines.length === 0) continue;
					if (before.productId !== line.productId) {
						throw new ConflictException(
							`La línea de ${before.product.sku} ya tiene envíos. No se puede cambiar el producto.`,
						);
					}
					const { shipped } = lineProgress(
						line.quantity,
						partsOf(before.shipmentLines),
					);
					if (line.quantity < shipped) {
						throw new ConflictException(
							`La línea de ${before.product.sku} ya tiene ${shipped} unidades enviadas. La cantidad no puede ser menor.`,
						);
					}
				}
				for (const line of existing) {
					if (!kept.has(line.id) && line.shipmentLines.length > 0) {
						throw new ConflictException(
							`La línea de ${line.product.sku} ya tiene envíos. No se puede quitar.`,
						);
					}
				}

				await this.assertReferences(
					tx,
					input.lines
						.filter(
							(line) =>
								line.id === undefined ||
								current.get(line.id)?.productId !== line.productId,
						)
						.map((line) => line.productId),
					input.lines.flatMap((line) =>
						line.dealId !== null &&
						(line.id === undefined ||
							current.get(line.id)?.dealId !== line.dealId)
							? [line.dealId]
							: [],
					),
				);

				const first = await tx.shipmentStageEvent.findFirst({
					where: { shipment: { orderId: input.id } },
					orderBy: { occurredAt: "asc" },
					select: { occurredAt: true },
				});
				if (first && orderedAt > first.occurredAt) {
					throw new BadRequestException(
						`La fecha de la orden no puede ser posterior al ${isoDay(first.occurredAt)}, la del primer envío.`,
					);
				}

				await tx.purchaseOrderLine.deleteMany({
					where: { orderId: input.id, id: { notIn: [...kept] } },
				});
				for (const line of input.lines) {
					if (line.id === undefined) continue;
					await tx.purchaseOrderLine.update({
						where: { id: line.id },
						data: lineData(line),
					});
				}
				const added = input.lines.filter((line) => line.id === undefined);
				if (added.length > 0) {
					await tx.purchaseOrderLine.createMany({
						data: added.map((line) => ({
							orderId: input.id,
							...lineData(line),
						})),
					});
				}
				await tx.purchaseOrder.update({
					where: { id: input.id },
					data: {
						number: input.number,
						supplierName: input.supplierName,
						orderedAt,
						notes: blankToNull(input.notes),
					},
				});
			}),
		);

		return this.detail(actingUserId, input.id, now);
	}

	async archive(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		return this.setArchived(actingUserId, id, new Date(), now);
	}

	async restore(
		actingUserId: string,
		id: string,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		return this.setArchived(actingUserId, id, null, now);
	}

	async createShipment(
		actingUserId: string,
		input: ShipmentCreateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const occurredAt = input.occurredAt
			? this.pastDay(input.occurredAt, now)
			: taskDayBoundaries(now).startOfToday;
		const lineIds = input.lines.map((line) => line.orderLineId);
		if (new Set(lineIds).size !== lineIds.length) {
			throw new BadRequestException(
				"Cada línea de la orden va una sola vez en el envío.",
			);
		}

		await this.db.$transaction(async (tx) => {
			const order = await this.lockOpenOrder(tx, input.orderId);
			if (occurredAt < order.orderedAt) {
				throw new BadRequestException(
					`La fecha no puede ser anterior al ${isoDay(order.orderedAt)}, la fecha de la orden.`,
				);
			}
			const entry = await tx.importStage.findFirst({
				where: { isEntry: true, archivedAt: null },
				select: { key: true },
			});
			if (!entry) {
				throw new ConflictException("No hay una etapa de entrada activa.");
			}
			const lines = await tx.purchaseOrderLine.findMany({
				where: { orderId: input.orderId, id: { in: lineIds } },
				select: {
					id: true,
					quantity: true,
					product: { select: { sku: true } },
					shipmentLines: { select: SHIPPED_SELECT },
				},
			});
			const byId = new Map(lines.map((line) => [line.id, line]));

			for (const requested of input.lines) {
				const line = byId.get(requested.orderLineId);
				if (!line) {
					throw new BadRequestException("Una línea no pertenece a esta orden.");
				}
				const { remaining } = lineProgress(
					line.quantity,
					partsOf(line.shipmentLines),
				);
				if (requested.quantity > remaining) {
					throw new ConflictException(
						`La línea de ${line.product.sku} tiene ${remaining} unidades pendientes. El envío pide ${requested.quantity}.`,
					);
				}
			}

			await tx.shipment.create({
				data: {
					orderId: input.orderId,
					reference: blankToNull(input.reference),
					trackingNumber: blankToNull(input.trackingNumber),
					stageKey: entry.key,
					stageChangedAt: occurredAt,
					lines: {
						create: input.lines.map((line) => ({
							orderLineId: line.orderLineId,
							quantity: line.quantity,
						})),
					},
					events: {
						create: {
							stageKey: entry.key,
							occurredAt,
							actorId: actingUserId,
						},
					},
				},
			});
		});

		return this.detail(actingUserId, input.orderId, now);
	}

	async updateShipment(
		actingUserId: string,
		input: ShipmentUpdateInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const shipment = await this.db.shipment.findUnique({
			where: { id: input.id },
			select: { orderId: true },
		});
		if (!shipment) {
			throw new NotFoundException("No existe un envío con ese id.");
		}
		await this.db.shipment.update({
			where: { id: input.id },
			data: {
				reference: blankToNull(input.reference),
				trackingNumber: blankToNull(input.trackingNumber),
			},
		});

		return this.detail(actingUserId, shipment.orderId, now);
	}

	async moveShipment(
		actingUserId: string,
		input: ShipmentMoveRequest,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const occurredOn =
			input.occurredAt ?? isoDay(taskDayBoundaries(now).startOfToday);

		const moved = await this.db.$transaction((tx) =>
			moveShipmentInTx(
				tx,
				{
					shipmentId: input.shipmentId,
					targetKey: input.targetKey,
					occurredOn,
					actorId: actingUserId,
				},
				now,
			),
		);
		const shipment = await this.db.shipment.findUniqueOrThrow({
			where: { id: moved.shipmentId },
			select: { orderId: true },
		});

		return this.detail(actingUserId, shipment.orderId, now);
	}

	private async setArchived(
		actingUserId: string,
		id: string,
		archivedAt: Date | null,
		now: Date,
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const { count } = await this.db.purchaseOrder.updateMany({
			where: { id },
			data: { archivedAt },
		});
		if (count === 0) {
			throw new NotFoundException("No existe una orden con ese id.");
		}

		return this.detail(actingUserId, id, now);
	}

	private buildWhere(
		input: ImportOrderListInput,
	): Prisma.PurchaseOrderWhereInput {
		const search = input.q.trim();
		return {
			AND: [
				archivedFilter(input.archived),
				search === ""
					? {}
					: {
							OR: [
								{ number: { contains: search, mode: "insensitive" } },
								{ supplierName: { contains: search, mode: "insensitive" } },
							],
						},
			],
		};
	}

	private async lockOpenOrder(
		tx: Prisma.TransactionClient,
		orderId: string,
	): Promise<LockedOrder> {
		const [order] = await tx.$queryRaw<LockedOrder[]>`
			SELECT id, "orderedAt", "archivedAt"
			FROM purchase_order
			WHERE id = ${orderId}
			FOR UPDATE
		`;
		if (!order) {
			throw new NotFoundException("No existe una orden con ese id.");
		}
		if (order.archivedAt) {
			throw new ConflictException(
				"La orden está archivada. Restáurala antes de cambiarla.",
			);
		}
		return order;
	}

	private async assertReferences(
		tx: Prisma.TransactionClient,
		productIds: string[],
		dealIds: string[],
	): Promise<void> {
		const products = [...new Set(productIds)];
		const deals = [...new Set(dealIds)];
		if (products.length > 0) {
			const found = await tx.product.count({
				where: { id: { in: products }, archivedAt: null },
			});
			if (found !== products.length) {
				throw new BadRequestException(
					"Un producto de la orden no existe o está archivado.",
				);
			}
		}
		if (deals.length > 0) {
			const found = await tx.deal.count({
				where: {
					AND: [{ id: { in: deals }, archivedAt: null }, OPEN_STAGE_FILTER],
				},
			});
			if (found !== deals.length) {
				throw new BadRequestException(
					"Una oportunidad de la orden no existe o ya no está abierta.",
				);
			}
		}
	}

	private pastDay(day: string, now: Date): Date {
		const date = taskDueDay(day);
		if (date >= taskDayBoundaries(now).startOfTomorrow) {
			throw new BadRequestException("La fecha no puede ser posterior a hoy.");
		}
		return date;
	}

	private async withNumber<Result>(
		number: string,
		work: () => Promise<Result>,
	): Promise<Result> {
		try {
			return await work();
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ConflictException(
					`Ya existe una orden con el número ${number}.`,
				);
			}
			throw error;
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar las órdenes de compra.",
			);
		}
	}
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: PASS, 25 tests.

If "lets exactly one of two writers take the last units" fails with both fulfilled, the lock is missing or runs after the read. `lockOpenOrder` must be the first statement of the transaction in `createShipment`. Do not weaken the test.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/api/test/import-orders.integration.spec.ts && bunx biome check apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/api/test/import-orders.integration.spec.ts`
Expected: no findings.

Do not commit; the owner approves commits.

---

### Task 4: Router, module and registration

**Files:**
- Create: `apps/api/src/import-orders/import-orders.router.ts`
- Create: `apps/api/src/import-orders/import-orders.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Regenerate: `apps/api/src/generated/server.ts`

- [ ] **Step 1: Write the router**

Create `apps/api/src/import-orders/import-orders.router.ts`:

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
	type ImportOrderCreateInput,
	type ImportOrderIdInput,
	type ImportOrderListInput,
	type ImportOrderUpdateInput,
	importOrderCreateInput,
	importOrderDetailOutput,
	importOrderIdInput,
	importOrderListInput,
	importOrderListOutput,
	importOrderOptionsOutput,
	importOrderUpdateInput,
	type ShipmentCreateInput,
	type ShipmentMoveRequest,
	type ShipmentUpdateInput,
	shipmentCreateInput,
	shipmentMoveRequest,
	shipmentUpdateInput,
} from "./import-orders.contracts";
import { ImportOrdersService } from "./import-orders.service";

const TAGS = ["Import orders"];

@Router({ alias: "importOrders" })
@UseMiddlewares(AuthMiddleware)
export class ImportOrdersRouter {
	constructor(
		@Inject(ImportOrdersService) private readonly orders: ImportOrdersService,
	) {}

	@Query({
		input: importOrderListInput,
		output: importOrderListOutput,
		meta: restMeta("POST", "/import-orders/search", TAGS),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderListInput,
	) {
		return this.orders.list(ctx.user.id, input);
	}

	@Query({
		output: importOrderOptionsOutput,
		meta: restMeta("GET", "/import-order-options", TAGS),
	})
	async options() {
		return this.orders.options();
	}

	@Query({
		input: importOrderIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("GET", "/import-orders/{id}", TAGS),
	})
	async byId(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderIdInput,
	) {
		return this.orders.detail(ctx.user.id, input.id);
	}

	@Mutation({
		input: importOrderCreateInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderCreateInput,
	) {
		return this.orders.create(ctx.user.id, input);
	}

	@Mutation({
		input: importOrderUpdateInput,
		output: importOrderDetailOutput,
		meta: restMeta("PATCH", "/import-orders/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderUpdateInput,
	) {
		return this.orders.update(ctx.user.id, input);
	}

	@Mutation({
		input: importOrderIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderIdInput,
	) {
		return this.orders.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: importOrderIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderIdInput,
	) {
		return this.orders.restore(ctx.user.id, input.id);
	}

	@Mutation({
		input: shipmentCreateInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{orderId}/shipments", TAGS),
	})
	async createShipment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentCreateInput,
	) {
		return this.orders.createShipment(ctx.user.id, input);
	}

	@Mutation({
		input: shipmentUpdateInput,
		output: importOrderDetailOutput,
		meta: restMeta("PATCH", "/shipments/{id}", TAGS),
	})
	async updateShipment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentUpdateInput,
	) {
		return this.orders.updateShipment(ctx.user.id, input);
	}

	@Mutation({
		input: shipmentMoveRequest,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/shipments/{shipmentId}/move", TAGS),
	})
	async moveShipment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentMoveRequest,
	) {
		return this.orders.moveShipment(ctx.user.id, input);
	}
}
```

- [ ] **Step 2: Write the module**

Create `apps/api/src/import-orders/import-orders.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportOrdersRouter } from "./import-orders.router";
import { ImportOrdersService } from "./import-orders.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportOrdersService, ImportOrdersRouter],
})
export class ImportOrdersModule {}
```

- [ ] **Step 3: Register the module**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/app.module.ts`
Expected: no output. If there is output, stop and ask the owner.

In `apps/api/src/app.module.ts`, replace:

```ts
import { ImportsModule } from "./imports/imports.module";
```

with:

```ts
import { ImportOrdersModule } from "./import-orders/import-orders.module";
import { ImportsModule } from "./imports/imports.module";
```

Then replace:

```ts
		ImportsModule,
```

with:

```ts
		ImportsModule,
		ImportOrdersModule,
```

- [ ] **Step 4: Regenerate the router file**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`
Expected: `src/generated/server.ts` now contains an `importOrders: t.router({` block with `list`, `options`, `byId`, `create`, `update`, `archive`, `restore`, `createShipment`, `updateShipment`, `moveShipment`.
Check: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'importOrders: t.router' apps/api/src/generated/server.ts` prints one line.
If the generator fails on GLIBC, stop and report it. Do not edit the file by hand.

Then run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected: only the `importOrders` block and its imports. If any other hunk shows, stop and ask the owner.

- [ ] **Step 5: Type check the API**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api`
Expected: no errors.

If `options()` without `@Ctx()` fails the generator or the type check, change it to `async options(@Ctx() _ctx: AuthedTrpcContext)`. Report the change.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/src/import-orders/import-orders.router.ts apps/api/src/import-orders/import-orders.module.ts apps/api/src/app.module.ts && bunx biome check apps/api/src/import-orders/import-orders.router.ts apps/api/src/import-orders/import-orders.module.ts apps/api/src/app.module.ts`
Expected: no findings. Do not format `generated/server.ts`.

Do not commit; the owner approves commits.

---

### Task 5: API verification

- [ ] **Step 1: Type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=@crm/db`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run lint:slop`
Expected: no finding in a file this plan touched. A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 3: Run the tests of this part**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`

Expected: 9 and 25 tests pass.

- [ ] **Step 4: Run the neighbour tests**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts test/import-stages.integration.spec.ts test/products.integration.spec.ts`
Expected: all green. `moveShipmentInTx` is unchanged, and the products test still deletes its products (orders of this test file are deleted before their products).

- [ ] **Step 5: Hand over to part 2**

Report to the owner: part 1 is done, with the test counts. Part 2 (`docs/superpowers/plans/2026-11-15-import-screen.md`) builds the screen on `trpc.importOrders`.

Do not commit; the owner approves commits.

---

## Self-review

**Coverage of part 1.**

| Requirement | Where |
| --- | --- |
| Order with lines (product, quantity, optional deal) | Task 3 `create`, `update`; tests "creates the order…", "changes the header…" |
| Line links only to an open deal | Decision 10, `assertReferences`, tests "refuses an archived product and a deal that is not open", "keeps a deal that closed after it was linked" |
| Shipment in batches, sum per line never above ordered | `createShipment` rule 7, test "ships in batches and refuses more than what is left" |
| Two writers at once | `lockOpenOrder` (`SELECT … FOR UPDATE` through `$queryRaw`), test "lets exactly one of two writers take the last units" |
| First event in the entry stage, editable date, default today, not in the future | `createShipment`, tests "writes the first event…", "dates the first event today…", "refuses a day before the order, a day after today…" |
| Move with a date, default today | `moveShipment` calls `moveShipmentInTx`, tests in "moving a shipment" |
| Lead times between stages and from order to received, calendar days at 00:00 UTC | `withLeadTimes`, `receivedAfterDays` (Task 2 unit tests), `detail`, tests "moves on the chosen day and measures each stage", "counts the open stage until today" |
| Received over ordered | `lineProgress`, `orderLineOutput.received`, list `receivedUnits`; Open question 1 |
| `canManageInventory` for writes, members read | `requireManager`, test "permissions" |
| `expectOutput` on every procedure | the `orders` wrapper in the test wraps all ten service calls |
| No `Promise.all` on `tx` | `assertReferences` and every `$transaction` body run sequentially; `Promise.all` only in `list`, `options`, `detail` on `this.db` |
| No migration | Task 1 |

**Placeholder scan.** No step says "similar to", "TODO" or "add the rest". Every code step holds the whole file or the exact old and new text.

**Name consistency.**
- `IMPORT_ORDER`, `countsTowardOrdered`, `lineProgress`, `isoDay`, `daysBetween`, `withLeadTimes`, `receivedAfterDays`, `ShippedPart` (Task 2) are the names Task 3 imports.
- Contract names (Task 3 Step 1) match the test imports (Step 2), the service imports (Step 4) and the router imports (Task 4).
- Service methods `list`, `options`, `detail`, `create`, `update`, `archive`, `restore`, `createShipment`, `updateShipment`, `moveShipment` match the router. The router procedure for `detail` is `byId`.
- `ShipmentMoveRequest` is the tRPC input. `ShipmentMoveInput` stays the type of `moveShipmentInTx` (shipped). The day field is `occurredAt` on the wire and `occurredOn` for `moveShipmentInTx`, as in Plan 2a-1.

**Known risks.**
- The pickers cap at 500 products and 500 deals. A larger catalog needs a search field. Part 2 shows the capped list.
- The order lock serializes every write on one order. Two users who ship different lines of the same order wait for each other. Per-line locks are the upgrade.
- A move to *Cancelado* runs in `moveShipmentInTx`, which does not take the order lock. It only frees units, so a concurrent `createShipment` can refuse units that are free a moment later. It never lets the sum pass the ordered quantity, because a cancelled shipment never moves again.
- `options()` has no `@Ctx()`. Task 4 Step 5 names the fallback.
- Lines that share a `createdAt` are ordered by `id`. The order of new lines in the sheet can differ from the order the user typed them.
