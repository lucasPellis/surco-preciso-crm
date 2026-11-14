"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { DashboardPanel } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { PageShellLoading } from "@crm/ui/components/page-shell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { ValueMeter } from "@crm/ui/components/value-meter";
import { formatCount, formatMoneyCompact } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalRelativeTime } from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useStages } from "@/lib/use-stages";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { overviewParsers } from "./overview-search-params";
import { SalesDashboard } from "./sales-dashboard";

const CELL = "px-3 py-2.5 align-middle";
const STAGE_CELL = "hidden @lg/simple-table:table-cell";
const SHARE_CELL = "hidden @sm/simple-table:table-cell";
const COMPANY_CELL = "hidden @md/simple-table:table-cell";
const ACTIVITY_DEAL_CELL = "hidden @2xl/simple-table:table-cell";
const WHO_CELL = "hidden @lg/simple-table:table-cell";
const OPEN_COLUMNS: SimpleTableColumn[] = [
	{ id: "deal", header: "Oportunidad" },
	{
		id: "stage",
		header: "Etapa",
		width: "w-44",
		className: STAGE_CELL,
	},
	{
		id: "share",
		srLabel: "Proporción respecto a la mayor oportunidad",
		width: "w-24",
		className: SHARE_CELL,
	},
	{ id: "value", header: "Valor", width: "w-20", align: "right" },
];
const TASK_COLUMNS: SimpleTableColumn[] = [
	{ id: "done", srLabel: "Completada", width: "w-8" },
	{ id: "task", header: "Tarea" },
	{ id: "overdue", header: "Vencimiento", width: "w-24", align: "right" },
];
const ACTIVITY_COLUMNS: SimpleTableColumn[] = [
	{ id: "activity", header: "Actividad" },
	{
		id: "company",
		header: "Empresa",
		width: "w-44",
		className: COMPANY_CELL,
	},
	{
		id: "deal",
		header: "Oportunidad",
		width: "w-48",
		className: ACTIVITY_DEAL_CELL,
	},
	{
		id: "who",
		header: "Quién",
		width: "w-32",
		className: WHO_CELL,
	},
	{ id: "when", header: "Cuándo", width: "w-20", align: "right" },
];

export function DashboardSummary() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const workspaceUrl = useWorkspaceUrl();
	const stages = useStages();

	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	const summaryQuery = useQuery({
		...trpc.dashboard.summary.queryOptions({ scope }),
		placeholderData: (previous) => previous,
	});

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const summary = summaryQuery.data;

	if (!summary) {
		return <PageShellLoading shape="dashboard" />;
	}

	const { biggestOpen, overdueTasks, recentActivity } = summary;

	const mine = scope === "me";
	const largestOpenCents = biggestOpen[0]?.baseAmountCents ?? 0;

	return (
		<div className="flex flex-col gap-6">
			<SalesDashboard summary={summary} />

			<div className="grid gap-6 @3xl/page-content:grid-cols-2">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Oportunidades en progreso</CardTitle>
						<CardDescription>
							Las oportunidades abiertas de mayor valor y el tiempo que llevan
							en su etapa
						</CardDescription>
						<CardAction>
							<Button asChild variant="outline" size="sm">
								<Link href={workspaceUrl("/deals")}>Ver oportunidades</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<DashboardPanel>
						{biggestOpen.length === 0 ? (
							<CardPanelEmpty>
								No hay oportunidades abiertas. Agrega una oportunidad para
								comenzar.
							</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="card"
								columns={OPEN_COLUMNS}
							>
								{biggestOpen.map((deal) => (
									<SimpleTableRow
										key={deal.id}
										clickable
										onClick={() =>
											openRecord(
												{ kind: "deal", id: deal.id },
												biggestOpen.map((entry) => ({
													kind: "deal",
													id: entry.id,
												})),
											)
										}
									>
										<TableCell className={CELL}>
											<DealCell
												name={deal.name}
												company={deal.company}
												meta={<LocalRelativeTime date={deal.stageChangedAt} />}
											/>
										</TableCell>
										<TableCell className={`${CELL} ${STAGE_CELL}`}>
											<DealStageIndicator stage={deal.stage} />
										</TableCell>
										<TableCell className={`${CELL} ${SHARE_CELL}`}>
											<ValueMeter
												share={
													largestOpenCents > 0
														? ((deal.baseAmountCents ?? 0) / largestOpenCents) *
															100
														: 0
												}
												color={stages.chartColor(deal.stage)}
											/>
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{deal.amountCents === null ? (
												<EmptyCellValue />
											) : (
												formatMoneyCompact(deal.amountCents, deal.currency)
											)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</DashboardPanel>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Tareas vencidas</CardTitle>
						<CardDescription>
							{overdueTasks.length === 0
								? "Todas las tareas registradas están completadas o pendientes de vencer"
								: `${formatCount(overdueTasks.length, "tarea")} ${overdueTasks.length === 1 ? "vencida" : "vencidas"}`}
						</CardDescription>
						<CardAction>
							<Button asChild variant="outline" size="sm">
								<Link href={workspaceUrl("/tasks")}>Ver tareas</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<DashboardPanel>
						{overdueTasks.length === 0 ? (
							<CardPanelEmpty>No hay tareas vencidas.</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="card"
								columns={TASK_COLUMNS}
							>
								{overdueTasks.map((task) => (
									<SimpleTableRow key={task.id}>
										<TableCell className={CELL}>
											<Checkbox
												checked={false}
												disabled={complete.isPending}
												aria-label="Marcar como completada"
												onCheckedChange={() =>
													complete.mutate({ id: task.id, completed: true })
												}
											/>
										</TableCell>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate">{task.subject}</span>
												<span className="flex min-w-0 text-muted-foreground">
													{task.deal ? (
														<RecordLink kind="deal" id={task.deal.id}>
															{task.deal.name}
														</RecordLink>
													) : task.company ? (
														<RecordLink kind="company" id={task.company.id}>
															{task.company.name}
														</RecordLink>
													) : null}
												</span>
											</span>
										</TableCell>
										<TableCell className={`${CELL} text-right`}>
											<StatusIndicator
												tone="error"
												label={
													task.dueAt ? (
														<LocalRelativeTime date={task.dueAt} />
													) : (
														"Sin fecha de vencimiento"
													)
												}
											/>
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</DashboardPanel>
				</Card>
			</div>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>
						{mine ? "Tu actividad reciente" : "Actividad reciente"}
					</CardTitle>
					<CardDescription>
						{mine
							? "Las notas, tareas y cambios de etapa que has registrado"
							: "Las notas, tareas y cambios de etapa del espacio de trabajo"}
					</CardDescription>
					<CardAction>
						<Button asChild variant="outline" size="sm">
							<Link href={workspaceUrl("/companies")}>Ver empresas</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<DashboardPanel>
					{recentActivity.length === 0 ? (
						<CardPanelEmpty>Todavía no hay actividad.</CardPanelEmpty>
					) : (
						<SimpleTable
							variant="panel"
							surface="card"
							columns={ACTIVITY_COLUMNS}
						>
							{recentActivity.map((entry) => (
								<SimpleTableRow key={entry.id}>
									<TableCell className={CELL}>
										<span className="truncate">
											{entry.subject ?? activityLabel(entry.type)}
										</span>
									</TableCell>
									<TableCell className={`${CELL} ${COMPANY_CELL}`}>
										{entry.company ? (
											<RecordLink kind="company" id={entry.company.id}>
												{entry.company.name}
											</RecordLink>
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
									<TableCell className={`${CELL} ${ACTIVITY_DEAL_CELL}`}>
										{entry.deal ? (
											<RecordLink kind="deal" id={entry.deal.id}>
												{entry.deal.name}
											</RecordLink>
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
									<TableCell
										className={`${CELL} ${WHO_CELL} truncate text-muted-foreground`}
									>
										{entry.createdBy.name}
									</TableCell>
									<TableCell
										className={`${CELL} text-right text-muted-foreground`}
									>
										<LocalRelativeTime date={entry.createdAt} />
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</DashboardPanel>
			</Card>
		</div>
	);
}

function DealCell({
	name,
	company,
	meta,
}: {
	name: string;
	company: {
		name: string;
		iconUrl: string | null;
		iconDarkUrl: string | null;
		iconTone: string | null;
	};
	meta?: ReactNode;
}) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<EntityLogo
				src={company.iconUrl}
				darkSrc={company.iconDarkUrl}
				tone={company.iconTone as EntityLogoTone | null | undefined}
				name={company.name}
				size="sm"
			/>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium">{name}</span>
				<span className="flex min-w-0 items-baseline gap-x-3 text-muted-foreground">
					<span className="truncate">{company.name}</span>
					{meta ? <span className="shrink-0">{meta}</span> : null}
				</span>
			</span>
		</span>
	);
}
