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
					<SheetDescription>
						Líneas, envíos y días entre etapas.
					</SheetDescription>
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
					<span>{order.process.name}</span>
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
					<span key={line.orderLineId}>{`${line.sku}: ${line.quantity}`}</span>
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
