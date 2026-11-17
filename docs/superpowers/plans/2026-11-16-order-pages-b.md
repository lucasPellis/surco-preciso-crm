# Order Pages (part 2 of 2: pages, cleanup and docs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/imports/new` and `/imports/[orderId]/edit` show one two-column form with an editable lines table and a sticky summary. `/imports/[orderId]` shows the order, the route of its process, the lines with bars, and one card per shipment with its path and the actions *Avanzar* and *Editar*. The side sheets are gone. `/imports` links to the new pages. `docs/imports.md` describes them.

**Architecture:** Each page is a server page that prefetches with `getServerTrpc` and hydrates one client component, as `apps/app/app/(app)/[slug]/settings/import-processes/[processId]/page.tsx` does. `order-form.tsx` holds `OrderForm` and `EditOrderForm`. `[orderId]/order-view.tsx` holds the order page. Both read the helpers of part 1 from `@/lib/import-orders` and render `ProcessPath`. The shipment dialogs stay in `shipment-dialogs.tsx`. The move dialog gets an `initialKey` prop so *Avanzar* opens it on the next step.

**Tech Stack:** Next.js (app router, `params` is a `Promise`), TanStack Query with tRPC, shadcn components from `packages/ui`, bun test.

Spec: `docs/superpowers/specs/2026-11-16-order-pages-design.md`. Part 1: `docs/superpowers/plans/2026-11-16-order-pages-a.md`. Run part 1 completely first. Its decisions apply here.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish. No voseo: "Elige", never "Elegí"; "Restáurala", never "Restaurala".
- Do not read `.env`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument and quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** The owner approves commits. No `git add`, no `git mv`, no `git rm`, no `git commit`, no `Co-Authored-By`. Remove files with `rm`.
- Another session edits `apps/app`. Before you edit a shared file (`orders-table.tsx`, `shipment-dialogs.tsx`, `docs/imports.md`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- A `"use client"` file imports only `@crm/ui`, the tRPC client, React, `next/link`, `next/navigation`, `sonner`, `lucide-react`, `@/lib/*` client modules and the enum-only subpaths `@crm/db/enums`, `@crm/db/import-stage` and `@crm/db/import-order`. Never `@crm/auth` or the `@crm/db` barrel.
- UI comes from `packages/ui`. Semantic tokens and the scale only. No literal colours, radii or shadows. Separate inline items with `MetaRow`. `className` on a shared component sets layout only (width, grid, gap), never its look.
- One filled button per page: *Crear orden* or *Guardar cambios* on the form, *Nuevo envío* on the order page. Every other button is outline or ghost.
- `noUncheckedIndexedAccess` is on.

## Decisions recorded in this plan

1. **Enter in a quantity or cost field never submits.** In the last row it adds a row and focuses its product. In another row it focuses the product of the next row.
2. **Focus after adding a row uses `flushSync`.** The new combobox exists right after the state update, so no effect is needed (`.agents/skills/no-use-effect`).
3. **Product and deal are `Combobox` from `@crm/ui/components/combobox`.** A catalogue of up to 500 products needs search. `Select` has none.
4. **The edit page refuses an archived order on screen.** It shows *La orden está archivada. Restáurala para editarla.* The server refuses it too.
5. **A member who opens `/imports/new` by URL sees the form.** The server refuses the create, and a toast shows the message. `options` carries no `canManage`, and adding it is out of scope.
6. **The order page header has no prefetch of the title.** The client renders the number after hydration. The server page has the static title *Orden de compra*.
7. **No quick-switcher entry and no nav change.** *Importaciones* matches `/imports` by prefix, so it stays active on the new pages.
8. **Shipped units use `CHART_CONFIG.fallback`, received units use `CHART_CONFIG.trend.won`** in `ValueMeter`. Received is the success colour. Both come from `packages/ui`.

## File structure

| File | Responsibility |
| --- | --- |
| `apps/app/app/(app)/[slug]/imports/order-form.tsx` | `OrderForm` (create and edit), `EditOrderForm` |
| `apps/app/app/(app)/[slug]/imports/new/page.tsx` | Server page of the create form |
| `apps/app/app/(app)/[slug]/imports/[orderId]/edit/page.tsx` | Server page of the edit form |
| `apps/app/app/(app)/[slug]/imports/[orderId]/page.tsx` | Server page of one order |
| `apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx` | `OrderView`: header, route, lines, shipment cards, dialogs |
| `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx` | `MoveShipmentDialog` gets `initialKey` |
| `apps/app/app/(app)/[slug]/imports/orders-table.tsx` | Rows open the order page. *Nueva orden* opens `/imports/new` |
| `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx` | Removed |
| `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx` | Removed |
| `docs/imports.md` | The pages |

---

### Task 4: The create and edit form

**Files:**
- Create: `apps/app/app/(app)/[slug]/imports/order-form.tsx`
- Create: `apps/app/app/(app)/[slug]/imports/new/page.tsx`
- Create: `apps/app/app/(app)/[slug]/imports/[orderId]/edit/page.tsx`

- [ ] **Step 1: Check part 1 is done**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'export function (routePreview|draftTotals|lineSubtotalCents)' apps/app/lib/import-orders.ts && rg -n 'function ProcessPath' packages/ui/src/components/process-path.tsx`
Expected: four lines. If any is missing, part 1 has not run. Stop.

- [ ] **Step 2: Write the form**

Create `apps/app/app/(app)/[slug]/imports/order-form.tsx`:

```tsx
"use client";

import { IMPORT_ORDER } from "@crm/db/import-order";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Combobox, type ComboboxOption } from "@crm/ui/components/combobox";
import { useDiscardChanges } from "@crm/ui/components/discard-changes";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { useFormSheetValidation } from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import { PageSection } from "@crm/ui/components/page-section";
import { ProcessPath } from "@crm/ui/components/process-path";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { Textarea } from "@crm/ui/components/textarea";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	type FormEvent,
	type KeyboardEvent,
	useId,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import {
	blankDraft,
	costFromCents,
	dealChoices,
	dealLabel,
	defaultProcessId,
	draftFromLine,
	draftTotals,
	type ImportOrderDetail,
	type LineDraft,
	lineSubtotalCents,
	NO_DEAL,
	processChoices,
	processLabel,
	productChoices,
	productLabel,
	readLineDrafts,
	routePreview,
} from "@/lib/import-orders";
import { utcDay } from "@/lib/import-stage-settings";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const LINE_COLUMNS: SimpleTableColumn[] = [
	{ id: "product", header: "Producto", className: "min-w-64" },
	{ id: "quantity", header: "Cantidad", width: "w-28" },
	{ id: "cost", header: "Costo unitario (USD)", width: "w-36" },
	{ id: "subtotal", header: "Subtotal", align: "right", width: "w-32" },
	{ id: "deal", header: "Oportunidad", className: "min-w-56" },
	{ id: "remove", srLabel: "Quitar línea", width: "w-12" },
];

const NUMBER = "text-right tabular-nums";

export function EditOrderForm({ orderId }: { orderId: string }) {
	const trpc = useTRPC();
	const detail = useQuery(trpc.importOrders.byId.queryOptions({ id: orderId }));
	const order = detail.data;

	if (order) {
		return order.archivedAt === null ? (
			<OrderForm order={order} />
		) : (
			<p className="text-muted-foreground">
				La orden está archivada. Restáurala para editarla.
			</p>
		);
	}
	if (detail.isError) {
		return <p className="text-muted-foreground">{detail.error.message}</p>;
	}
	return (
		<div className="flex justify-center p-6">
			<Spinner />
		</div>
	);
}

export function OrderForm({ order }: { order: ImportOrderDetail | null }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const url = useWorkspaceUrl();
	const validation = useFormSheetValidation();
	const options = useQuery(trpc.importOrders.options.queryOptions());

	const [today] = useState(() => utcDay());
	const [supplierName, setSupplierName] = useState(order?.supplierName ?? "");
	const [orderedAt, setOrderedAt] = useState(order?.orderedAt ?? today);
	const [notes, setNotes] = useState(order?.notes ?? "");
	const [processId, setProcessId] = useState(order?.process.id ?? "");
	const [lines, setLines] = useState<LineDraft[]>(() =>
		order ? order.lines.map(draftFromLine) : [blankDraft(crypto.randomUUID())],
	);
	const [linesError, setLinesError] = useState<string | null>(null);
	const productButtons = useRef(new Map<string, HTMLButtonElement>());

	const snapshot = JSON.stringify({
		supplierName,
		orderedAt,
		notes,
		processId,
		lines,
	});
	const [initial] = useState(snapshot);

	const supplierId = useId();
	const dateId = useId();
	const notesId = useId();
	const processFieldId = useId();

	const editing = order !== null;
	const savedLines = order?.lines ?? [];
	const products = productChoices(options.data?.products ?? [], savedLines);
	const deals = dealChoices(options.data?.deals ?? [], savedLines);
	const processes = processChoices(
		options.data?.processes ?? [],
		order?.process ?? null,
	);
	const chosenProcessId =
		processId === "" ? defaultProcessId(processes) : processId;
	const processLocked = (order?.shipments.length ?? 0) > 0;
	const route = routePreview(
		order !== null && chosenProcessId === order.process.id
			? order.stages
			: (processes.find((item) => item.id === chosenProcessId)?.stages ?? []),
	);
	const totals = draftTotals(lines);
	const hasShipped = lines.some((line) => line.shipped > 0);
	const productOptions: ComboboxOption[] = products.map((product) => ({
		value: product.id,
		label: productLabel(product),
	}));
	const dealOptions: ComboboxOption[] = [
		{ value: NO_DEAL, label: "Sin oportunidad" },
		...deals.map((deal) => ({ value: deal.id, label: dealLabel(deal) })),
	];
	const backHref = order ? url(`/imports/${order.id}`) : url("/imports");

	const onSuccess = async (saved: ImportOrderDetail) => {
		await cache.importOrders();
		toast.success(
			editing ? "Orden actualizada." : `Orden ${saved.number} creada.`,
		);
		router.push(url(`/imports/${saved.id}`));
	};
	const onError = (error: { message: string }) => toast.error(error.message);

	const create = useMutation(
		trpc.importOrders.create.mutationOptions({ onSuccess, onError }),
	);
	const update = useMutation(
		trpc.importOrders.update.mutationOptions({ onSuccess, onError }),
	);
	const pending = create.isPending || update.isPending;
	const done = create.isSuccess || update.isSuccess;

	const leave = useDiscardChanges({
		open: true,
		dirty: snapshot !== initial,
		pending,
		onOpenChange: () => router.push(backHref),
	});

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
				cost === "" && product
					? costFromCents(product.referenceCostCents)
					: cost,
		});
	};

	const addLine = () => {
		if (lines.length >= IMPORT_ORDER.maxLines) return;
		const key = crypto.randomUUID();
		setLinesError(null);
		flushSync(() => setLines((current) => [...current, blankDraft(key)]));
		productButtons.current.get(key)?.focus();
	};

	const removeLine = (key: string) => {
		setLinesError(null);
		setLines((current) => current.filter((line) => line.key !== key));
	};

	const onLineKeyDown = (
		event: KeyboardEvent<HTMLInputElement>,
		index: number,
	) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		const next = lines[index + 1];
		if (next) productButtons.current.get(next.key)?.focus();
		else addLine();
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending || done) return;
		const errors: Record<string, string> = {};
		if (supplierName.trim() === "")
			errors[supplierId] = "Escribe el proveedor.";
		if (orderedAt === "") errors[dateId] = "Elige una fecha.";
		if (chosenProcessId === "") errors[processFieldId] = "Elige un proceso.";
		const parsed = readLineDrafts(lines);
		setLinesError(parsed.ok ? null : parsed.error);
		if (!validation.validate(event.currentTarget, errors) || !parsed.ok)
			return;
		const values = {
			supplierName,
			orderedAt,
			notes,
			processId: chosenProcessId,
			lines: parsed.value,
		};
		if (order) update.mutate({ id: order.id, ...values });
		else create.mutate(values);
	};

	return (
		<>
			<form
				id="import-order-form"
				noValidate
				onInput={validation.onInput}
				onSubmit={submit}
				className="flex flex-col gap-8 lg:flex-row lg:items-start"
			>
				<div className="flex min-w-0 flex-1 flex-col gap-8">
					<PageSection title="Datos">
						<FieldGroup>
							<div className="grid gap-4 sm:grid-cols-2">
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
							</div>

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
								<FieldDescription>
									{processLocked
										? "La orden ya tiene envíos. El proceso no cambia."
										: "El proceso fija las etapas por las que pasa cada envío."}
								</FieldDescription>
								<FieldError id={`${processFieldId}-error`}>
									{validation.errors[processFieldId]}
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
						</FieldGroup>
					</PageSection>

					<PageSection
						title="Líneas"
						description="Cada línea es un producto con su cantidad y su costo unitario en USD. Una línea puede apartar las unidades para una oportunidad abierta. Enter en la última línea agrega otra."
						action={
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={lines.length >= IMPORT_ORDER.maxLines}
								onClick={addLine}
							>
								<PlusIcon data-icon="inline-start" />
								Agregar línea
							</Button>
						}
					>
						<SimpleTable columns={LINE_COLUMNS}>
							{lines.map((line, index) => {
								const position = index + 1;
								const subtotal = lineSubtotalCents(line);
								return (
									<SimpleTableRow key={line.key}>
										<TableCell>
											<Combobox
												ref={(node) => {
													if (node) productButtons.current.set(line.key, node);
													return () => {
														productButtons.current.delete(line.key);
													};
												}}
												aria-label={`Producto de la línea ${position}`}
												className="w-full"
												options={productOptions}
												value={line.productId}
												disabled={line.shipped > 0}
												onValueChange={(value) => pickProduct(line.key, value)}
												placeholder="Elige un producto"
												searchPlaceholder="Buscar por SKU o nombre…"
												empty="Ningún producto coincide."
											/>
										</TableCell>
										<TableCell>
											<Input
												aria-label={`Cantidad de la línea ${position}`}
												inputMode="numeric"
												value={line.quantity}
												onChange={(event) =>
													change(line.key, { quantity: event.target.value })
												}
												onKeyDown={(event) => onLineKeyDown(event, index)}
												autoComplete="off"
											/>
										</TableCell>
										<TableCell>
											<Input
												aria-label={`Costo unitario de la línea ${position}`}
												inputMode="decimal"
												placeholder="0.00"
												value={line.cost}
												onChange={(event) =>
													change(line.key, { cost: event.target.value })
												}
												onKeyDown={(event) => onLineKeyDown(event, index)}
												autoComplete="off"
											/>
										</TableCell>
										<TableCell className={NUMBER}>
											{subtotal === null ? (
												<EmptyCellValue />
											) : (
												formatMoney(subtotal)
											)}
										</TableCell>
										<TableCell>
											<Combobox
												aria-label={`Oportunidad de la línea ${position}`}
												className="w-full"
												options={dealOptions}
												value={line.dealId}
												onValueChange={(value) =>
													change(line.key, { dealId: value })
												}
												searchPlaceholder="Buscar oportunidad…"
												empty="Ninguna oportunidad coincide."
											/>
										</TableCell>
										<TableCell>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={`Quitar la línea ${position}`}
												disabled={lines.length === 1 || line.shipped > 0}
												onClick={() => removeLine(line.key)}
											>
												<Trash2Icon />
											</Button>
										</TableCell>
									</SimpleTableRow>
								);
							})}
						</SimpleTable>
						{hasShipped ? (
							<p className="text-13 text-muted-foreground">
								Una línea con unidades enviadas mantiene su producto y no se
								quita. Su cantidad no baja de lo enviado.
							</p>
						) : null}
						{linesError ? <FieldError>{linesError}</FieldError> : null}
					</PageSection>
				</div>

				<aside
					aria-label="Resumen de la orden"
					className="flex flex-col lg:sticky lg:top-6 lg:w-80 lg:shrink-0"
				>
					<Card>
						<CardHeader>
							<CardTitle>{order ? order.number : "Resumen"}</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="flex flex-col gap-2">
								<div className="flex items-baseline justify-between gap-3">
									<dt className="text-muted-foreground">Total (USD)</dt>
									<dd className="font-semibold text-2xl tabular-nums">
										{formatMoney(totals.cents)}
									</dd>
								</div>
								<div className="flex items-baseline justify-between gap-3">
									<dt className="text-muted-foreground">Unidades</dt>
									<dd className="tabular-nums">{totals.units}</dd>
								</div>
								<div className="flex items-baseline justify-between gap-3">
									<dt className="text-muted-foreground">Líneas</dt>
									<dd className="tabular-nums">{lines.length}</dd>
								</div>
							</dl>

							{route.length === 0 ? (
								<p className="text-13 text-muted-foreground">
									Elige un proceso para ver su recorrido.
								</p>
							) : (
								<div className="flex flex-col gap-2">
									<p className="text-13 text-muted-foreground">
										Cada envío recorre estas etapas.
									</p>
									<ProcessPath label="Recorrido del proceso" steps={route} />
								</div>
							)}

							<div className="flex flex-col gap-2">
								<Button
									type="submit"
									disabled={pending || done || options.isPending}
								>
									{pending ? <Spinner data-icon="inline-start" /> : null}
									{editing ? "Guardar cambios" : "Crear orden"}
								</Button>
								<Button
									type="button"
									variant="outline"
									disabled={pending}
									onClick={() => leave.onOpenChange(false)}
								>
									Cancelar
								</Button>
							</div>
						</CardContent>
					</Card>
				</aside>
			</form>
			{leave.dialog}
		</>
	);
}
```

- [ ] **Step 3: Write the create page**

Create `apps/app/app/(app)/[slug]/imports/new/page.tsx`:

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
import { OrderForm } from "../order-form";

export const metadata: Metadata = {
	title: "Nueva orden de compra",
};

export default function NewOrderPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Nueva orden de compra</PageShellTitle>
					<PageShellDescription>
						El número de la orden se asigna al crearla. Después de crearla, la
						orden se sigue envío por envío.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<NewOrder />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function NewOrder() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.importOrders.options.queryOptions());

	return (
		<HydrateClient>
			<OrderForm order={null} />
		</HydrateClient>
	);
}
```

- [ ] **Step 4: Write the edit page**

Create `apps/app/app/(app)/[slug]/imports/[orderId]/edit/page.tsx`:

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
import { EditOrderForm } from "../../order-form";

type OrderParams = Promise<{ slug: string; orderId: string }>;

export const metadata: Metadata = {
	title: "Editar orden de compra",
};

export default function EditOrderPage({ params }: { params: OrderParams }) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Editar orden de compra</PageShellTitle>
					<PageShellDescription>
						Los cambios valen para los datos y las líneas. Los envíos no
						cambian.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<EditOrder params={params} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function EditOrder({ params }: { params: OrderParams }) {
	await requireSession();
	const { orderId } = await params;

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.importOrders.byId.queryOptions({ id: orderId }),
		),
		queryClient.prefetchQuery(trpc.importOrders.options.queryOptions()),
	]);

	return (
		<HydrateClient>
			<EditOrderForm orderId={orderId} />
		</HydrateClient>
	);
}
```

- [ ] **Step 5: Type check the app**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors. A prop mismatch on `Combobox` (`ref`, `aria-label`, `disabled`) shows here. `Combobox` spreads its other props onto its trigger button, so all three are valid. Fix a mismatch in `order-form.tsx`, never in `packages/ui`.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write "apps/app/app/(app)/[slug]/imports/order-form.tsx" "apps/app/app/(app)/[slug]/imports/new/page.tsx" "apps/app/app/(app)/[slug]/imports/[orderId]/edit/page.tsx" && bunx biome check "apps/app/app/(app)/[slug]/imports/order-form.tsx" "apps/app/app/(app)/[slug]/imports/new/page.tsx" "apps/app/app/(app)/[slug]/imports/[orderId]/edit/page.tsx"`
Expected: no errors.

Until Task 5 is done, a save opens `/imports/[orderId]`, which is not found yet. That is expected.

Do not commit; the owner approves commits.

---

### Task 5: The order page

**Files:**
- Modify: `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`
- Create: `apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx`
- Create: `apps/app/app/(app)/[slug]/imports/[orderId]/page.tsx`

- [ ] **Step 1: Let the move dialog open on a chosen step**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- "apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx"`
Expected: no output. If there is output, stop and ask the owner.

In `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`, replace:

```tsx
export function MoveShipmentDialog({
	shipment,
	stages,
	onClose,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	onClose: () => void;
}) {
```

with:

```tsx
export function MoveShipmentDialog({
	shipment,
	stages,
	initialKey = null,
	onClose,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	initialKey?: string | null;
	onClose: () => void;
}) {
```

Replace:

```tsx
	const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
```

with:

```tsx
	const [targetKey, setTargetKey] = useState(
		initialKey ?? targets[0]?.key ?? "",
	);
```

- [ ] **Step 2: Write the order view**

Create `apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx`:

```tsx
"use client";

import { isClosedImportKind } from "@crm/db/import-stage";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { MetaRow } from "@crm/ui/components/meta-row";
import { PageSection } from "@crm/ui/components/page-section";
import {
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import { ProcessPath } from "@crm/ui/components/process-path";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { ValueMeter } from "@crm/ui/components/value-meter";
import { CHART_CONFIG, type ChartColor } from "@crm/ui/lib/chart-config";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { STAGE_TONE_STATUS } from "@/lib/deal-stage-config";
import {
	daysLabel,
	formatDay,
	type ImportOrderDetail,
	type ImportShipment,
	type ImportStageOption,
	nextStageKey,
	orderPath,
	orderStatusLabel,
	orderTotals,
	shareOf,
	shipmentPath,
	unitsLabel,
} from "@/lib/import-orders";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import {
	MoveShipmentDialog,
	NewShipmentDialog,
	ShipmentInfoDialog,
} from "../shipment-dialogs";

const NUMBER = "text-right tabular-nums";

const LINE_COLUMNS: SimpleTableColumn[] = [
	{ id: "product", header: "Producto" },
	{ id: "cost", header: "Costo unitario", align: "right" },
	{ id: "subtotal", header: "Subtotal", align: "right" },
	{ id: "shipped", header: "Enviado", className: "min-w-32" },
	{ id: "received", header: "Recibido", className: "min-w-32" },
	{ id: "deal", header: "Oportunidad" },
];

type DialogState =
	| { kind: "ship" }
	| { kind: "move"; shipment: ImportShipment; nextKey: string | null }
	| { kind: "info"; shipment: ImportShipment }
	| null;

export function OrderView({ orderId }: { orderId: string }) {
	const trpc = useTRPC();
	const detail = useQuery(trpc.importOrders.byId.queryOptions({ id: orderId }));

	if (detail.data) return <OrderBody order={detail.data} />;
	if (detail.isError) {
		return <p className="text-muted-foreground">{detail.error.message}</p>;
	}
	return (
		<div className="flex justify-center p-6">
			<Spinner />
		</div>
	);
}

function OrderBody({ order }: { order: ImportOrderDetail }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const url = useWorkspaceUrl();
	const [dialog, setDialog] = useState<DialogState>(null);

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
	const totals = orderTotals(order.lines);
	const close = () => setDialog(null);

	return (
		<>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{`Orden ${order.number}`}</PageShellTitle>
				</PageShellHeading>
				<PageShellActions>
					{busy || archived ? (
						<Button variant="outline" disabled>
							Editar
						</Button>
					) : (
						<Button variant="outline" asChild>
							<Link href={url(`/imports/${order.id}/edit`)}>Editar</Link>
						</Button>
					)}
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
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="gap-8">
				<div className="flex flex-col gap-3">
					<MetaRow>
						<span>{order.supplierName}</span>
						<span>{order.process.name}</span>
						<span>{formatDay(order.orderedAt)}</span>
						<span className="tabular-nums">
							{`Total ${formatMoney(totals.cents)}`}
						</span>
						<span className="tabular-nums">
							{totals.units === 1 ? "1 unidad" : `${totals.units} unidades`}
						</span>
						{archived ? <span>Archivada</span> : null}
					</MetaRow>
					{order.notes ? (
						<p className="text-muted-foreground">{order.notes}</p>
					) : null}
					{order.canManage ? null : (
						<p className="text-13 text-muted-foreground">
							Solo un propietario o un administrador puede cambiar las órdenes.
						</p>
					)}
				</div>

				<PageSection
					title="Recorrido"
					description={`${orderStatusLabel(order.lines, order.shipments)}. Cada etapa muestra cuántos envíos tiene ahora.`}
				>
					<ProcessPath
						label={`Recorrido de ${order.process.name}`}
						steps={orderPath(order.stages, order.shipments)}
					/>
				</PageSection>

				<PageSection
					title="Líneas"
					description="Enviado y recibido sobre lo pedido. Un envío cancelado no cuenta."
				>
					<SimpleTable columns={LINE_COLUMNS}>
						{order.lines.map((line) => (
							<SimpleTableRow key={line.id}>
								<TableCell>{`${line.sku}, ${line.productName}`}</TableCell>
								<TableCell className={NUMBER}>
									{formatMoney(line.unitCostCents)}
								</TableCell>
								<TableCell className={NUMBER}>
									{formatMoney(line.quantity * line.unitCostCents)}
								</TableCell>
								<TableCell>
									<UnitsMeter
										done={line.shipped}
										total={line.quantity}
										color={CHART_CONFIG.fallback}
									/>
								</TableCell>
								<TableCell>
									<UnitsMeter
										done={line.received}
										total={line.quantity}
										color={CHART_CONFIG.trend.won}
									/>
								</TableCell>
								<TableCell>{line.dealName ?? <EmptyCellValue />}</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				</PageSection>

				<PageSection
					title="Envíos"
					description="Cada envío lleva parte de la orden y recorre el proceso por su cuenta."
				>
					{order.shipments.length === 0 ? (
						<p className="text-muted-foreground">Todavía no hay envíos.</p>
					) : (
						<div className="flex flex-col gap-4">
							{order.shipments.map((shipment, index) => (
								<ShipmentCard
									key={shipment.id}
									shipment={shipment}
									stages={order.stages}
									position={index + 1}
									canManage={order.canManage}
									onAdvance={(nextKey) =>
										setDialog({ kind: "move", shipment, nextKey })
									}
									onEdit={() => setDialog({ kind: "info", shipment })}
								/>
							))}
						</div>
					)}
				</PageSection>
			</PageShellContent>

			{dialog?.kind === "ship" ? (
				<NewShipmentDialog order={order} onClose={close} />
			) : null}
			{dialog?.kind === "move" ? (
				<MoveShipmentDialog
					shipment={dialog.shipment}
					stages={order.stages}
					initialKey={dialog.nextKey}
					onClose={close}
				/>
			) : null}
			{dialog?.kind === "info" ? (
				<ShipmentInfoDialog shipment={dialog.shipment} onClose={close} />
			) : null}
		</>
	);
}

function UnitsMeter({
	done,
	total,
	color,
}: {
	done: number;
	total: number;
	color: ChartColor;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<span className="tabular-nums">{unitsLabel(done, total)}</span>
			<ValueMeter share={shareOf(done, total)} color={color} />
		</div>
	);
}

function ShipmentCard({
	shipment,
	stages,
	position,
	canManage,
	onAdvance,
	onEdit,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	position: number;
	canManage: boolean;
	onAdvance: (nextKey: string | null) => void;
	onEdit: () => void;
}) {
	const closed = isClosedImportKind(shipment.stage.kind);
	const nextKey = nextStageKey(stages, shipment.stage.key);

	return (
		<section
			aria-label={`Envío ${position}`}
			className="flex flex-col gap-4 rounded-lg p-4 shadow-border"
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
						Editar
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!canManage || closed}
						onClick={() => onAdvance(nextKey)}
					>
						Avanzar
					</Button>
				</div>
			</div>

			<ProcessPath
				label={`Recorrido del envío ${position}`}
				steps={shipmentPath(stages, shipment)}
			/>

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
					<span key={line.orderLineId}>{`${line.sku}: ${line.quantity}`}</span>
				))}
			</MetaRow>
		</section>
	);
}
```

- [ ] **Step 3: Write the order page**

Create `apps/app/app/(app)/[slug]/imports/[orderId]/page.tsx`:

```tsx
import { PageShell, PageShellLoading } from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { OrderView } from "./order-view";

type OrderParams = Promise<{ slug: string; orderId: string }>;

export const metadata: Metadata = {
	title: "Orden de compra",
};

export default function OrderPage({ params }: { params: OrderParams }) {
	return (
		<PageShell>
			<Suspense fallback={<PageShellLoading />}>
				<Order params={params} />
			</Suspense>
		</PageShell>
	);
}

async function Order({ params }: { params: OrderParams }) {
	await requireSession();
	const { orderId } = await params;

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.importOrders.byId.queryOptions({ id: orderId }),
	);

	return (
		<HydrateClient>
			<OrderView orderId={orderId} />
		</HydrateClient>
	);
}
```

- [ ] **Step 4: Type check the app**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors. `PathStep` from `@/lib/import-orders` is passed to `steps` of `ProcessPath`. The two types have the same fields. A mismatch here means one of them changed in part 1. Restore the part 1 shape.

- [ ] **Step 5: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write "apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx" "apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx" "apps/app/app/(app)/[slug]/imports/[orderId]/page.tsx" && bunx biome check "apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx" "apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx" "apps/app/app/(app)/[slug]/imports/[orderId]/page.tsx"`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 6: Remove the sheets and link the list

**Files:**
- Modify: `apps/app/app/(app)/[slug]/imports/orders-table.tsx`
- Delete: `apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx`
- Delete: `apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx`

- [ ] **Step 1: Check the list is clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- "apps/app/app/(app)/[slug]/imports/orders-table.tsx" "apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx" "apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx"`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Link the list to the pages**

In `apps/app/app/(app)/[slug]/imports/orders-table.tsx`, replace:

```tsx
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { ListEmpty } from "@/components/data-table/list-empty";
```

with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListEmpty } from "@/components/data-table/list-empty";
```

Replace:

```tsx
import { useTRPC } from "@/lib/trpc/client";
import { importsSearchParams } from "./imports-search-params";
import { OrderDetailSheet } from "./order-detail-sheet";
import { OrderFormSheet } from "./order-form-sheet";
```

with:

```tsx
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { importsSearchParams } from "./imports-search-params";
```

Replace:

```tsx
	const { query, input, setArchived } = useTableQuery(importsSearchParams);
	const [detail, setDetail] = useState<{ id: string | null; open: boolean }>({
		id: null,
		open: false,
	});
	const [form, setForm] = useState({ key: 0, open: false });
```

with:

```tsx
	const { query, input, setArchived } = useTableQuery(importsSearchParams);
	const router = useRouter();
	const url = useWorkspaceUrl();
```

Replace:

```tsx
	return (
		<>
			<DataTable
```

with:

```tsx
	return (
		<DataTable
```

Replace:

```tsx
						<Button
							disabled={!canManage}
							onClick={() =>
								setForm((current) => ({ key: current.key + 1, open: true }))
							}
						>
							<Icon icon={PlusIcon} data-icon="inline-start" />
							Nueva orden
						</Button>
```

with:

```tsx
						{canManage ? (
							<Button asChild>
								<Link href={url("/imports/new")}>
									<Icon icon={PlusIcon} data-icon="inline-start" />
									Nueva orden
								</Link>
							</Button>
						) : (
							<Button disabled>
								<Icon icon={PlusIcon} data-icon="inline-start" />
								Nueva orden
							</Button>
						)}
```

Replace:

```tsx
				onRowClick={(row) => setDetail({ id: row.id, open: true })}
```

with:

```tsx
				onRowClick={(row) => router.push(url(`/imports/${row.id}`))}
```

Replace:

```tsx
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

with:

```tsx
		/>
	);
}
```

The `DataTable` props keep their current indentation until Step 4 formats the file.

- [ ] **Step 3: Remove the sheets**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rm "apps/app/app/(app)/[slug]/imports/order-form-sheet.tsx" "apps/app/app/(app)/[slug]/imports/order-detail-sheet.tsx"`

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'OrderFormSheet|OrderDetailSheet|order-form-sheet|order-detail-sheet' apps packages`
Expected: no output.

- [ ] **Step 4: Format and type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write "apps/app/app/(app)/[slug]/imports/orders-table.tsx" && bunx biome check "apps/app/app/(app)/[slug]/imports/orders-table.tsx"`
Expected: no errors.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 7: Docs and verification

**Files:**
- Modify: `docs/imports.md`

- [ ] **Step 1: Check the doc is clean**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- docs/imports.md`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Name the new spec**

In `docs/imports.md`, replace:

```md
The specs are `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md` and
`docs/superpowers/specs/2026-11-15-import-processes-design.md`. This page holds the rules
the code depends on.
```

with:

```md
The specs are `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`,
`docs/superpowers/specs/2026-11-15-import-processes-design.md` and
`docs/superpowers/specs/2026-11-16-order-pages-design.md`. This page holds the rules the
code depends on.
```

- [ ] **Step 3: Describe the pages**

In `docs/imports.md`, replace:

```md
- `/imports`: `orders-table.tsx`, `order-detail-sheet.tsx`, `order-form-sheet.tsx`,
  `shipment-dialogs.tsx`. Parsing and labels are in `apps/app/lib/import-orders.ts`.
```

with:

```md
- `/imports`: `orders-table.tsx`. A row opens the order page. *Nueva orden* opens
  `/imports/new`.
- `/imports/new` and `/imports/[orderId]/edit`: `order-form.tsx`, one form for both.
  Lines are an editable table. Enter in the last row adds a row. The server writes the
  order number.
- `/imports/[orderId]`: `[orderId]/order-view.tsx`. The route of the process with the
  shipments in each step, the lines with shipped and received bars, and one card per
  shipment with its path. *Avanzar* opens the move dialog on the next step.
  `shipment-dialogs.tsx` holds the create, move and data dialogs.
- Parsing, labels, totals and paths are in `apps/app/lib/import-orders.ts`. A path is a
  list of `PathStep` for `ProcessPath` (`packages/ui/src/components/process-path.tsx`).
  A path leaves out the `CANCELLED` stage. A step before the current one with no event
  shows *Omitida*.
- `importOrders.options` gives each process its active stages in order, for the route
  preview of the create page. The edit page reads `byId().stages` for the saved process,
  because an archived process is not in `options`.
```

- [ ] **Step 4: Type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=app && bun run check-types --filter=@crm/ui`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run lint && bun run lint:slop`
Expected: no finding in a file this plan touched. A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 6: Run every test of this plan**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/ui && bun test test/process-path.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-order-pages.spec.ts test/import-orders.spec.ts test/import-process-settings.spec.ts test/import-stage-settings.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`

Expected: all green. UI: 5. App: 13, 13, 5 and 5. API: 36.

- [ ] **Step 7: Browser checklist for the owner**

Give the owner this list. Do not mark the plan closed without it.

1. Sign in as owner. Open *Importaciones*. Click *Nueva orden*. The page `/imports/new` opens, not a side sheet. *Importaciones* stays active in the nav.
2. The page has two columns. Left: *Datos* and *Líneas*. Right: *Resumen* with *Total (USD)*, *Unidades*, *Líneas*, *Crear orden* and *Cancelar*.
3. With more than one process, *Proceso* is empty and the summary says *Elige un proceso para ver su recorrido.* Pick *Courier Argentina*. The summary shows its steps from *Pedido* to *Recibido*, all grey. *Cancelado* is not shown.
4. In line 1, open *Producto*, type part of a SKU, and pick a product. Its reference cost fills *Costo unitario* when the cost is empty.
5. Type quantity 3 and cost 12.50. *Subtotal* shows 37.50. The summary shows the total and 3 units.
6. Press Enter in the cost field of line 1. Line 2 appears and its *Producto* has focus. The form does not submit.
7. Fill line 2. Press Enter in its quantity field. Line 3 appears. Click the remove button of line 3. It goes away. With one line left, its remove button is disabled.
8. Pick a deal on a line with the *Oportunidad* search.
9. Submit with an empty supplier. The field says *Escribe el proveedor.* Clear the cost of a line and submit. The error under the table names that line.
10. Fill everything and click *Crear orden*. A toast says *Orden OC-2026-NNNN creada.* The page `/imports/[orderId]` opens.
11. The order page shows *Orden OC-2026-NNNN*, then supplier, process, date, the total and the units. *Recorrido* says *Sin envíos* and shows every step grey.
12. *Líneas* shows unit cost, subtotal, and two bars: *Enviado 0 de N* and *Recibido 0 de N*.
13. Click *Nuevo envío*. The dialog of today opens. Ship part of a line. A card *Envío 1: Pedido* appears. Its path shows *Pedido* as current with *0 días*. *Recorrido* shows *1 envío* under *Pedido* and says *En camino*. The *Enviado* bar fills.
14. Click *Avanzar* on the card. The move dialog opens with the next step chosen. Save. *Pedido* turns done and shows its date. The next step is current.
15. Click *Avanzar* again and pick *Recibido* in the dialog, skipping steps. The skipped steps show *Omitida*. *Recibido* is done with its date. *Avanzar* is disabled. The *Recibido* bar fills.
16. Click *Editar* on the card. The shipment data dialog opens. Save a tracking number. The card shows *Guía …*.
17. Click *Editar* in the header. `/imports/[orderId]/edit` opens with the same form, filled. *Proceso* is disabled and says *La orden ya tiene envíos. El proceso no cambia.* The line with shipped units has a disabled product and remove button. The summary title is the order number.
18. Change the notes. Click *Cancelar*. A dialog asks to discard. Choose *Seguir editando*, then *Cancelar* again and *Descartar*. The order page opens with the old notes.
19. Edit again, change a quantity and click *Guardar cambios*. A toast says *Orden actualizada.* The order page shows the new total.
20. Click *Archivar*. *Editar* and *Nuevo envío* are disabled. Visit `/imports/[orderId]/edit` by URL. The page says *La orden está archivada. Restáurala para editarla.* Click *Restaurar* on the order page.
21. Back on *Importaciones*, click a row. Its order page opens.
22. Visit `/imports/no-such-order`. The page shows the server message, not a crash.
23. Sign in as a member. *Nueva orden* on the list is disabled. The order page shows every action disabled and the hint about owners and admins.
24. Resize to 390 px. The form is one column, with the summary under the lines. The lines table scrolls inside its frame. Each path is vertical. The page does not scroll sideways.
25. Tab through the form. Every product, quantity, cost, deal and remove control is reached in row order. A screen reader reads *Producto de la línea 1* and the path step state, for example *Etapa actual*.
26. Switch to dark mode. The path bars, the meters and the summary keep contrast.
27. Turn on reduced motion in the system. The pages behave the same.

---

## Self-review (part 2)

| Spec item | Where |
| --- | --- |
| `/imports/new`, two columns, *Datos* and *Líneas*, sticky summary | Task 4 Steps 2 and 3; checklist 1 to 10 |
| Lines table: product, quantity, unit cost, subtotal, deal, remove; Enter adds | Task 4 Step 2; checklist 4 to 7 |
| Route preview when a process is chosen | Task 4 Step 2 `routePreview`; checklist 3 |
| Go to the order page after save | Task 4 Step 2 `onSuccess`; checklist 10, 19 |
| No order number on the form | Task 4: no field; checklist 10 |
| `/imports/[orderId]`: header, *Editar*, route and state, line bars | Task 5; checklist 11 to 13 |
| Shipment card: own path, *Avanzar*, *Editar* | Task 5; checklist 13 to 16 |
| Edit reuses the form at `/imports/[orderId]/edit` | Task 4 Step 4; checklist 17 to 20 |
| Sheets removed, list linked | Task 6; checklist 1, 21 |
| Dialogs reused | Task 5 Step 1 and Step 2 |
| Server pages prefetch and hydrate | Task 4 Steps 3 and 4, Task 5 Step 3 |
| Docs and checklist | Task 7 |

**Placeholder scan.** No step says "similar to" or "TODO". Every code step holds the whole file or the exact old and new text.

**Name consistency.** `OrderForm` and `EditOrderForm` (Task 4) are imported by `new/page.tsx` and `[orderId]/edit/page.tsx`. `OrderView` (Task 5) is imported by `[orderId]/page.tsx`. `initialKey` (Task 5 Step 1) is passed in Task 5 Step 2. Every helper comes from part 1 with its part 1 name.

**Known risks.**
- `Combobox` with an `aria-label` names the trigger by the label. Some screen readers then skip the chosen product. Checklist 25 checks it.
- A member who opens `/imports/new` by URL fills the form and gets a refusal only on submit (Decision 5).
- The summary at `lg:w-80` shows the route in two columns. A process with many steps makes the summary tall, and its sticky top can hide the buttons on a short screen. Checklist 2 and 24 look at it.
- `useDiscardChanges` guards *Cancelar* only. The browser back button and the nav leave without a question.
