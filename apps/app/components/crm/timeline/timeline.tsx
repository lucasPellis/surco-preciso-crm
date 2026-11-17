"use client";

import { Button } from "@crm/ui/components/button";
import type { IconComponent } from "@crm/ui/components/icon";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { SKELETON, skeletonRows } from "@crm/ui/lib/skeleton-config";
import { cn } from "@crm/ui/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	CalendarDaysIcon,
	CheckIcon,
	Clock3Icon,
	MailIcon,
	MessageSquareIcon,
	SquareCheckIcon,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { DetailSheetEmpty, SECTION_TITLE } from "@/components/detail-sheet";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { TIMELINE_COPY } from "@/lib/timeline-config";
import { groupStageChanges } from "@/lib/timeline-groups";
import { useTRPC } from "@/lib/trpc/client";
import { useHydrated } from "@/lib/use-hydrated";
import { ActivityComposer } from "./activity-composer";
import { TimelineEntry, type TimelineEntryData } from "./timeline-entry";
import {
	historyFilter,
	TIMELINE_TABS,
	type TimelineTab,
	timelineTabParser,
} from "./timeline-search-params";
import { TimelineStageGroup } from "./timeline-stage-group";

export type TimelineAnchor =
	| { companyId: string }
	| { contactId: string }
	| { dealId: string };

const TAB_LABELS = {
	all: "Todo",
	notes: "Notas",
	email: "Correo",
	meetings: "Reuniones",
	upcoming: "Pendientes",
	done: "Hechas",
} satisfies Record<TimelineTab, string>;

const EMPTY_STATES = {
	all: {
		title: "Todavía no pasó nada",
		description:
			"Las llamadas, notas, correos y reuniones llegan aquí. Registra la primera arriba o espera a que se sincronicen Gmail y Calendar.",
	},
	notes: {
		title: "Sin notas",
		description:
			"Las notas son lo que escribes para la siguiente persona: qué le importa al cliente, quién más participa y qué prometiste.",
	},
	email: {
		title: "Sin correos",
		description:
			"Los hilos aparecen aquí al sincronizarse desde Gmail. No se importa nada anterior a la conexión de este buzón.",
	},
	meetings: {
		title: "Sin reuniones",
		description:
			"Aquí aparecen los eventos del calendario con alguien de este registro, pasados y próximos.",
	},
	upcoming: {
		title: "Nada pendiente",
		description:
			"Las tareas sin terminar aparecen aquí y arriba en Todo hasta que las completes.",
	},
	done: {
		title: "Todavía no hay tareas hechas",
		description: "Las tareas pasan aquí cuando las marcas como hechas.",
	},
} satisfies Record<TimelineTab, { title: string; description: string }>;

const EMPTY_ICONS = {
	all: Clock3Icon,
	notes: MessageSquareIcon,
	email: MailIcon,
	meetings: CalendarDaysIcon,
	upcoming: SquareCheckIcon,
	done: CheckIcon,
} satisfies Record<TimelineTab, IconComponent>;

const dayFormat = new Intl.DateTimeFormat("es", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
});

function dayLabel(day: string, local: boolean): string {
	const now = new Date();
	const today = dayKey(now.toISOString(), local);
	const yesterdayDate = local
		? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
		: new Date(Date.now() - 86_400_000);
	const yesterday = dayKey(yesterdayDate.toISOString(), local);

	if (day === today) return "Hoy";
	if (day === yesterday) return "Ayer";
	return dayFormat.format(new Date(`${day}T00:00:00`));
}

function byDay(entries: TimelineEntryData[], local: boolean) {
	const groups = new Map<
		string,
		{ day: string; label: string; entries: TimelineEntryData[] }
	>();

	for (const entry of entries) {
		const day = dayKey(entry.occurredAt ?? entry.createdAt, local);

		const group = groups.get(day);
		if (group) {
			group.entries.push(entry);
		} else {
			groups.set(day, { day, label: dayLabel(day, local), entries: [entry] });
		}
	}

	return [...groups.values()];
}

function dayKey(value: string, local: boolean): string {
	if (!local) return value.slice(0, 10);
	const date = new Date(value);
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function TimelineDay({
	label,
	entries,
	anchor,
}: {
	label: string;
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
}) {
	return (
		<section>
			<h3
				className={cn("sticky top-0 z-10 bg-popover pt-5 pb-2", SECTION_TITLE)}
			>
				{label}
			</h3>
			<ul className="divide-y">
				{groupStageChanges(entries).map((row) =>
					row.kind === "entry" ? (
						<TimelineEntry
							key={row.entry.id}
							entry={row.entry}
							anchor={anchor}
						/>
					) : (
						<TimelineStageGroup
							key={row.entries[0]?.id}
							entries={row.entries}
							latest={row.latest}
							anchor={anchor}
						/>
					),
				)}
			</ul>
		</section>
	);
}

export function Timeline({ anchor }: { anchor: TimelineAnchor }) {
	const trpc = useTRPC();
	const hydrated = useHydrated();

	const [tab, setTab] = useQueryState(
		SEARCH_PARAM.record.timeline,
		timelineTabParser,
	);

	const counts = useQuery(trpc.activities.timelineCounts.queryOptions(anchor));

	const pinned = useQuery({
		...trpc.activities.timeline.queryOptions({
			...anchor,
			filter: "upcoming",
			limit: 10,
		}),
		enabled: tab === "all",
	});

	const history = useInfiniteQuery({
		...trpc.activities.timeline.infiniteQueryOptions(
			{ ...anchor, filter: historyFilter(tab) },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	});

	const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
	const pinnedEntries = tab === "all" ? (pinned.data?.entries ?? []) : [];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-col gap-4 border-b pb-4">
				<ActivityComposer anchor={anchor} />

				<ToggleGroup
					type="single"
					value={tab}
					onValueChange={(next) => {
						if (next) void setTab(next as TimelineTab);
					}}
					size="sm"
					spacing={1}
				>
					{TIMELINE_TABS.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{TAB_LABELS[option]}
							{counts.data?.[option] ? (
								<span className="tabular-nums opacity-60">
									{counts.data[option]}
								</span>
							) : null}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{history.isPending ? (
				<ul aria-busy className="flex flex-col gap-4 pt-4">
					{skeletonRows(SKELETON.rows.feed).map((row) => (
						<li key={row} className="flex items-center gap-3">
							<Skeleton className="size-6 shrink-0 rounded-full" />
							<Skeleton className="h-4 flex-1" />
							<Skeleton className="h-4 w-10" />
						</li>
					))}
				</ul>
			) : entries.length === 0 && pinnedEntries.length === 0 ? (
				<DetailSheetEmpty
					icon={EMPTY_ICONS[tab]}
					title={EMPTY_STATES[tab].title}
					description={EMPTY_STATES[tab].description}
				/>
			) : (
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
					{pinnedEntries.length > 0 ? (
						<TimelineDay
							label={TIMELINE_COPY.pinnedDay}
							entries={pinnedEntries}
							anchor={anchor}
						/>
					) : null}

					{byDay(entries, hydrated).map((group) => (
						<TimelineDay
							key={group.day}
							label={group.label}
							entries={group.entries}
							anchor={anchor}
						/>
					))}

					{history.hasNextPage ? (
						<Button
							variant="outline"
							size="sm"
							className="mt-4 self-start"
							disabled={history.isFetchingNextPage}
							onClick={() => history.fetchNextPage()}
						>
							{history.isFetchingNextPage ? <Spinner /> : null}
							{TIMELINE_COPY.showOlder}
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
