"use client";

import type { DealStage } from "@crm/db/enums";
import { LeadSourceMark } from "@crm/ui/components/lead-source-mark";
import {
	PipelineBoard,
	PipelineCard,
	PipelineCardPreview,
	PipelineColumn,
} from "@crm/ui/components/pipeline-board";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { OwnerCell } from "@/components/crm/owner-cell";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu, useRequestClose } from "@/components/crm/stage-change";
import { dealStageLabel, LOSING_STAGES } from "@/lib/deal-stage";
import { moveCard, type PipelineBoardData } from "@/lib/pipeline-board";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { overviewParsers } from "../overview-search-params";

type BoardCard = PipelineBoardData["columns"][number]["cards"][number];

function CardBody({ card }: { card: BoardCard }) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<span className="truncate font-medium">{card.name}</span>
			<span className="truncate text-13 text-muted-foreground">
				{card.company.name}
			</span>
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

export function PipelineView() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);
	const requestClose = useRequestClose();

	const input = { scope };
	const board = useQuery({
		...trpc.deals.board.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onMutate: async (variables) => {
				const key = trpc.deals.board.queryKey(input);
				await queryClient.cancelQueries({ queryKey: key });
				const previous = queryClient.getQueryData(key);
				if (previous) {
					queryClient.setQueryData(
						key,
						moveCard(previous, variables.id, variables.stage),
					);
				}
				return { previous, key };
			},
			onError: (error, _variables, context) => {
				if (context?.previous) {
					queryClient.setQueryData(context.key, context.previous);
				}
				toast.error(error.message);
			},
			onSettled: (_data, _error, variables) => cache.deal(variables.id),
		}),
	);

	if (board.isError) {
		return (
			<p className="text-muted-foreground text-sm">
				No se pudo cargar el embudo. {board.error.message}
			</p>
		);
	}

	if (!board.data) return null;

	const { columns, reportingCurrency, closedWindowDays } = board.data;
	const cards = new Map(
		columns.flatMap((column) => column.cards.map((card) => [card.id, card])),
	);

	const onMove = (cardId: string, columnId: string) => {
		const card = cards.get(cardId);
		const target = columnId as DealStage;
		if (!card || card.stage === target) return;

		if (LOSING_STAGES.includes(target)) {
			requestClose(cardId, target);
			return;
		}

		setStage.mutate({ id: cardId, stage: target });
	};

	return (
		<PipelineBoard
			label="Embudo de oportunidades"
			onMove={onMove}
			overlay={(cardId) => {
				const card = cards.get(cardId);
				return card ? (
					<PipelineCardPreview>
						<CardBody card={card} />
					</PipelineCardPreview>
				) : null;
			}}
		>
			{columns.map((column) => {
				const closed = column.stage === "WON" || column.stage === "LOST";
				return (
					<PipelineColumn
						key={column.stage}
						id={column.stage}
						title={dealStageLabel(column.stage)}
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
