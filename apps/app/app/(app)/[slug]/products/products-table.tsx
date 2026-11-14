"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ListEmpty } from "@/components/data-table/list-empty";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { PRODUCTS_UI } from "@/lib/products-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { type ProductRow, ProductSheet } from "./product-sheet";
import { productsSearchParams } from "./products-search-params";

const usd = new Intl.NumberFormat(PRODUCTS_UI.locale, {
	style: "currency",
	currency: PRODUCTS_UI.currency,
});

const COLUMNS: DataTableColumn<ProductRow>[] = [
	{
		id: "sku",
		header: "SKU",
		sortable: true,
		hideable: false,
		width: "36",
		cell: (row) => <span className="font-medium">{row.sku}</span>,
	},
	{
		id: "name",
		header: "Nombre",
		sortable: true,
		hideable: false,
		cell: (row) => <span className="block truncate">{row.name}</span>,
	},
	{
		id: "brand",
		header: "Marca",
		sortable: true,
		hideBelow: "md",
		cell: (row) =>
			row.brand ? (
				<span className="text-muted-foreground">{row.brand}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "category",
		header: "Categoría",
		sortable: true,
		hideBelow: "md",
		cell: (row) =>
			row.category ? (
				<span className="text-muted-foreground">{row.category}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "referenceCost",
		header: "Costo ref.",
		label: "Costo de referencia",
		sortable: true,
		align: "right",
		width: "36",
		cell: (row) =>
			row.referenceCostCents === null ? (
				<EmptyCellValue />
			) : (
				<span className="tabular-nums">
					{usd.format(row.referenceCostCents / 100)}
				</span>
			),
	},
];

const ARCHIVED_COLUMN: DataTableColumn<ProductRow> = {
	id: "archivedAt",
	header: "Archivado",
	label: "Fecha de archivado",
	sortable: true,
	align: "right",
	width: "32",
	cell: (row) => (
		<span className="text-muted-foreground">
			{row.archivedAt ? (
				<LocalRelativeTime date={row.archivedAt} />
			) : (
				<EmptyCellValue />
			)}
		</span>
	),
};

type SheetState = { open: boolean; product: ProductRow | null };

export function ProductsTable() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const table = useTableQuery(productsSearchParams);
	const { query, input, setArchived } = table;
	const [sheet, setSheet] = useState<SheetState>({
		open: false,
		product: null,
	});

	const products = useQuery({
		...trpc.products.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const archive = useMutation(
		trpc.products.archive.mutationOptions({
			onSuccess: async () => {
				await cache.products();
				toast.success("Producto archivado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const restore = useMutation(
		trpc.products.restore.mutationOptions({
			onSuccess: async () => {
				await cache.products();
				toast.success("Producto restaurado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = products.data?.rows ?? [];
	const canManage = products.data?.canManage ?? false;
	const facetCounts = products.data?.facetCounts;
	const busy = !canManage || archive.isPending || restore.isPending;

	const facets: DataTableFacet[] = [
		{
			id: "category",
			label: "Categoría",
			options: Object.keys(facetCounts?.category ?? {}).map((value) => ({
				value,
				label: value,
			})),
		},
	];

	const columns = useMemo(() => {
		const actions: DataTableColumn<ProductRow> = {
			id: "actions",
			header: "Acciones",
			hideable: false,
			align: "right",
			width: "40",
			cell: (row) => (
				<span className="flex justify-end gap-1">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={(event) => {
							event.stopPropagation();
							setSheet({ open: true, product: row });
						}}
					>
						Editar
					</Button>
					{row.archivedAt ? (
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={(event) => {
								event.stopPropagation();
								restore.mutate({ id: row.id });
							}}
						>
							Restaurar
						</Button>
					) : (
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={(event) => {
								event.stopPropagation();
								archive.mutate({ id: row.id });
							}}
						>
							Archivar
						</Button>
					)}
				</span>
			),
		};
		return input.archived
			? [...COLUMNS, ARCHIVED_COLUMN, actions]
			: [...COLUMNS, actions];
	}, [input.archived, busy, archive, restore]);

	return (
		<>
			<DataTable
				label="Productos"
				query={query}
				search={<ListSearch placeholder="Buscar por SKU, nombre o marca…" />}
				actions={
					<>
						<Button
							variant={input.archived ? "contrast" : "outline"}
							aria-pressed={input.archived}
							onClick={() => setArchived(!input.archived)}
						>
							<ArchiveIcon data-icon="inline-start" />
							Archivados
						</Button>
						<Button
							disabled={!canManage}
							onClick={() => setSheet({ open: true, product: null })}
						>
							<Icon icon={PlusIcon} data-icon="inline-start" />
							Nuevo producto
						</Button>
					</>
				}
				columns={columns}
				rows={rows}
				total={products.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={products.isFetching}
				empty={
					<ListEmpty
						query={query}
						noun="productos"
						archived={input.archived}
						blank={{
							title: "Todavía no hay productos",
							description: "Agrega el primer producto para armar el catálogo.",
						}}
					/>
				}
			/>
			<ProductSheet
				product={sheet.product}
				open={sheet.open}
				onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
			/>
		</>
	);
}
