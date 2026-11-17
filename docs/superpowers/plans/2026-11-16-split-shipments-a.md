# Split Shipments (part 1 of 2: rule and API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner splits one order line into separate, independent shipments from the *Registrar envío* dialog. Ten Fatnav units with 1 unit per shipment become 10 shipments. Each shipment has its own stage path and its own entry event.

**Architecture:** A pure function `splitQuantities` in `packages/db/src/import-order.ts` owns the rule. The limit `maxSplitShipments` is in `IMPORT_ORDER`. `importOrders.splitShipments` locks the order with `lockOpenOrder`, reads `remaining` with `lineProgress`, and writes the shipments in one transaction. `createShipment` and `splitShipments` share the lock, day check and entry lookup (`lockEntryStage`) and the shipment data (`shipmentData`). The dialog gets a two-option toggle. The split form is a new component in `shipment-dialogs.tsx`. Its preview text comes from `splitPreview` in `apps/app/lib/import-orders.ts`.

**Tech Stack:** bun test, NestJS with `nestjs-trpc`, Zod, Prisma 7, React with TanStack Query, Radix through `@crm/ui`.

Spec: `docs/superpowers/specs/2026-11-15-import-processes-design.md`, rule 9 and rule 10. Part 2: `docs/superpowers/plans/2026-11-16-split-shipments-b.md`. Run this part completely first. Part 2 calls the procedure and the pure rule of this part.

**Out of scope (later plans):** the `Product.unitsPerShipment` prefill (needs a migration), the bank decision step, rejections, documents and costs. In this plan *Unidades por envío* starts at 1.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish. No voseo: "Elige", never "Elegí".
- Do not read `.env`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument and quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** The owner approves commits. No `git add`, no `git mv`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app` and `apps/api`. Before you edit a shared file (`apps/api/src/generated/server.ts`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- A `"use client"` file never imports `@crm/auth` or the `@crm/db` barrel. `@crm/db/import-order` imports only generated enums and `./import-stage`, so it is allowed.
- UI comes from `packages/ui`. Semantic tokens and the scale only. No new look at the call site.
- No `useEffect` (`.agents/skills/no-use-effect`). Derive values during render.
- `noUncheckedIndexedAccess` is on. Guard `list[index]`.
- **Integration specs share `crm_test`.** `apps/api/test/import-orders.integration.spec.ts` cleans up by `processId` in `afterAll`. After a failed run, run the leftover check in part 2, Task 6 Step 5, before the next run.

## Decisions recorded in this plan

1. **A split works on one order line.** The input is `orderLineId` and `perShipment`. It creates `ceil(remaining / perShipment)` shipments. The last one takes the rest. 10 by 3 gives 3, 3, 3 and 1.
2. **`perShipment` larger than `remaining` is allowed.** It gives one shipment with every remaining unit.
3. **More than `IMPORT_ORDER.maxSplitShipments` (50) shipments is a `BadRequestException`.** Nothing is written. A line with nothing left is a `ConflictException`, because it is a state of the data.
4. **`remaining` comes from `lineProgress` under the order lock**, the same read as `createShipment`. A cancelled shipment does not count (`countsTowardOrdered`), so its units split again.
5. **The reference is copied to every shipment, as the same text.** It names the batch with the supplier. A split never sets a tracking number. Each tracking number arrives later and goes in through *Editar* on its card.
6. **Each shipment gets its own entry event** with the chosen day and the acting user as actor, through the same `shipmentData` as `createShipment`.
7. **The split transaction has a 30 second timeout (`IMPORT_ORDER.splitTimeoutMs`).** Prisma's default is 5 seconds. 50 shipments write about 150 rows one by one. The writes are sequential, so the shipment order is the split order.
8. **The success toast counts what the server created:** the shipments in the returned order minus the shipments before. A concurrent writer can change `remaining`, so the preview count is not proof.
9. **The dialog keeps *Un envío* unchanged.** The toggle switches between the existing form and a new `SplitShipmentForm`. Switching mode drops the values of the other mode.
10. **The line is a `Select` only when more than one line has remaining units.** With one line, the form names the product.

## File structure

Part 1 touches the files down to `server.ts`. Part 2 touches the rest.

| File | Responsibility |
| --- | --- |
| `packages/db/src/import-order.ts` | `maxSplitShipments`, `splitTimeoutMs`, `SplitError`, `Split`, `splitCount`, `splitQuantities` |
| `packages/db/test/import-order.spec.ts` | Unit tests of `splitQuantities` |
| `apps/api/src/import-orders/import-orders.contracts.ts` | `shipmentSplitInput`, `ShipmentSplitInput` |
| `apps/api/src/import-orders/import-orders.service.ts` | `shipmentData`, `splitRefusal`, `shipmentDay`, `lockEntryStage`, `splitShipments` |
| `apps/api/src/import-orders/import-orders.router.ts` | `importOrders.splitShipments` |
| `apps/api/test/import-orders.integration.spec.ts` | Split tests, two-writers test, member refusal |
| `apps/api/src/generated/server.ts` | Regenerated, never edited by hand |
| `apps/app/lib/import-orders.ts` | `SplitPreview`, `unitCountLabel`, `shipmentsRegisteredLabel`, `splitPreview` |
| `apps/app/test/import-orders.spec.ts` | Unit tests of the preview |
| `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx` | Mode toggle, `SplitShipmentForm` |
| `docs/imports.md` | The split rules |

---

### Task 1: The pure split rule

**Files:**
- Modify: `packages/db/src/import-order.ts`
- Modify: `packages/db/test/import-order.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/db/test/import-order.spec.ts`, replace:

```ts
	receivedAfterDays,
	withLeadTimes,
} from "../src/import-order";
```

with:

```ts
	receivedAfterDays,
	splitCount,
	splitQuantities,
	withLeadTimes,
} from "../src/import-order";

const units = (count: number, quantity: number) =>
	Array.from({ length: count }, () => quantity);
```

At the end of the file, add:

```ts
describe("splitQuantities", () => {
	it("makes one shipment per unit", () => {
		expect(splitQuantities(10, 1)).toEqual({
			ok: true,
			quantities: units(10, 1),
		});
	});

	it("gives the rest to the last shipment", () => {
		expect(splitQuantities(10, 3)).toEqual({
			ok: true,
			quantities: [3, 3, 3, 1],
		});
		expect(splitQuantities(10, 5)).toEqual({ ok: true, quantities: [5, 5] });
	});

	it("makes one shipment when the size passes what is left", () => {
		expect(splitQuantities(4, 5)).toEqual({ ok: true, quantities: [4] });
	});

	it("allows the limit and refuses one more", () => {
		expect(splitQuantities(50, 1)).toEqual({
			ok: true,
			quantities: units(50, 1),
		});
		expect(splitQuantities(51, 1)).toEqual({ ok: false, error: "TOO_MANY" });
		expect(splitQuantities(51, 1, 60)).toEqual({
			ok: true,
			quantities: units(51, 1),
		});
		expect(splitCount(51, 1)).toBe(51);
		expect(IMPORT_ORDER.maxSplitShipments).toBe(50);
	});

	it("refuses a size that is not a positive whole number and a line with nothing left", () => {
		for (const size of [0, -1, 1.5]) {
			expect(splitQuantities(10, size)).toEqual({
				ok: false,
				error: "INVALID_SIZE",
			});
		}
		expect(splitQuantities(0, 1)).toEqual({ ok: false, error: "NOTHING_LEFT" });
	});
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts`
Expected: FAIL. `splitQuantities` is not exported.

- [ ] **Step 3: Add the limits and the rule**

In `packages/db/src/import-order.ts`, replace:

```ts
const DAY_MS = 86_400_000;
```

with:

```ts
const SECOND_MS = 1_000;
const DAY_MS = 86_400 * SECOND_MS;
```

Replace:

```ts
	maxQuantity: 1_000_000,
	optionsLimit: 500,
} as const;
```

with:

```ts
	maxQuantity: 1_000_000,
	optionsLimit: 500,
	maxSplitShipments: 50,
	splitTimeoutMs: 30 * SECOND_MS,
} as const;
```

Replace:

```ts
export function isoDay(value: Date): string {
```

with:

```ts
export type SplitError = "INVALID_SIZE" | "NOTHING_LEFT" | "TOO_MANY";

export type Split =
	| { ok: true; quantities: number[] }
	| { ok: false; error: SplitError };

export function splitCount(remaining: number, perShipment: number): number {
	return Math.ceil(remaining / perShipment);
}

export function splitQuantities(
	remaining: number,
	perShipment: number,
	max: number = IMPORT_ORDER.maxSplitShipments,
): Split {
	if (!Number.isInteger(perShipment) || perShipment < 1) {
		return { ok: false, error: "INVALID_SIZE" };
	}
	if (remaining < 1) return { ok: false, error: "NOTHING_LEFT" };
	const count = splitCount(remaining, perShipment);
	if (count > max) return { ok: false, error: "TOO_MANY" };
	const last = remaining - perShipment * (count - 1);
	return {
		ok: true,
		quantities: Array.from({ length: count }, (_, index) =>
			index === count - 1 ? last : perShipment,
		),
	};
}

export function isoDay(value: Date): string {
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts`
Expected: 16 pass, 0 fail. "keeps every limit positive" still passes with the two new limits.

- [ ] **Step 5: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/db/src/import-order.ts packages/db/test/import-order.spec.ts && bunx biome check packages/db/src/import-order.ts packages/db/test/import-order.spec.ts`
Expected: no errors.

---

### Task 2: The `splitShipments` procedure

**Files:**
- Modify: `apps/api/test/import-orders.integration.spec.ts`
- Modify: `apps/api/src/import-orders/import-orders.contracts.ts`
- Modify: `apps/api/src/import-orders/import-orders.service.ts`
- Modify: `apps/api/src/import-orders/import-orders.router.ts`

- [ ] **Step 1: Check the files are as this plan expects**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n "async createShipment|lockOpenOrder\(tx, input.orderId\)|describe\(\"permissions\"" apps/api/src/import-orders/import-orders.service.ts apps/api/test/import-orders.integration.spec.ts`
Expected: one `async createShipment`, one `lockOpenOrder(tx, input.orderId)`, one `describe("permissions"`. If not, stop and ask the owner.

- [ ] **Step 2: Write the failing tests**

In `apps/api/test/import-orders.integration.spec.ts`, replace:

```ts
import { ImportStageKind, PipelineStageKind } from "@crm/db/enums";
```

with:

```ts
import { ImportStageKind, PipelineStageKind } from "@crm/db/enums";
import { IMPORT_ORDER } from "@crm/db/import-order";
```

Replace:

```ts
	type ShipmentMoveRequest,
	type ShipmentUpdateInput,
} from "../src/import-orders/import-orders.contracts";
```

with:

```ts
	type ShipmentMoveRequest,
	type ShipmentSplitInput,
	type ShipmentUpdateInput,
	shipmentSplitInput,
} from "../src/import-orders/import-orders.contracts";
```

Replace:

```ts
	moveShipment: async (userId: string, input: ShipmentMoveRequest) =>
		detailOf(await service.moveShipment(userId, input, NOW)),
};
```

with:

```ts
	moveShipment: async (userId: string, input: ShipmentMoveRequest) =>
		detailOf(await service.moveShipment(userId, input, NOW)),
	splitShipments: async (userId: string, input: ShipmentSplitInput) =>
		detailOf(await service.splitShipments(userId, input, NOW)),
};
```

Replace:

```ts
function headerOf(order: ImportOrderDetail) {
```

with:

```ts
function splitInput(
	order: ImportOrderDetail,
	perShipment: number,
	overrides: Partial<ShipmentSplitInput> = {},
): ShipmentSplitInput {
	return {
		orderId: order.id,
		orderLineId: firstLine(order).id,
		perShipment,
		reference: "",
		occurredAt: "2026-01-10",
		...overrides,
	};
}

function split(
	order: ImportOrderDetail,
	perShipment: number,
	overrides: Partial<ShipmentSplitInput> = {},
) {
	return orders.splitShipments(
		adminId,
		splitInput(order, perShipment, overrides),
	);
}

function quantitiesOf(order: ImportOrderDetail) {
	return order.shipments.map((shipment) => shipment.lines[0]?.quantity);
}

function headerOf(order: ImportOrderDetail) {
```

Replace:

```ts
describe("moving a shipment", () => {
```

with:

```ts
describe("splitting a line into shipments", () => {
	it("creates one shipment per unit, each in the entry stage with its own event", async () => {
		const order = await orderWith(10);

		const after = await split(order, 1, {
			reference: "LOTE-7",
			occurredAt: "2026-01-12",
		});

		expect(after.shipments.length).toBe(10);
		for (const shipment of after.shipments) {
			expect(shipment).toMatchObject({
				reference: "LOTE-7",
				trackingNumber: null,
				stageChangedAt: "2026-01-12",
				stage: { key: entryKey },
			});
			expect(shipment.lines.map((line) => line.quantity)).toEqual([1]);
			expect(
				shipment.events.map((event) => [event.stage.key, event.occurredAt]),
			).toEqual([[entryKey, "2026-01-12"]]);
		}
		expect(firstLine(after)).toMatchObject({ shipped: 10, remaining: 0 });
		const events = await db.shipmentStageEvent.findMany({
			where: { shipment: { orderId: order.id } },
			select: { actorId: true },
		});
		expect(events.map((event) => event.actorId)).toEqual(
			Array.from({ length: 10 }, () => adminId),
		);
	});

	it("gives the rest to the last shipment", async () => {
		const order = await orderWith(10);

		const after = await split(order, 3);

		expect(quantitiesOf(after)).toEqual([3, 3, 3, 1]);
	});

	it("splits only what is left and makes one shipment when the size passes it", async () => {
		const order = await orderWith(10);
		await ship(order, 6);

		const after = await split(order, 5);

		expect(quantitiesOf(after)).toEqual([6, 4]);
		expect(firstLine(after)).toMatchObject({ shipped: 10, remaining: 0 });
		await expect(split(order, 1)).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses more shipments than the limit and writes nothing", async () => {
		const order = await orderWith(IMPORT_ORDER.maxSplitShipments + 1);

		await expect(split(order, 1)).rejects.toBeInstanceOf(BadRequestException);
		await expect(split(order, 1)).rejects.toMatchObject({
			message: expect.stringContaining(
				`El máximo es ${IMPORT_ORDER.maxSplitShipments}`,
			),
		});
		expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
	});

	it("splits the units that a cancelled shipment freed", async () => {
		const order = await orderWith(4);
		const wrong = lastShipment(await ship(order, 4));
		await orders.moveShipment(adminId, {
			shipmentId: wrong.id,
			targetKey: cancelledKey,
			occurredAt: "2026-01-11",
		});

		const after = await split(order, 1, { occurredAt: "2026-01-12" });

		expect(after.shipments.length).toBe(5);
		expect(firstLine(after)).toMatchObject({ shipped: 4, remaining: 0 });
	});

	it("refuses a day out of range, a line of another order and an archived order", async () => {
		const order = await orderWith(3);
		const other = await orderWith(3);

		await expect(
			split(order, 1, { occurredAt: "2026-01-04" }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			split(order, 1, { occurredAt: "2026-03-02" }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			split(order, 1, { orderLineId: firstLine(other).id }),
		).rejects.toBeInstanceOf(BadRequestException);
		await orders.archive(adminId, order.id);
		await expect(split(order, 1)).rejects.toBeInstanceOf(ConflictException);
		expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
	});

	it("never ships more than ordered when a split and a shipment race", async () => {
		const order = await orderWith(10);
		const line = firstLine(order);

		const results = await Promise.allSettled([
			service.splitShipments(adminId, splitInput(order, 1), NOW),
			service.createShipment(
				adminId,
				{
					orderId: order.id,
					reference: "",
					trackingNumber: "",
					occurredAt: "2026-01-10",
					lines: [{ orderLineId: line.id, quantity: 6 }],
				},
				NOW,
			),
		]);

		const [splitResult, shipResult] = results;
		expect(splitResult?.status).toBe("fulfilled");
		for (const result of results) {
			if (result.status === "rejected") {
				expect(result.reason).toBeInstanceOf(ConflictException);
			}
		}
		const shipped = await db.shipmentLine.aggregate({
			where: { orderLineId: line.id },
			_sum: { quantity: true },
		});
		expect(shipped._sum.quantity).toBe(10);
		const shipments = await db.shipment.count({ where: { orderId: order.id } });
		expect([
			{ ship: "fulfilled", shipments: 5 },
			{ ship: "rejected", shipments: 10 },
		]).toContainEqual({ ship: shipResult?.status, shipments });
	});

	it("validates the split at the boundary", () => {
		const valid = {
			orderId: "o-1",
			orderLineId: "l-1",
			perShipment: 1,
			reference: "",
		};

		expect(shipmentSplitInput.safeParse(valid).success).toBe(true);
		expect(
			shipmentSplitInput.safeParse({ ...valid, perShipment: 0 }).success,
		).toBe(false);
		expect(
			shipmentSplitInput.safeParse({ ...valid, perShipment: 1.5 }).success,
		).toBe(false);
		expect(
			shipmentSplitInput.safeParse({
				...valid,
				reference: "x".repeat(IMPORT_ORDER.referenceMaxLength + 1),
			}).success,
		).toBe(false);
	});
});

describe("moving a shipment", () => {
```

In the `permissions` test, replace:

```ts
			() =>
				service.updateShipment(
					memberId,
```

with:

```ts
			() =>
				service.splitShipments(
					memberId,
					{
						orderId: order.id,
						orderLineId: firstLine(order).id,
						perShipment: 1,
						reference: "",
					},
					NOW,
				),
			() =>
				service.updateShipment(
					memberId,
```

- [ ] **Step 3: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: 35 pass, 9 fail: the 8 split tests and "lets a member read and refuses every write". The errors say `splitShipments is not a function` or `shipmentSplitInput` is undefined.

- [ ] **Step 4: Add the input contract**

In `apps/api/src/import-orders/import-orders.contracts.ts`, replace:

```ts
export const shipmentUpdateInput = z.object({
```

with:

```ts
export const shipmentSplitInput = z.object({
	orderId: recordId,
	orderLineId: recordId,
	perShipment: quantity,
	reference: shipmentText.reference,
	occurredAt: taskDueDayInput.optional(),
});

export const shipmentUpdateInput = z.object({
```

Replace:

```ts
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateInput>;
```

with:

```ts
export type ShipmentSplitInput = z.infer<typeof shipmentSplitInput>;
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateInput>;
```

The output is `importOrderDetailOutput`. No output change.

- [ ] **Step 5: Share the entry and the shipment data, and add the method**

In `apps/api/src/import-orders/import-orders.service.ts`, replace:

```ts
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
```

with:

```ts
	receivedAfterDays,
	type ShippedPart,
	type SplitError,
	splitCount,
	splitQuantities,
	withLeadTimes,
} from "@crm/db/import-order";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	type HttpException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
```

Replace:

```ts
	ShipmentMoveRequest,
	ShipmentUpdateInput,
} from "./import-orders.contracts";
```

with:

```ts
	ShipmentMoveRequest,
	ShipmentSplitInput,
	ShipmentUpdateInput,
} from "./import-orders.contracts";
```

Replace:

```ts
@Injectable()
export class ImportOrdersService {
```

with:

```ts
type NewShipment = {
	orderId: string;
	reference: string | null;
	trackingNumber: string | null;
	stageKey: string;
	occurredAt: Date;
	actorId: string;
	lines: ReadonlyArray<{ orderLineId: string; quantity: number }>;
};

function shipmentData(
	shipment: NewShipment,
): Prisma.ShipmentUncheckedCreateInput {
	return {
		orderId: shipment.orderId,
		reference: shipment.reference,
		trackingNumber: shipment.trackingNumber,
		stageKey: shipment.stageKey,
		stageChangedAt: shipment.occurredAt,
		lines: {
			create: shipment.lines.map((line) => ({
				orderLineId: line.orderLineId,
				quantity: line.quantity,
			})),
		},
		events: {
			create: {
				stageKey: shipment.stageKey,
				occurredAt: shipment.occurredAt,
				actorId: shipment.actorId,
			},
		},
	};
}

function splitRefusal(
	error: SplitError,
	sku: string,
	remaining: number,
	perShipment: number,
): HttpException {
	switch (error) {
		case "NOTHING_LEFT":
			return new ConflictException(
				`La línea de ${sku} no tiene unidades pendientes.`,
			);
		case "TOO_MANY":
			return new BadRequestException(
				`La división crea ${splitCount(remaining, perShipment)} envíos. El máximo es ${IMPORT_ORDER.maxSplitShipments}. Sube las unidades por envío.`,
			);
		case "INVALID_SIZE":
			return new BadRequestException(
				"Las unidades por envío deben ser un número entero mayor que cero.",
			);
	}
}

@Injectable()
export class ImportOrdersService {
```

In `createShipment`, replace:

```ts
		const occurredAt = input.occurredAt
			? this.pastDay(input.occurredAt, now)
			: taskDayBoundaries(now).startOfToday;
		const lineIds = input.lines.map((line) => line.orderLineId);
```

with:

```ts
		const occurredAt = this.shipmentDay(input.occurredAt, now);
		const lineIds = input.lines.map((line) => line.orderLineId);
```

Replace:

```ts
		await this.db.$transaction(async (tx) => {
			const order = await this.lockOpenOrder(tx, input.orderId);
			if (occurredAt < order.orderedAt) {
				throw new BadRequestException(
					`La fecha no puede ser anterior al ${isoDay(order.orderedAt)}, la fecha de la orden.`,
				);
			}
			await this.assertProcessOpen(tx, order.processId);
			const entry = await tx.importStage.findFirst({
				where: {
					processId: order.processId,
					isEntry: true,
					archivedAt: null,
				},
				select: { key: true },
			});
			if (!entry) {
				throw new ConflictException("No hay una etapa de entrada activa.");
			}
			const lines = await tx.purchaseOrderLine.findMany({
```

with:

```ts
		await this.db.$transaction(async (tx) => {
			const stageKey = await this.lockEntryStage(
				tx,
				input.orderId,
				occurredAt,
			);
			const lines = await tx.purchaseOrderLine.findMany({
```

Replace:

```ts
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
```

with:

```ts
			await tx.shipment.create({
				data: shipmentData({
					orderId: input.orderId,
					reference: blankToNull(input.reference),
					trackingNumber: blankToNull(input.trackingNumber),
					stageKey,
					occurredAt,
					actorId: actingUserId,
					lines: input.lines,
				}),
				select: { id: true },
			});
		});

		return this.detail(actingUserId, input.orderId, now);
	}

	async splitShipments(
		actingUserId: string,
		input: ShipmentSplitInput,
		now: Date = new Date(),
	): Promise<ImportOrderDetail> {
		await this.requireManager(actingUserId);
		const occurredAt = this.shipmentDay(input.occurredAt, now);

		await this.db.$transaction(
			async (tx) => {
				const stageKey = await this.lockEntryStage(
					tx,
					input.orderId,
					occurredAt,
				);
				const line = await tx.purchaseOrderLine.findFirst({
					where: { id: input.orderLineId, orderId: input.orderId },
					select: {
						quantity: true,
						product: { select: { sku: true } },
						shipmentLines: { select: SHIPPED_SELECT },
					},
				});
				if (!line) {
					throw new BadRequestException("Una línea no pertenece a esta orden.");
				}
				const { remaining } = lineProgress(
					line.quantity,
					partsOf(line.shipmentLines),
				);
				const split = splitQuantities(remaining, input.perShipment);
				if (!split.ok) {
					throw splitRefusal(
						split.error,
						line.product.sku,
						remaining,
						input.perShipment,
					);
				}
				const reference = blankToNull(input.reference);
				for (const quantity of split.quantities) {
					await tx.shipment.create({
						data: shipmentData({
							orderId: input.orderId,
							reference,
							trackingNumber: null,
							stageKey,
							occurredAt,
							actorId: actingUserId,
							lines: [{ orderLineId: input.orderLineId, quantity }],
						}),
						select: { id: true },
					});
				}
			},
			{ timeout: IMPORT_ORDER.splitTimeoutMs },
		);

		return this.detail(actingUserId, input.orderId, now);
	}
```

Replace:

```ts
	private async assertProcessOpen(
```

with:

```ts
	private shipmentDay(day: string | undefined, now: Date): Date {
		return day ? this.pastDay(day, now) : taskDayBoundaries(now).startOfToday;
	}

	private async lockEntryStage(
		tx: Prisma.TransactionClient,
		orderId: string,
		occurredAt: Date,
	): Promise<string> {
		const order = await this.lockOpenOrder(tx, orderId);
		if (occurredAt < order.orderedAt) {
			throw new BadRequestException(
				`La fecha no puede ser anterior al ${isoDay(order.orderedAt)}, la fecha de la orden.`,
			);
		}
		await this.assertProcessOpen(tx, order.processId);
		const entry = await tx.importStage.findFirst({
			where: { processId: order.processId, isEntry: true, archivedAt: null },
			select: { key: true },
		});
		if (!entry) {
			throw new ConflictException("No hay una etapa de entrada activa.");
		}
		return entry.key;
	}

	private async assertProcessOpen(
```

`lockEntryStage` takes the order lock first, as `createShipment` did. The line read and every write run after it.

- [ ] **Step 6: Add the route**

In `apps/api/src/import-orders/import-orders.router.ts`, replace:

```ts
	type ShipmentMoveRequest,
	type ShipmentUpdateInput,
	shipmentCreateInput,
	shipmentMoveRequest,
	shipmentUpdateInput,
} from "./import-orders.contracts";
```

with:

```ts
	type ShipmentMoveRequest,
	type ShipmentSplitInput,
	type ShipmentUpdateInput,
	shipmentCreateInput,
	shipmentMoveRequest,
	shipmentSplitInput,
	shipmentUpdateInput,
} from "./import-orders.contracts";
```

Replace:

```ts
	@Mutation({
		input: shipmentUpdateInput,
```

with:

```ts
	@Mutation({
		input: shipmentSplitInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{orderId}/shipments/split", TAGS),
	})
	async splitShipments(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentSplitInput,
	) {
		return this.orders.splitShipments(ctx.user.id, input);
	}

	@Mutation({
		input: shipmentUpdateInput,
```

The class keeps `@UseMiddlewares(AuthMiddleware)`, so the route is not public.

- [ ] **Step 7: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: 44 pass, 0 fail. The old `createShipment` tests prove the shared `lockEntryStage` and `shipmentData`.

If "gives the rest to the last shipment" gets `[1, 3, 3, 3]` or another order, stop and tell the owner. The detail sorts shipments by `createdAt`, then `id`. Do not change the test to a sorted compare without the owner's OK.

- [ ] **Step 8: Prove the lock matters**

In `lockEntryStage`, change `const order = await this.lockOpenOrder(tx, orderId);` to read the row without the lock: `const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, select: { orderedAt: true, processId: true } });`. Run the command of Step 7 three times.
Expected: "never ships more than ordered when a split and a shipment race" fails at least once with `_sum.quantity` 16. Then undo the change exactly and run Step 7 again. Expected: 44 pass.

- [ ] **Step 9: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/test/import-orders.integration.spec.ts apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/api/src/import-orders/import-orders.router.ts && bunx biome check apps/api/test/import-orders.integration.spec.ts apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/api/src/import-orders/import-orders.router.ts`
Expected: no errors. If only import order is reported, run the same paths with `bunx biome check --write`.

---

### Task 3: Regenerate the router

**Files:**
- Modify (generated): `apps/api/src/generated/server.ts`

- [ ] **Step 1: Check the file is clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Generate**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected: a `splitShipments: publicProcedure` entry with `.input(shipmentSplitInput)` and `.output(importOrderDetailOutput)` in `importOrders`, and `shipmentSplitInput` in the contract import. Nothing else. Never edit this file by hand.

- [ ] **Step 3: Type check the API**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=@crm/db`
Expected: no errors. Do not type check the app here. Part 2 uses the new procedure.

- [ ] **Step 4: Hand over to part 2**

Tell the owner: part 1 is done, the DB spec has 16 passing tests and the API spec 44, and part 2 (`docs/superpowers/plans/2026-11-16-split-shipments-b.md`) is next.

Do not commit; the owner approves commits.

---

## Self-review (part 1)

| Brief item | Where |
| --- | --- |
| Pure `splitQuantities(remaining, perShipment, max)` with error codes, unit tests | Task 1 |
| Max 50 inside `IMPORT_ORDER` | Task 1 Step 3 `maxSplitShipments` |
| Input contract, output reuses the detail shape | Task 2 Step 4 |
| One transaction under `lockOpenOrder`, entry event with day and actor | Task 2 Step 5 `lockEntryStage`, `shipmentData` |
| `remaining` ignores cancelled shipments, reused from `lineProgress` | Task 2 Step 5; test "splits the units that a cancelled shipment freed" |
| Phase 2a rules: ordered quantity, future day, day before order, archived order, `canManageInventory` | Task 2 Step 5 (`splitQuantities`, `shipmentDay`, `lockEntryStage`, `lockOpenOrder`, `requireManager`); tests "refuses a day out of range…", permissions |
| Tests 10/1, 10/3, over 50, N larger than remaining, cancelled, member, archived | Task 2 Step 2 |
| Two-writers race, split against `createShipment` | Task 2 Step 2 and Step 8 |
| `expectOutput` on the output | `orders.splitShipments` wraps `detailOf` |
| `server.ts` regenerated, never hand-edited | Task 3 |
| Out of scope stated | Header |

**Placeholder scan.** No step says "similar to" or "TODO". Every code step holds the exact old and new text.

**Name consistency.** `splitQuantities`, `splitCount` and `SplitError` (Task 1) are imported by the service (Task 2) and by part 2. `shipmentSplitInput` and `ShipmentSplitInput` (Task 2 Step 4) are used by the router, the service and the spec. `splitShipments` is the service method, the router method and the tRPC procedure that part 2 calls. Every replaced old text was checked against the files on 2026-11-16: each occurs exactly once.

**Known risks.**
- The shipment order inside one split depends on `createdAt`, then `id`. Postgres `now()` is the same for the whole transaction, so the `cuid` order decides. Task 2 Step 7 stops if the order is wrong.
- 50 shipments write about 150 rows in one transaction. A slow database can pass the 30 second timeout. The order lock is held for that time, and other writers on the order wait.
- The test counts assume the integration spec has 36 tests and the DB spec has 11 before this plan. The other session can change them.
