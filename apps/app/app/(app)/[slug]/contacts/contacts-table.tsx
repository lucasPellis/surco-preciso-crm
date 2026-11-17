"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { LeadSourceMark } from "@crm/ui/components/lead-source-mark";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { CompanyCell } from "@/components/crm/company-cell";
import { contactName } from "@/components/crm/contact-name";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { useFieldFacets } from "@/components/crm/fields/field-facets";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListEmpty } from "@/components/data-table/list-empty";
import { ListSearch } from "@/components/data-table/list-search";
import { SavedViewsMenu } from "@/components/data-table/saved-views-menu";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { ACTIVITY_FACET_OPTIONS } from "@/lib/activity-recency";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ContactsBulkActions } from "./contacts-bulk-actions";
import { contactsSearchParams } from "./contacts-search-params";

type ContactRow = RouterOutputs["contacts"]["list"]["rows"][number];

const COLUMNS: DataTableColumn<ContactRow>[] = [
	{
		id: "name",
		header: "Nombre",
		sortable: true,
		hideable: false,
		cell: (row) => (
			<span className="flex min-w-0 items-center gap-2">
				<PersonAvatar
					src={row.imageUrl}
					name={contactName(row)}
					email={row.email}
					size="sm"
				/>
				<span className="truncate font-medium">{contactName(row)}</span>
			</span>
		),
	},
	{
		id: "phone",
		header: "Teléfono",
		sortable: true,
		width: "40",
		cell: (row) =>
			row.phone ? (
				<span className="block truncate tabular-nums">{row.phone}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "title",
		header: "Cargo",
		sortable: true,
		width: "40",
		hideBelow: "lg",
		defaultHidden: true,
		cell: (row) =>
			row.title ? (
				<span className="block truncate">{row.title}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "email",
		header: "Email",
		sortable: true,
		width: "56",
		hideBelow: "md",
		defaultHidden: true,
		cell: (row) =>
			row.email ? (
				<span className="block truncate text-muted-foreground">
					{row.email}
				</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "company",
		header: "Empresa",
		sortable: true,
		width: "40",
		defaultHidden: true,
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "leadSource",
		header: "Origen",
		sortable: true,
		width: "44",
		hideBelow: "md",
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
		id: "createdAt",
		header: "Creado",
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
		hideBelow: "sm",
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

const ARCHIVED_COLUMN: DataTableColumn<ContactRow> = {
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

export function ContactsTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const table = useTableQuery(contactsSearchParams);
	const { query, input, setArchived } = table;

	const contacts = useQuery({
		...trpc.contacts.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());
	const leadSources = useQuery(trpc.leadSources.list.queryOptions());

	const [companyQuery, setCompanyQuery] = useState("");
	const [companyText, setCompanyText] = useSearchInput(
		companyQuery,
		setCompanyQuery,
	);
	const companies = useQuery({
		...trpc.companies.options.queryOptions({ q: companyQuery }),
		placeholderData: (previous) => previous,
	});

	const rows = contacts.data?.rows ?? [];
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

	const facetCounts = contacts.data?.facetCounts;
	const fieldFacets = useFieldFacets("CONTACT", facetCounts);

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Responsable",
			options: [
				{ value: "unassigned", label: "Sin asignar" },
				...(users.data ?? []).map((user) => ({
					value: user.id,
					label: user.name,
				})),
			].filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "company",
			label: "Empresa",
			searchable: true,
			search: companyText,
			onSearchChange: setCompanyText,
			stale: companies.isFetching || companyText.trim() !== companyQuery.trim(),
			empty: companies.isFetching ? "Buscando…" : "Ninguna empresa coincide.",
			options: [
				...(companyQuery.trim()
					? []
					: [{ value: "none", label: "Sin empresa" }]),
				...(companies.data ?? []).map((company) => ({
					value: company.id,
					label: company.name,
				})),
			].filter((option) => (facetCounts?.company?.[option.value] ?? 0) > 0),
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
			id: "title",
			label: "Cargo",
			options: Object.keys(facetCounts?.title ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "seniority",
			label: "Jerarquía",
			options: Object.keys(facetCounts?.seniority ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "persona",
			label: "Perfil",
			options: Object.keys(facetCounts?.persona ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "activity",
			label: "Actividad",
			options: ACTIVITY_FACET_OPTIONS.filter(
				(option) => (facetCounts?.activity?.[option.value] ?? 0) > 0,
			),
		},
		...fieldFacets,
	];

	const fieldColumns = useFieldColumns<ContactRow>("CONTACT");
	const columns = useMemo(
		() =>
			input.archived
				? [...COLUMNS, ARCHIVED_COLUMN, ...fieldColumns]
				: [...COLUMNS, ...fieldColumns],
		[fieldColumns, input.archived],
	);

	return (
		<DataTable
			label="Contactos"
			query={query}
			search={<ListSearch placeholder="Buscar contactos…" />}
			actions={
				<>
					<SavedViewsMenu entity="CONTACT" table={table} />
					<Button
						variant={input.archived ? "contrast" : "outline"}
						aria-pressed={input.archived}
						className="justify-start sm:justify-center"
						onClick={() => toggleArchived(!input.archived)}
					>
						<ArchiveIcon data-icon="inline-start" />
						Archivados
					</Button>
				</>
			}
			columns={columns}
			rows={rows}
			total={contacts.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<ContactsBulkActions
						ids={settledIds}
						onDone={selection.clear}
						archived={input.archived}
					/>
				),
				rowLabel: (row) => contactName(row),
			}}
			getRowId={(row) => row.id}
			loading={contacts.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "contact", id: row.id })}
			onRowClick={(row, orderedRows) =>
				openRecord(
					{ kind: "contact", id: row.id },
					orderedRows.map((entry) => ({ kind: "contact", id: entry.id })),
				)
			}
			empty={
				<ListEmpty
					query={query}
					noun="contactos"
					archived={input.archived}
					blank={{
						title: "Todavía no hay contactos",
						description:
							"Agrega un contacto para llevar el registro de las personas a las que les vendes.",
					}}
				/>
			}
		/>
	);
}
