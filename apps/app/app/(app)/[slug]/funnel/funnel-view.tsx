"use client";

import { LeadSourceMark } from "@crm/ui/components/lead-source-mark";
import { Link } from "@crm/ui/components/link";
import {
	PipelineBoard,
	PipelineCard,
	PipelineCardPreview,
	PipelineColumn,
} from "@crm/ui/components/pipeline-board";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { startTransition, useOptimistic } from "react";
import { toast } from "sonner";
import { OwnerCell } from "@/components/crm/owner-cell";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu, useRequestClose } from "@/components/crm/stage-change";
import { idleLabel } from "@/lib/deal-stage";
import { showCompanyLine, taskLine } from "@/lib/funnel-card";
import { FUNNEL_CARD } from "@/lib/funnel-card-config";
import { moveCard, type PipelineBoardData } from "@/lib/pipeline-board";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useStages } from "@/lib/use-stages";
import { overviewParsers } from "../overview-search-params";

type BoardCard = PipelineBoardData["columns"][number]["cards"][number];

function CardBody({ card }: { card: BoardCard }) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<span className="truncate font-medium">{card.name}</span>
			{showCompanyLine(card.name, card.company.name) ? (
				<span className="truncate text-13 text-muted-foreground">
					{card.company.name}
				</span>
			) : null}
			{card.idleHours === null ? null : (
				<span className="text-13 text-status-warning-text">
					{idleLabel(card.idleHours)}
				</span>
			)}
			{card.task ? <CardTask task={card.task} /> : null}
			<span className="flex items-center justify-between gap-2 text-13">
				<span className="tabular-nums">
					{card.amountCents === null
						? "Sin monto"
						: formatMoney(card.amountCents, card.currency)}
				</span>
				{card.leadSource ? (
					<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
						<LeadSourceMark icon={card.leadSource.icon} />
						<span className="truncate">{card.leadSource.name}</span>
					</span>
				) : null}
			</span>
		</div>
	);
}

function CardTask({ task }: { task: NonNullable<BoardCard["task"]> }) {
	const line = taskLine(task);
	return (
		<span className="flex min-w-0 items-baseline gap-1.5 text-13">
			<span
				className={
					line.overdue
						? "shrink-0 text-destructive"
						: "shrink-0 text-muted-foreground"
				}
			>
				{line.hint}
			</span>
			<span className="truncate">{line.title}</span>
		</span>
	);
}

function CardPhone({ phone, linked }: { phone: string; linked: boolean }) {
	return linked ? (
		<Link
			variant="quiet"
			href={`tel:${phone}`}
			aria-label={FUNNEL_CARD.copy.phoneLabel(phone)}
			className="mt-1.5 block truncate text-13 text-muted-foreground tabular-nums"
		>
			{phone}
		</Link>
	) : (
		<span className="mt-1.5 block truncate text-13 text-muted-foreground tabular-nums">
			{phone}
		</span>
	);
}

export function FunnelView() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);
	const requestClose = useRequestClose();
	const stages = useStages();

	const input = { scope };
	const board = useQuery({
		...trpc.deals.board.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const [optimisticBoard, applyMove] = useOptimistic(
		board.data,
		(current, move: { id: string; stage: string }) =>
			current ? moveCard(current, move.id, move.stage) : current,
	);

	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSettled: (_data, _error, variables) => cache.deal(variables.id),
		}),
	);

	if (board.isError) {
		return (
			<p className="text-muted-foreground text-sm">
				No se pudo cargar el funnel. {board.error.message}
			</p>
		);
	}

	if (!optimisticBoard) return null;

	const { columns, reportingCurrency, closedWindowDays } = optimisticBoard;
	const cards = new Map(
		columns.flatMap((column) => column.cards.map((card) => [card.id, card])),
	);

	const onMove = (cardId: string, columnId: string) => {
		const card = cards.get(cardId);
		const target = columnId;
		if (!stages.ready || !card || card.stage === target) return;

		if (stages.isLosing(target)) {
			requestClose(cardId, target);
			return;
		}

		startTransition(async () => {
			applyMove({ id: cardId, stage: target });
			await setStage
				.mutateAsync({ id: cardId, stage: target })
				.catch(() => undefined);
		});
	};

	return (
		<PipelineBoard
			label="Funnel de oportunidades"
			onMove={onMove}
			overlay={(cardId) => {
				const card = cards.get(cardId);
				return card ? (
					<PipelineCardPreview>
						<CardBody card={card} />
						{card.phone ? (
							<CardPhone phone={card.phone} linked={false} />
						) : null}
					</PipelineCardPreview>
				) : null;
			}}
		>
			{columns.map((column) => {
				const closed = stages.isClosed(column.stage);
				return (
					<PipelineColumn
						key={column.stage}
						id={column.stage}
						title={stages.label(column.stage)}
						count={column.total}
						summary={
							column.valueCents === null
								? closed
									? `Últimos ${closedWindowDays} días`
									: undefined
								: `${formatMoney(column.valueCents, reportingCurrency)}${closed ? ` · últimos ${closedWindowDays} días` : ""}`
						}
					>
						{column.cards.map((card) => (
							<PipelineCard key={card.id} id={card.id} label={card.name}>
								<button
									type="button"
									className="block w-full min-w-0 text-left outline-none focus-visible:shadow-focus"
									onClick={() => openRecord({ kind: "deal", id: card.id })}
								>
									<CardBody card={card} />
								</button>
								{card.phone ? <CardPhone phone={card.phone} linked /> : null}
								<div className="mt-1.5 flex items-center justify-between gap-2">
									<DealStageMenu dealId={card.id} stage={card.stage} />
									<OwnerCell owner={card.owner} compact />
								</div>
							</PipelineCard>
						))}
						{column.total > column.cards.length ? (
							<li className="px-1.5 text-13 text-muted-foreground">
								Y {column.total - column.cards.length} más. Usa Oportunidades
								para verlas todas.
							</li>
						) : null}
					</PipelineColumn>
				);
			})}
		</PipelineBoard>
	);
}
