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
import { ShipmentDocuments, UploadDocumentDialog } from "./shipment-documents";

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
	| { kind: "upload"; shipment: ImportShipment }
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
						Registrar envío
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
						<span>{orderStatusLabel(order.lines, order.shipments)}</span>
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
					description={`Cada envío es una parte de esta orden y recorre el proceso por su cuenta. Quedan ${order.lines.reduce((sum, line) => sum + line.remaining, 0)} de ${order.lines.reduce((sum, line) => sum + line.quantity, 0)} unidades por enviar.`}
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
									documentsEnabled={order.documentsEnabled}
									onUpload={() => setDialog({ kind: "upload", shipment })}
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
			{dialog?.kind === "upload" ? (
				<UploadDocumentDialog
					shipment={dialog.shipment}
					stages={order.stages}
					onClose={close}
				/>
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
	documentsEnabled,
	onUpload,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	position: number;
	canManage: boolean;
	onAdvance: (nextKey: string | null) => void;
	onEdit: () => void;
	documentsEnabled: boolean;
	onUpload: () => void;
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

			<ShipmentDocuments
				shipment={shipment}
				stages={stages}
				canManage={canManage}
				documentsEnabled={documentsEnabled}
				onUpload={onUpload}
			/>
		</section>
	);
}
