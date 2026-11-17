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
	defaultProcessId,
	draftFromLine,
	draftTotals,
	type ImportOrderDetail,
	type LineDraft,
	lineSubtotalCents,
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
		if (!validation.validate(event.currentTarget, errors) || !parsed.ok) return;
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
						description="Cada línea es un producto con su cantidad y su costo unitario en USD. Enter en la última línea agrega otra."
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
