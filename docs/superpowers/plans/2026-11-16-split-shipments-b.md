# Split Shipments (part 2 of 2: preview and dialog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The *Registrar envío* dialog has a toggle between *Un envío* and *Dividir en envíos separados*. The split form shows a live preview, refuses more than 50 shipments, and calls `importOrders.splitShipments`.

**Architecture:** `splitPreview` in `apps/app/lib/import-orders.ts` turns the typed size into the preview, the button label and the error, through `splitQuantities` from `@crm/db/import-order`. `SplitShipmentForm` in `shipment-dialogs.tsx` renders the form and calls the procedure. The existing form stays as it is.

**Tech Stack:** bun test, React with TanStack Query, Radix through `@crm/ui`.

Part 1: `docs/superpowers/plans/2026-11-16-split-shipments-a.md`. Run part 1 completely first. This part needs `splitQuantities`, `splitCount`, `IMPORT_ORDER.maxSplitShipments` and the regenerated `importOrders.splitShipments`. The decisions are recorded in part 1. Decisions 5, 8, 9 and 10 apply to this part.

**Out of scope (later plans):** the `Product.unitsPerShipment` prefill, the bank decision step, rejections, documents and costs. *Unidades por envío* starts at 1.

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
- **Integration specs share `crm_test`.** `apps/api/test/import-orders.integration.spec.ts` cleans up by `processId` in `afterAll`. After a failed run, run the leftover check in Task 6 Step 5 before the next run.


## File structure

| File | Responsibility |
| --- | --- |
| `apps/app/lib/import-orders.ts` | `SplitPreview`, `unitCountLabel`, `shipmentsRegisteredLabel`, `splitPreview` |
| `apps/app/test/import-orders.spec.ts` | Unit tests of the preview |
| `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx` | Mode toggle, `SplitShipmentForm` |
| `docs/imports.md` | The split rules |

---

### Task 4: The preview helper

**Files:**
- Modify: `apps/app/lib/import-orders.ts`
- Modify: `apps/app/test/import-orders.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/app/test/import-orders.spec.ts`, replace:

```ts
	readShipmentQuantities,
	unitsLabel,
} from "../lib/import-orders";
```

with:

```ts
	readShipmentQuantities,
	shipmentsRegisteredLabel,
	splitPreview,
	unitCountLabel,
	unitsLabel,
} from "../lib/import-orders";
```

Replace:

```ts
describe("choices", () => {
```

with:

```ts
describe("splitting a line", () => {
	it("describes equal shipments and the rest on the last one", () => {
		expect(splitPreview(10, "1")).toEqual({
			ok: true,
			value: {
				perShipment: 1,
				count: 10,
				summary: "Se crearán 10 envíos de 1 unidad.",
				submitLabel: "Registrar 10 envíos",
			},
		});
		expect(splitPreview(10, " 3 ")).toEqual({
			ok: true,
			value: {
				perShipment: 3,
				count: 4,
				summary: "Se crearán 4 envíos: 3 de 3 unidades y 1 de 1 unidad.",
				submitLabel: "Registrar 4 envíos",
			},
		});
		expect(splitPreview(4, "5")).toEqual({
			ok: true,
			value: {
				perShipment: 5,
				count: 1,
				summary: "Se creará 1 envío de 4 unidades.",
				submitLabel: "Registrar 1 envío",
			},
		});
	});

	it("refuses a size that is not a whole number and too many shipments", () => {
		for (const raw of ["", "0", "1.5", "-2", "dos"]) {
			expect(splitPreview(10, raw)).toEqual({
				ok: false,
				error: "Escribe un número entero mayor que cero.",
			});
		}
		expect(splitPreview(60, "1")).toEqual({
			ok: false,
			error:
				"Se crearían 60 envíos. El máximo es 50. Sube las unidades por envío.",
		});
		expect(splitPreview(0, "1")).toEqual({
			ok: false,
			error: "Esta línea no tiene unidades pendientes.",
		});
	});

	it("counts units and registered shipments", () => {
		expect(unitCountLabel(1)).toBe("1 unidad");
		expect(unitCountLabel(3)).toBe("3 unidades");
		expect(shipmentsRegisteredLabel(1)).toBe("1 envío registrado.");
		expect(shipmentsRegisteredLabel(10)).toBe("10 envíos registrados.");
	});
});

describe("choices", () => {
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts`
Expected: FAIL. `splitPreview` is not exported.

- [ ] **Step 3: Add the helper**

In `apps/app/lib/import-orders.ts`, replace:

```ts
import { ImportStageKind } from "@crm/db/enums";
import { isClosedImportKind } from "@crm/db/import-stage";
```

with:

```ts
import { ImportStageKind } from "@crm/db/enums";
import {
	IMPORT_ORDER,
	splitCount,
	splitQuantities,
} from "@crm/db/import-order";
import { isClosedImportKind } from "@crm/db/import-stage";
```

Replace:

```ts
export function moveTargets(
```

with:

```ts
export type SplitPreview = {
	perShipment: number;
	count: number;
	summary: string;
	submitLabel: string;
};

export function unitCountLabel(units: number): string {
	return units === 1 ? "1 unidad" : `${units} unidades`;
}

export function shipmentsRegisteredLabel(count: number): string {
	return count === 1 ? "1 envío registrado." : `${count} envíos registrados.`;
}

export function splitPreview(
	remaining: number,
	raw: string,
): Parsed<SplitPreview> {
	const perShipment = wholeNumber(raw);
	if (perShipment === null || perShipment < 1) {
		return { ok: false, error: "Escribe un número entero mayor que cero." };
	}
	const split = splitQuantities(
		remaining,
		perShipment,
		IMPORT_ORDER.maxSplitShipments,
	);
	if (!split.ok) {
		return {
			ok: false,
			error:
				split.error === "TOO_MANY"
					? `Se crearían ${splitCount(remaining, perShipment)} envíos. El máximo es ${IMPORT_ORDER.maxSplitShipments}. Sube las unidades por envío.`
					: "Esta línea no tiene unidades pendientes.",
		};
	}
	const count = split.quantities.length;
	const first = split.quantities[0] ?? 0;
	const last = split.quantities.at(-1) ?? 0;
	const summary =
		first === last
			? `${count === 1 ? "Se creará" : "Se crearán"} ${shipmentsLabel(count)} de ${unitCountLabel(first)}.`
			: `Se crearán ${shipmentsLabel(count)}: ${count - 1} de ${unitCountLabel(first)} y 1 de ${unitCountLabel(last)}.`;
	return {
		ok: true,
		value: {
			perShipment,
			count,
			summary,
			submitLabel: `Registrar ${shipmentsLabel(count)}`,
		},
	};
}

export function moveTargets(
```

`shipmentsLabel` is declared lower in the same module. A function declaration is hoisted, so the call works.

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts test/import-order-pages.spec.ts`
Expected: 16 and 13 pass, 0 fail.

- [ ] **Step 5: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts && bunx biome check apps/app/lib/import-orders.ts apps/app/test/import-orders.spec.ts`
Expected: no errors.

---

### Task 5: The split mode in the dialog

**Files:**
- Modify: `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`

`order-view.tsx` does not change. It opens `NewShipmentDialog` with the order, as today.

- [ ] **Step 1: Imports and the mode type**

In `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`, replace:

```tsx
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
```

with:

```tsx
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@crm/ui/components/field";
```

Replace:

```tsx
import { Spinner } from "@crm/ui/components/spinner";
```

with:

```tsx
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
```

Replace:

```tsx
	moveTargets,
	readShipmentQuantities,
} from "@/lib/import-orders";
```

with:

```tsx
	moveTargets,
	readShipmentQuantities,
	shipmentsRegisteredLabel,
	splitPreview,
} from "@/lib/import-orders";
```

Replace:

```tsx
const onError = (error: { message: string }) => toast.error(error.message);
```

with:

```tsx
const onError = (error: { message: string }) => toast.error(error.message);

type ShipmentMode = "one" | "split";

function isShipmentMode(value: string): value is ShipmentMode {
	return value === "one" || value === "split";
}
```

- [ ] **Step 2: The toggle around the existing form**

Replace:

```tsx
	const [linesError, setLinesError] = useState<string | null>(null);
```

with:

```tsx
	const [linesError, setLinesError] = useState<string | null>(null);
	const [mode, setMode] = useState<ShipmentMode>("one");
```

Replace:

```tsx
					<DialogDescription>
						Indica cuántas unidades salen en este envío. Es una parte de la
						orden, no una orden nueva.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-shipment-form"
```

with:

```tsx
					<DialogDescription>
						{mode === "one"
							? "Indica cuántas unidades salen en este envío. Es una parte de la orden, no una orden nueva."
							: "Divide una línea en envíos separados. Cada envío recorre el proceso por su cuenta y lleva sus propios papeles."}
					</DialogDescription>
				</DialogHeader>

				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					spacing={0}
					value={mode}
					onValueChange={(next) => {
						if (isShipmentMode(next)) setMode(next);
					}}
					aria-label="Cómo registrar el envío"
				>
					<ToggleGroupItem value="one">Un envío</ToggleGroupItem>
					<ToggleGroupItem value="split">
						Dividir en envíos separados
					</ToggleGroupItem>
				</ToggleGroup>

				{mode === "split" ? (
					<SplitShipmentForm order={order} onClose={onClose} />
				) : (
					<>
				<form
					id="new-shipment-form"
```

Replace:

```tsx
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Registrar envío
					</Button>
				</DialogFooter>
			</DialogContent>
```

with:

```tsx
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Registrar envío
					</Button>
				</DialogFooter>
					</>
				)}
			</DialogContent>
```

`onValueChange` gives `""` when the active item is clicked again. The guard keeps the mode.

- [ ] **Step 3: The split form**

Replace:

```tsx
export function MoveShipmentDialog({
```

with:

```tsx
function SplitShipmentForm({
	order,
	onClose,
}: {
	order: ImportOrderDetail;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const lineId = useId();
	const sizeId = useId();
	const dateId = useId();
	const referenceId = useId();
	const open = order.lines.filter((line) => line.remaining > 0);
	const [today] = useState(() => utcDay());
	const [orderLineId, setOrderLineId] = useState(open[0]?.id ?? "");
	const [perShipment, setPerShipment] = useState("1");
	const [occurredAt, setOccurredAt] = useState(today);
	const [reference, setReference] = useState("");
	const line = open.find((item) => item.id === orderLineId);
	const plan = line ? splitPreview(line.remaining, perShipment) : null;
	const preview = plan?.ok ? plan.value : null;
	const sizeError = plan && !plan.ok ? plan.error : null;

	const split = useMutation(
		trpc.importOrders.splitShipments.mutationOptions({
			onSuccess: async (after) => {
				await cache.importOrders();
				toast.success(
					shipmentsRegisteredLabel(
						after.shipments.length - order.shipments.length,
					),
				);
				onClose();
			},
			onError,
		}),
	);

	return (
		<>
			<form
				id="split-shipment-form"
				noValidate
				onInput={validation.onInput}
				onSubmit={(event) => {
					event.preventDefault();
					if (split.isPending || !line || !preview) return;
					const errors: Record<string, string> = {};
					if (occurredAt === "") errors[dateId] = "Elige una fecha.";
					if (!validation.validate(event.currentTarget, errors)) return;
					split.mutate({
						orderId: order.id,
						orderLineId: line.id,
						perShipment: preview.perShipment,
						reference,
						occurredAt,
					});
				}}
			>
				<FieldGroup>
					<Field>
						{open.length > 1 ? (
							<>
								<FieldLabel htmlFor={lineId}>Línea</FieldLabel>
								<Select value={orderLineId} onValueChange={setOrderLineId}>
									<SelectTrigger id={lineId} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{open.map((item) => (
											<SelectItem key={item.id} value={item.id}>
												{`${item.productName}, ${item.sku}`}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</>
						) : (
							<FieldTitle>
								{line ? `${line.productName}, ${line.sku}` : null}
							</FieldTitle>
						)}
						{line ? (
							<FieldDescription>
								{`Quedan ${line.remaining} de ${line.quantity} unidades por enviar.`}
							</FieldDescription>
						) : null}
					</Field>

					<Field data-invalid={sizeError !== null}>
						<FieldLabel htmlFor={sizeId}>Unidades por envío</FieldLabel>
						<Input
							id={sizeId}
							inputMode="numeric"
							value={perShipment}
							onChange={(event) => setPerShipment(event.target.value)}
							aria-invalid={sizeError !== null}
							aria-describedby={sizeError ? `${sizeId}-error` : undefined}
							autoComplete="off"
						/>
						<FieldError id={`${sizeId}-error`}>{sizeError}</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[dateId]}>
						<FieldLabel htmlFor={dateId}>Fecha de registro</FieldLabel>
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
						<FieldLabel htmlFor={referenceId}>Referencia (opcional)</FieldLabel>
						<Input
							id={referenceId}
							value={reference}
							onChange={(event) => setReference(event.target.value)}
							maxLength={IMPORT_ORDER.referenceMaxLength}
							autoComplete="off"
						/>
						<FieldDescription>
							Se copia en cada envío. El número de guía se carga después en
							cada envío.
						</FieldDescription>
					</Field>
				</FieldGroup>
			</form>

			<DialogFooter>
				<p
					aria-live="polite"
					className="text-13 text-muted-foreground sm:mr-auto"
				>
					{preview?.summary}
				</p>
				<Button variant="outline" onClick={onClose}>
					Cancelar
				</Button>
				<Button
					type="submit"
					form="split-shipment-form"
					disabled={split.isPending || preview === null}
				>
					{split.isPending ? <Spinner data-icon="inline-start" /> : null}
					{preview?.submitLabel ?? "Registrar envíos"}
				</Button>
			</DialogFooter>
		</>
	);
}

export function MoveShipmentDialog({
```

Every class string here already exists in this file (`w-full` on `SelectTrigger`, the footer `p`). No new look.

- [ ] **Step 4: Type check and format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors. If `trpc.importOrders.splitShipments` is unknown, Task 3 did not run.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write "apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx" && bunx biome check "apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx"`
Expected: no errors.

---

### Task 6: Docs and verification

**Files:**
- Modify: `docs/imports.md`

- [ ] **Step 1: Check the doc is as this plan expects**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n "A stage move locks the .shipment. row|holds the create, move and data dialogs" docs/imports.md`
Expected: two lines. If not, stop and ask the owner.

- [ ] **Step 2: Add the split rules**

In `docs/imports.md`, replace:

```md
- A stage move locks the `shipment` row, not the order row. It writes no line.
```

with:

```md
- A stage move locks the `shipment` row, not the order row. It writes no line.
- `importOrders.splitShipments` splits one order line. The user gives N units per
  shipment. It creates `ceil(remaining / N)` shipments of N units. The last one takes
  the rest. `splitQuantities` in `packages/db/src/import-order.ts` owns the rule.
- A split creates at most `IMPORT_ORDER.maxSplitShipments` (50) shipments. More is
  refused and nothing is written. N larger than `remaining` gives one shipment.
- A split takes the order lock first, through `lockEntryStage`, like `createShipment`.
  It reads `remaining` with `lineProgress`, so a cancelled shipment frees its units.
- Each split shipment gets its own entry event with the chosen day and the actor. The
  reference is copied to every shipment. A split sets no tracking number.
- The split transaction has a timeout of `IMPORT_ORDER.splitTimeoutMs`. It writes the
  shipments one by one, in order.
```

Replace:

```md
  `shipment-dialogs.tsx` holds the create, move and data dialogs.
```

with:

```md
  `shipment-dialogs.tsx` holds the create, move and data dialogs. The create dialog has
  two modes: *Un envío* and *Dividir en envíos separados*. The split preview and its
  labels come from `splitPreview`.
```

- [ ] **Step 3: Type check and lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=app && bun run check-types --filter=@crm/db`
Expected: no errors.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run lint && bun run lint:slop`
Expected: no finding in a file this plan touched. A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 4: Run every test of this plan**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-order.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-orders.spec.ts test/import-order-pages.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`

Expected: all green. DB: 16. App: 16 and 13. API: 44.

- [ ] **Step 5: Check for leftover rows in `crm_test`**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun --env-file=../../.env -e 'import pg from "pg"; const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect(); const processes = await client.query("SELECT id, name FROM import_process WHERE id <> $1", ["import_process_standard"]); const orders = await client.query("SELECT number FROM purchase_order"); const shipments = await client.query("SELECT id FROM shipment"); console.log(processes.rows, orders.rows, shipments.rows); await client.end();'`
Expected: `[] [] []`. Any row means a spec did not clean up. Report it to the owner with the row names. Do not delete rows by hand without the owner's OK.

- [ ] **Step 6: Browser checklist for the owner**

Give the owner this list. Do not mark the plan closed without it.

1. Sign in as owner. Open an order with one line of 10 units and no shipment. Click *Registrar envío*.
2. The dialog shows a toggle with *Un envío* active. The form is the one of today. Register 2 units. A toast says *Envío registrado en la etapa de entrada.*
3. Open the dialog again. Click *Dividir en envíos separados*. The description changes. The form names the product and says *Quedan 8 de 10 unidades por enviar.* There is no line selector.
4. *Unidades por envío* shows 1. The footer says *Se crearán 8 envíos de 1 unidad.* The button says *Registrar 8 envíos*.
5. Type 3. The footer says *Se crearán 3 envíos: 2 de 3 unidades y 1 de 2 unidades.* The button says *Registrar 3 envíos*.
6. Type 0, then 1.5, then clear the field. The field says *Escribe un número entero mayor que cero.* The button is disabled and says *Registrar envíos*.
7. On an order line of 60 units, type 1. The field says *Se crearían 60 envíos. El máximo es 50. Sube las unidades por envío.* The button is disabled.
8. Type 1 on the order of step 3. Write reference *LOTE-7*. Click *Registrar 8 envíos*. A toast says *8 envíos registrados.* The dialog closes. The page shows 9 shipment cards without a reload.
9. Each new card has its own path with *Pedido* current, *Referencia LOTE-7* and *Sin guía*. *Avanzar* on one card moves only that card.
10. Click *Editar* on one card and save a tracking number. Only that card shows *Guía …*.
11. On an order with two lines with remaining units, the split form shows a *Línea* selector. Changing the line changes *Quedan …* and the preview.
12. Cancel one split shipment through *Avanzar* and *Cancelado*. Open the dialog. The freed unit is in *Quedan …* and can split again.
13. Pick a date before the order date. The browser refuses it. Pick today and register.
14. Click *Dividir en envíos separados* again while it is active. The mode stays.
15. Archive the order. *Registrar envío* is disabled.
16. Sign in as a member. *Registrar envío* is disabled.
17. Resize to 390 px. The toggle, the fields and the footer fit. The page does not scroll sideways.
18. Tab through the dialog. The toggle is reached with the keyboard, and arrow keys move between its two options. A screen reader reads the preview line when it changes.
19. Switch to dark mode. The toggle and the preview keep contrast.

Do not commit; the owner approves commits.

---

## Self-review (part 2)

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
| Client preview helper with unit tests | Task 4 |
| Toggle, line select only for many lines, units field, live preview, date, reference, live button count, error over 50, toast, cache refresh | Task 5; checklist 2 to 14 |
| No `useEffect`, shared components only | Task 5 |
| Reference copied, tracking number later | Decision 5; Task 2 test 1; Task 6 Step 2 |
| Docs | Task 6 Step 2 |
| Verification and browser checklist | Task 6 Steps 3 to 6 |
| Out of scope stated | Header |

**Placeholder scan.** No step says "similar to" or "TODO". Every code step holds the exact old and new text.

**Name consistency.** `splitQuantities`, `splitCount`, `SplitError` (Task 1) are imported by the service (Task 2) and the helper (Task 4). `shipmentSplitInput` and `ShipmentSplitInput` (Task 2 Step 4) are used by the router, the service and the spec. `splitShipments` is the service method, the router method and the tRPC procedure. `splitPreview`, `shipmentsRegisteredLabel` and `unitCountLabel` (Task 4) are used in Task 5. Every replaced old text was checked against the files on 2026-11-16 with `rg`.

**Known risks.**
- The shipment order inside one split depends on `createdAt`, then `id`. Postgres `now()` is the same for the whole transaction, so the `cuid` order decides. Task 2 Step 7 stops if the order is wrong.
- 50 shipments write about 150 rows in one transaction. A slow database can pass the 30 second timeout. The order lock is held for that time, and other writers on the order wait.
- The *Un envío* body keeps its indentation inside the new fragment until `biome format` runs. Format before you read the diff.
- The test count assumes the integration spec has 36 tests and the app spec has 13 before this plan. The other session can change both.
