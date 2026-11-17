"use client";

import { Button } from "@crm/ui/components/button";
import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListEmpty } from "@/components/data-table/list-empty";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	formatDay,
	type ImportOrderRow,
	unitsLabel,
} from "@/lib/import-orders";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { importsSearchParams } from "./imports-search-params";

const COLUMNS: DataTableColumn<ImportOrderRow>[] = [
	{
		id: "number",
		header: "Número",
		sortable: true,
		hideable: false,
		width: "36",
		cell: (row) => <span className="font-medium">{row.number}</span>,
	},
	{
		id: "supplierName",
		header: "Proveedor",
		sortable: true,
		hideable: false,
		cell: (row) => <span className="block truncate">{row.supplierName}</span>,
	},
	{
		id: "orderedAt",
		header: "Fecha",
		sortable: true,
		width: "32",
		cell: (row) => (
			<span className="text-muted-foreground">{formatDay(row.orderedAt)}</span>
		),
	},
	{
		id: "shipped",
		header: "Enviado",
		label: "Unidades enviadas",
		align: "right",
		width: "28",
		hideBelow: "md",
		cell: (row) => unitsLabel(row.shippedUnits, row.orderedUnits),
	},
	{
		id: "received",
		header: "Recibido",
		label: "Unidades recibidas",
		align: "right",
		width: "28",
		cell: (row) => unitsLabel(row.receivedUnits, row.orderedUnits),
	},
	{
		id: "shipments",
		header: "Envíos",
		align: "right",
		width: "24",
		hideBelow: "md",
		cell: (row) => row.shipmentCount,
	},
];

export function OrdersTable() {
	const trpc = useTRPC();
	const { query, input, setArchived } = useTableQuery(importsSearchParams);
	const router = useRouter();
	const url = useWorkspaceUrl();

	const orders = useQuery({
		...trpc.importOrders.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const canManage = orders.data?.canManage ?? false;

	return (
		<DataTable
			label="Órdenes de compra"
			query={query}
			search={<ListSearch placeholder="Buscar por número o proveedor…" />}
			actions={
				<>
					<Button
						variant={input.archived ? "contrast" : "outline"}
						aria-pressed={input.archived}
						onClick={() => setArchived(!input.archived)}
					>
						<ArchiveIcon data-icon="inline-start" />
						Archivadas
					</Button>
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
				</>
			}
			columns={COLUMNS}
			rows={orders.data?.rows ?? []}
			total={orders.data?.total ?? 0}
			facetCounts={orders.data?.facetCounts}
			getRowId={(row) => row.id}
			onRowClick={(row) => router.push(url(`/imports/${row.id}`))}
			loading={orders.isFetching}
			empty={
				<ListEmpty
					query={query}
					noun="órdenes"
					archived={input.archived}
					blank={{
						title: "Todavía no hay órdenes de compra",
						description:
							"Crea la primera orden para seguir sus envíos por etapa.",
					}}
				/>
			}
		/>
	);
}
