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
	defaultProcessId,
	draftFromLine,
	type ImportOrderDetail,
	type LineDraft,
	NO_DEAL,
	processChoices,
	processLabel,
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
	const [supplierName, setSupplierName] = useState(order?.supplierName ?? "");
	const [orderedAt, setOrderedAt] = useState(order?.orderedAt ?? today);
	const [notes, setNotes] = useState(order?.notes ?? "");
	const [processId, setProcessId] = useState(order?.process.id ?? "");
	const [lines, setLines] = useState<LineDraft[]>(() =>
		order ? order.lines.map(draftFromLine) : [blankDraft(crypto.randomUUID())],
	);
	const [linesError, setLinesError] = useState<string | null>(null);

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
				cost === "" && product
					? costFromCents(product.referenceCostCents)
					: cost,
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
						if (supplierName.trim() === "")
							errors[supplierId] = "Escribe el proveedor.";
						if (orderedAt === "") errors[dateId] = "Elige una fecha.";
						if (chosenProcessId === "")
							errors[processFieldId] = "Elige un proceso.";
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
					}}
				>
					<FieldGroup>
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
									<FieldLabel htmlFor={`${line.key}-product`}>
										Producto
									</FieldLabel>
									<Select
										value={line.productId}
										disabled={line.shipped > 0}
										onValueChange={(value) => pickProduct(line.key, value)}
									>
										<SelectTrigger
											id={`${line.key}-product`}
											className="w-full"
										>
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
									<FieldLabel htmlFor={`${line.key}-deal`}>
										Oportunidad
									</FieldLabel>
									<Select
										value={line.dealId}
										onValueChange={(value) =>
											change(line.key, { dealId: value })
										}
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
