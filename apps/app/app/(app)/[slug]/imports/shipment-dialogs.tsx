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
	FieldTitle,
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
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { missingDocumentsText } from "@/lib/import-documents";
import {
	formatDay,
	type ImportOrderDetail,
	type ImportShipment,
	type ImportStageOption,
	moveTargets,
	readShipmentQuantities,
	shipmentsRegisteredLabel,
	splitPreview,
} from "@/lib/import-orders";
import { utcDay } from "@/lib/import-stage-settings";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const onError = (error: { message: string }) => toast.error(error.message);

type ShipmentMode = "one" | "split";

function isShipmentMode(value: string): value is ShipmentMode {
	return value === "one" || value === "split";
}

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
	const [mode, setMode] = useState<ShipmentMode>("one");
	const open = order.lines.filter((line) => line.remaining > 0);
	const unitsInShipment = open.reduce((sum, line) => {
		const units = Number.parseInt(quantities[line.id] ?? "", 10);
		return Number.isNaN(units) || units < 0 ? sum : sum + units;
	}, 0);

	const create = useMutation(
		trpc.importOrders.createShipment.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				toast.success("Envío registrado en la etapa de entrada.");
				onClose();
			},
			onError,
		}),
	);

	return (
		<Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Registrar envío de equipo</DialogTitle>
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
							noValidate
							onInput={validation.onInput}
							onSubmit={(event) => {
								event.preventDefault();
								if (create.isPending) return;
								const errors: Record<string, string> = {};
								if (occurredAt === "") errors[dateId] = "Elige una fecha.";
								const parsed = readShipmentQuantities(open, quantities);
								setLinesError(parsed.ok ? null : parsed.error);
								if (
									!validation.validate(event.currentTarget, errors) ||
									!parsed.ok
								)
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
											{`${line.productName}, ${line.sku}`}
										</FieldLabel>
										<div className="flex gap-2">
											<Input
												id={`${line.id}-ship`}
												inputMode="numeric"
												placeholder="Unidades"
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
											<Button
												type="button"
												variant="outline"
												onClick={() => {
													setLinesError(null);
													setQuantities((current) => ({
														...current,
														[line.id]: String(line.remaining),
													}));
												}}
											>
												{`Todas (${line.remaining})`}
											</Button>
										</div>
										<FieldDescription>
											{`Quedan ${line.remaining} de ${line.quantity} unidades por enviar.`}
										</FieldDescription>
									</Field>
								))}
								{linesError ? <FieldError>{linesError}</FieldError> : null}

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
									<FieldLabel htmlFor={referenceId}>
										Referencia (opcional)
									</FieldLabel>
									<Input
										id={referenceId}
										value={reference}
										onChange={(event) => setReference(event.target.value)}
										maxLength={IMPORT_ORDER.referenceMaxLength}
										autoComplete="off"
									/>
								</Field>

								<Field>
									<FieldLabel htmlFor={trackingId}>
										Número de guía (opcional)
									</FieldLabel>
									<Input
										id={trackingId}
										value={trackingNumber}
										onChange={(event) => setTrackingNumber(event.target.value)}
										maxLength={IMPORT_ORDER.trackingNumberMaxLength}
										autoComplete="off"
									/>
									<FieldDescription>
										La guía llega cuando el courier toma el pedido. Puedes
										cargarla después en los datos del envío.
									</FieldDescription>
								</Field>
							</FieldGroup>
						</form>

						<DialogFooter>
							<p className="text-13 text-muted-foreground sm:mr-auto">
								{`Este envío: ${unitsInShipment} ${unitsInShipment === 1 ? "unidad" : "unidades"}`}
							</p>
							<Button variant="outline" onClick={onClose}>
								Cancelar
							</Button>
							<Button
								type="submit"
								form="new-shipment-form"
								disabled={create.isPending}
							>
								{create.isPending ? <Spinner data-icon="inline-start" /> : null}
								Registrar envío
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

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
							Se copia en cada envío. El número de guía se carga después en cada
							envío.
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
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const targetId = useId();
	const dateId = useId();
	const targets = moveTargets(stages, shipment.stage.key);
	const [today] = useState(() => utcDay());
	const [targetKey, setTargetKey] = useState(
		initialKey ?? targets[0]?.key ?? "",
	);
	const [occurredAt, setOccurredAt] = useState(today);
	const missing = missingDocumentsText(
		stages.find((stage) => stage.key === targetKey),
		shipment.documents,
	);

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
							{missing ? <FieldDescription>{missing}</FieldDescription> : null}
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
