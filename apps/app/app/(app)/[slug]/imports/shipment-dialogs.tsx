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
						línea van en este envío. El envío empieza en la etapa de entrada con
						la fecha que elijas.
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
