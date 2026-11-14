"use client";

import {
	CommandSearch,
	type CommandSearchItem,
} from "@crm/ui/components/command-search";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	HandshakeIcon,
	KanbanIcon,
	LayoutDashboardIcon,
	ListChecksIcon,
	type LucideIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { COMMAND_SEARCH } from "@/lib/command-search-config";
import {
	entityLogoTone,
	forgetRecentRecord,
	type RecentRecord,
	readRecentRecords,
	recoverRecentRecords,
	resolveRecentRecord,
	useRecentRecordsRaw,
} from "@/lib/recent-records";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceSlug, useWorkspaceUrl } from "@/lib/use-workspace-url";

type RecordKind = RecentRecord["kind"];

const KINDS = {
	company: { group: "Empresas", noun: "empresas", list: "/companies" },
	contact: { group: "Contactos", noun: "contactos", list: "/contacts" },
	deal: { group: "Oportunidades", noun: "oportunidades", list: "/deals" },
} as const satisfies Record<
	RecordKind,
	{ group: string; noun: string; list: string }
>;

const KIND_ORDER = ["company", "contact", "deal"] as const;

type Destination = {
	id: string;
	label: string;
	href: string;
	icon?: LucideIcon;
	keywords?: string[];
};

const PAGES: Destination[] = [
	{
		id: "overview",
		label: "Resumen",
		href: "/",
		icon: LayoutDashboardIcon,
		keywords: ["inicio", "panel", "funnel"],
	},
	{
		id: "contacts",
		label: "Contactos",
		href: "/contacts",
		icon: UsersIcon,
		keywords: ["personas", "leads"],
	},
	{
		id: "funnel",
		label: "Funnel",
		href: "/funnel",
		icon: KanbanIcon,
		keywords: [
			"tablero",
			"etapas",
			"leads",
			"oportunidades",
			"kanban",
			"embudo",
		],
	},
	{
		id: "deals",
		label: "Oportunidades",
		href: "/deals",
		icon: HandshakeIcon,
		keywords: ["negocios", "funnel", "ventas", "ingresos"],
	},
	{
		id: "tasks",
		label: "Tareas",
		href: "/tasks",
		icon: ListChecksIcon,
		keywords: ["pendientes", "seguimiento"],
	},
	{
		id: "settings",
		label: "Configuración",
		href: "/settings",
		icon: SettingsIcon,
	},
];

const CREATE: Destination[] = [
	{
		id: "new-contact",
		label: "Nuevo lead",
		href: `/contacts?${SEARCH_PARAM.dialog.create}=true`,
		icon: PlusIcon,
		keywords: ["agregar", "crear", "persona", "lead"],
	},
	{
		id: "new-deal",
		label: "Nueva oportunidad",
		href: `/deals?${SEARCH_PARAM.dialog.create}=true`,
		icon: PlusIcon,
		keywords: ["agregar", "crear", "negocio"],
	},
];

const SETTINGS: Destination[] = [
	{
		id: "settings-general",
		label: "General",
		href: "/settings",
		keywords: ["espacio de trabajo", "nombre", "modelo del agente"],
	},
	{
		id: "settings-tracking",
		label: "Seguimiento y analítica",
		href: "/settings/tracking",
		keywords: ["script", "sitio web", "formularios", "tracking"],
	},
	{
		id: "settings-connections",
		label: "Conexiones",
		href: "/settings/connections",
		keywords: ["integraciones", "slack", "gmail", "mcp"],
	},
	{
		id: "settings-currencies",
		label: "Monedas",
		href: "/settings/currencies",
		keywords: ["tipo de cambio", "cotización", "dinero", "divisas"],
	},
	{
		id: "settings-lead-sources",
		label: "Orígenes",
		href: "/settings/lead-sources",
		keywords: ["origen del lead", "canal", "campaña", "utm"],
	},
	{
		id: "settings-stages",
		label: "Etapas",
		href: "/settings/stages",
		keywords: ["funnel", "embudo", "pipeline", "estados", "oportunidades"],
	},
	{
		id: "settings-members",
		label: "Miembros",
		href: "/settings/members",
		keywords: ["equipo", "personas", "invitar", "roles"],
	},
	{
		id: "settings-api-keys",
		label: "Claves de API",
		href: "/settings/api-keys",
		keywords: ["tokens", "desarrolladores", "api keys"],
	},
	{
		id: "settings-sso",
		label: "SSO",
		href: "/settings/sso",
		keywords: [
			"inicio de sesión único",
			"saml",
			"okta",
			"proveedor de identidad",
		],
	},
];

function recordMedia(record: RecentRecord) {
	return record.kind === "contact" ? (
		<PersonAvatar src={record.imageUrl} name={record.label} size="sm" />
	) : (
		<EntityLogo
			src={record.iconUrl}
			darkSrc={record.iconDarkUrl}
			tone={record.iconTone}
			name={record.label}
			size="sm"
		/>
	);
}

function RecentRecordsRecovery({
	slug,
	raw,
}: {
	slug: string;
	raw: string | null;
}) {
	useMountEffect(() => recoverRecentRecords(slug, raw));
	return null;
}

export function QuickSwitcher() {
	const router = useRouter();
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const slug = useWorkspaceSlug();
	const workspaceUrl = useWorkspaceUrl();
	const recents = readRecentRecords(useRecentRecordsRaw(slug));

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.switcher,
		parseAsBoolean.withDefault(false),
	);
	const [query, setQuery] = useState("");
	const [requested, setRequested] = useState("");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useMountEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	});

	const current = query.trim().slice(0, COMMAND_SEARCH.query.maxLength);
	const ready = current === requested;
	const searchable = current.length >= COMMAND_SEARCH.query.minLength;

	const workspace = useQuery({
		...trpc.workspace.get.queryOptions(),
		enabled: open,
	});

	const search = useQuery({
		...trpc.search.quick.queryOptions({ q: requested }),
		enabled: open && requested.length >= COMMAND_SEARCH.query.minLength,
	});

	const hits = ready && searchable ? (search.data?.hits ?? []) : [];

	const go = (href: string) => {
		void setOpen(null).then(() => router.push(workspaceUrl(href)));
	};

	const choose = (record: RecentRecord) => {
		openRecord({ kind: record.kind, id: record.id });
	};

	const chooseRecent = async (record: RecentRecord) => {
		try {
			const exists = await resolveRecentRecord(
				() => {
					switch (record.kind) {
						case "company":
							return queryClient.fetchQuery({
								...trpc.companies.byId.queryOptions({ id: record.id }),
								staleTime: 0,
							});
						case "contact":
							return queryClient.fetchQuery({
								...trpc.contacts.byId.queryOptions({ id: record.id }),
								staleTime: 0,
							});
						case "deal":
							return queryClient.fetchQuery({
								...trpc.deals.byId.queryOptions({ id: record.id }),
								staleTime: 0,
							});
					}
				},
				() => forgetRecentRecord(slug, record),
			);
			if (exists) choose(record);
			else
				toast.error("Este registro ya no existe. Se quitó de los recientes.");
		} catch {
			toast.error("No se puede abrir este registro. Inténtalo de nuevo.");
		}
	};

	const destination = (group: string, path?: string[]) => {
		return (entry: Destination): CommandSearchItem => ({
			id: entry.id,
			label: entry.label,
			group,
			icon: entry.icon,
			path,
			keywords: entry.keywords,
			onSelect: () => go(entry.href),
		});
	};

	const results: CommandSearchItem[] = KIND_ORDER.flatMap((kind) => {
		const group = hits.filter((hit) => hit.kind === kind);
		const records = group.map((hit): CommandSearchItem => {
			const tone = entityLogoTone.safeParse(hit.iconTone);
			const record: RecentRecord = {
				kind: hit.kind,
				id: hit.id,
				label: hit.label,
				detail: hit.detail,
				iconUrl: hit.iconUrl,
				iconDarkUrl: hit.iconDarkUrl,
				iconTone: tone.success ? tone.data : null,
				imageUrl: hit.imageUrl,
			};

			return {
				id: `${hit.kind}:${hit.id}`,
				label: hit.label,
				group: KINDS[kind].group,
				media: recordMedia(record),
				snippet: hit.detail ?? undefined,
				onSelect: () => choose(record),
			};
		});

		if (group.length < COMMAND_SEARCH.results.perKind) return records;

		const params = new URLSearchParams({ [SEARCH_PARAM.list.q]: current });

		return [
			...records,
			{
				id: `all:${kind}`,
				label: `Todas las ${KINDS[kind].noun} que coinciden con “${current}”`,
				group: KINDS[kind].group,
				icon: SearchIcon,
				onSelect: () => go(`${KINDS[kind].list}?${params}`),
			},
		];
	});

	const items: CommandSearchItem[] = [
		...(query.trim() || recents.status === "invalid"
			? []
			: recents.records.map(
					(record): CommandSearchItem => ({
						id: `recent:${record.kind}:${record.id}`,
						label: record.label,
						group: "Recientes",
						media: recordMedia(record),
						snippet: record.detail ?? undefined,
						onSelect: () => void chooseRecent(record),
					}),
				)),
		...PAGES.map(destination("Páginas")),
		...CREATE.map(destination("Crear")),
		...SETTINGS.map(
			destination("Configuración", ["Configuración", "Espacio de trabajo"]),
		),
	];

	return (
		<>
			{recents.status === "invalid" ? (
				<RecentRecordsRecovery
					key={recents.raw}
					slug={slug}
					raw={recents.raw}
				/>
			) : null}
			<CommandSearch
				open={open}
				onOpenChange={(next) => void setOpen(next || null)}
				items={items}
				results={results}
				workspaceName={workspace.data?.name.trim() || undefined}
				placeholder="Buscar empresas, contactos, oportunidades y páginas…"
				description="Ir a una empresa, contacto, oportunidad, página o ajuste."
				onQueryChange={(value) => {
					setQuery(value);

					if (timer.current) clearTimeout(timer.current);
					const normalized = value
						.trim()
						.slice(0, COMMAND_SEARCH.query.maxLength);

					if (normalized.length < COMMAND_SEARCH.query.minLength) {
						setRequested("");
					} else {
						timer.current = setTimeout(
							() => setRequested(normalized),
							COMMAND_SEARCH.query.debounceMs,
						);
					}
				}}
				loading={searchable && (!ready || search.isPending)}
				searchError={
					ready && search.error
						? "La búsqueda falló. Las páginas siguen coincidiendo."
						: undefined
				}
				onRetry={() => void search.refetch()}
			/>
		</>
	);
}
