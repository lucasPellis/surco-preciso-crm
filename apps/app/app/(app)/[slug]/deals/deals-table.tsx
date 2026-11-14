"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { LeadSourceMark } from "@crm/ui/components/lead-source-mark";
import { MetaRow } from "@crm/ui/components/meta-row";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { formatCount, formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon } from "lucide-react";
import { useMemo } from "react";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { CompanyCell } from "@/components/crm/company-cell";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { useFieldFacets } from "@/components/crm/fields/field-facets";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu } from "@/components/crm/stage-change";
import { ListEmpty } from "@/components/data-table/list-empty";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { DEAL_STAGE_OPTIONS } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { DealsBulkActions } from "./deals-bulk-actions";
import { dealsSearchParams } from "./deals-search-params";

type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

const COLUMNS: DataTableColumn<DealRow>[] = [
	{
		id: "name",
		header: "Oportunidad",
		sortable: true,
		hideable: false,
		cell: (row) => (
			<span className="block truncate font-medium">{row.name}</span>
		),
	},
	{
		id: "company",
		header: "Empresa",
		sortable: true,
		width: { sm: "40" },
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "stage",
		header: "Etapa",
		sortable: true,
		width: { sm: "40" },
		cell: (row) => <DealStageMenu dealId={row.id} stage={row.stage} />,
	},
	{
		id: "amount",
		header: "Monto",
		sortable: true,
		align: "right",
		width: "36",
		hideBelow: "sm",
		cell: (row) =>
			row.amountCents === null ? (
				<EmptyCellValue />
			) : (
				<span className="tabular-nums">
					{formatMoney(row.amountCents, row.currency)}
				</span>
			),
	},
	{
		id: "leadSource",
		header: "Origen",
		sortable: true,
		width: "40",
		hideBelow: "lg",
		cell: (row) =>
			row.leadSource ? (
				<span className="flex min-w-0 items-center gap-2">
					<LeadSourceMark icon={row.leadSource.icon} />
					<span className="truncate">{row.leadSource.name}</span>
				</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "owner",
		header: "Responsable",
		sortable: true,
		width: "40",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "expectedCloseDate",
		header: "Fecha de cierre",
		sortable: true,
		width: "32",
		hideBelow: "lg",
		cell: (row) =>
			row.expectedCloseDate ? (
				<span className="text-muted-foreground">
					<LocalDay date={row.expectedCloseDate} />
				</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "createdAt",
		header: "Creada",
		label: "Fecha de creación",
		sortable: true,
		align: "right",
		width: "28",
		defaultHidden: true,
		cell: (row) => (
			<span className="text-muted-foreground">
				<LocalRelativeTime date={row.createdAt} />
			</span>
		),
	},
	{
		id: "lastActivity",
		header: "Última actividad",
		sortable: true,
		align: "right",
		width: "40",
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground">
				{row.lastActivityAt ? (
					<LocalRelativeTime date={row.lastActivityAt} />
				) : (
					<EmptyCellValue />
				)}
			</span>
		),
	},
];

const ARCHIVED_COLUMN: DataTableColumn<DealRow> = {
	id: "archivedAt",
	header: "Archivada",
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

export function DealsTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const { query, input, setArchived } = useTableQuery(dealsSearchParams);

	const deals = useQuery({
		...trpc.deals.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());
	const leadSources = useQuery(trpc.leadSources.list.queryOptions());

	const rows = deals.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);
	const settledIds = useMemo(() => {
		const matching = new Set(
			rows
				.filter((row) => Boolean(row.archivedAt) === input.archived)
				.map((row) => row.id),
		);
		return selection.ids.filter((id) => matching.has(id));
	}, [rows, input.archived, selection.ids]);

	const toggleArchived = (next: boolean) => {
		selection.clear();
		if (!next && query.sort === "archivedAt") query.setSort("");
		setArchived(next);
	};

	const facetCounts = deals.data?.facetCounts;
	const fieldFacets = useFieldFacets("DEAL", facetCounts);

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Responsable",
			options: (users.data ?? []).flatMap((user) =>
				(facetCounts?.owner?.[user.id] ?? 0) > 0
					? [{ value: user.id, label: user.name }]
					: [],
			),
		},
		{
			id: "leadSource",
			label: "Origen",
			options: [
				...(leadSources.data?.sources ?? []).map((source) => ({
					value: source.id,
					label: source.name,
				})),
				{ value: "none", label: "Desconocido" },
			].filter((option) => (facetCounts?.leadSource?.[option.value] ?? 0) > 0),
		},
		{
			id: "stage",
			label: "Etapa",
			options: DEAL_STAGE_OPTIONS.filter(
				(option) => (facetCounts?.stage?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "closing",
			label: "Cierre",
			options: CLOSING_OPTIONS.flatMap((option) =>
				(facetCounts?.closing?.[option.value] ?? 0) > 0
					? [{ value: option.value, label: option.label }]
					: [],
			),
		},
		...fieldFacets,
	];

	const openValueCents = deals.data?.openValueCents;
	const reportingCurrency = deals.data?.reportingCurrency;
	const unconverted = deals.data?.unconverted;
	const uncounted = unconverted?.count ?? 0;
	const openPipelineCents = openValueCents ?? (uncounted > 0 ? 0 : null);

	const fieldColumns = useFieldColumns<DealRow>("DEAL");
	const columns = useMemo(
		() =>
			input.archived
				? [...COLUMNS, ARCHIVED_COLUMN, ...fieldColumns]
				: [...COLUMNS, ...fieldColumns],
		[fieldColumns, input.archived],
	);

	return (
		<DataTable
			label="Oportunidades"
			query={query}
			search={<ListSearch placeholder="Buscar oportunidades…" />}
			actions={
				<Button
					variant={input.archived ? "contrast" : "outline"}
					aria-pressed={input.archived}
					className="justify-start sm:justify-center"
					onClick={() => toggleArchived(!input.archived)}
				>
					<ArchiveIcon data-icon="inline-start" />
					Archivadas
				</Button>
			}
			columns={columns}
			rows={rows}
			total={deals.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			tabs={{
				id: "status",
				label: "Estado",
				allLabel: "Todas",
				options: [
					{ value: "open", label: "Abiertas" },
					{ value: "closed", label: "Cerradas" },
				],
			}}
			selection={{
				state: selection,
				actions: (
					<DealsBulkActions
						ids={settledIds}
						onDone={selection.clear}
						archived={input.archived}
					/>
				),
				rowLabel: (row) => row.name,
			}}
			getRowId={(row) => row.id}
			loading={deals.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "deal", id: row.id })}
			onRowClick={(row, orderedRows) =>
				openRecord(
					{ kind: "deal", id: row.id },
					orderedRows.map((entry) => ({ kind: "deal", id: entry.id })),
				)
			}
			empty={
				<ListEmpty
					query={query}
					noun="oportunidades"
					archived={input.archived}
					blank={{
						title: "Todavía no hay oportunidades",
						description:
							"Agrega una oportunidad para empezar a seguir el funnel.",
					}}
				/>
			}
			meta={
				input.archived || openPipelineCents === null ? undefined : (
					<MetaRow>
						<span>
							{formatCount(
								deals.data?.total ?? 0,
								"oportunidad",
								"oportunidades",
							)}
						</span>
						<span>
							<span className="tabular-nums">
								{formatMoney(openPipelineCents, reportingCurrency)}
							</span>{" "}
							en el funnel abierto
						</span>
						{unconverted && unconverted.count > 0 ? (
							<span>
								{unconverted.count} sin contar (falta la cotización de{" "}
								{unconverted.currencies.join(", ")})
							</span>
						) : null}
					</MetaRow>
				)
			}
		/>
	);
}
