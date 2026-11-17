"use client";

import { IndicatorDot } from "@crm/ui/components/status-indicator";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { daysInStageLabel } from "@/lib/deal-sheet";
import { type StageCatalog, stepperSteps } from "@/lib/deal-stage";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useStages } from "@/lib/use-stages";

export function StageStepper({
	dealId,
	stage,
	stageChangedAt,
}: {
	dealId: string;
	stage: string;
	stageChangedAt?: string;
}) {
	const sinceLabel = stageChangedAt
		? daysInStageLabel(stageChangedAt, new Date())
		: null;
	const stages = useStages();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal(dealId);
				if (result.changed) toast.success("Etapa actualizada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const { steps, trailing } = stepperSteps(stages, stage);
	const currentIndex = steps.indexOf(stage);

	return (
		<ol className="flex w-full gap-1">
			{steps.map((option, index) => {
				const reached = !trailing && index <= currentIndex;
				const current = !trailing && option === stage;
				return (
					<li key={option} className="flex min-w-0 flex-1">
						<button
							type="button"
							aria-current={current ? "step" : undefined}
							disabled={setStage.isPending}
							onClick={() => setStage.mutate({ id: dealId, stage: option })}
							className={cn(
								"group/step flex min-w-0 flex-1 flex-col gap-2 rounded-xs text-left text-xs outline-none transition-colors focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50",
								reached
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
								current && "font-medium",
							)}
						>
							<span
								aria-hidden
								className={cn(
									"h-1.5 rounded-full transition-colors",
									reached
										? "bg-foreground"
										: "bg-foreground/10 group-hover/step:bg-foreground/30",
								)}
							/>
							<span className="text-pretty wrap-break-word leading-4">
								{current && stages.isWon(option) ? (
									<StageOutcome stage={stage} stages={stages} />
								) : (
									stages.label(option)
								)}
							</span>
							{current && sinceLabel ? (
								<span className="font-normal text-13 text-muted-foreground">
									{sinceLabel}
								</span>
							) : null}
						</button>
					</li>
				);
			})}

			{trailing ? (
				<li className="flex min-w-0 flex-1">
					<div
						aria-current="step"
						className="flex min-w-0 flex-1 flex-col gap-2 text-xs leading-4"
					>
						<span aria-hidden className="h-1.5 rounded-full bg-foreground" />
						<StageOutcome stage={stage} stages={stages} />
						{sinceLabel ? (
							<span className="text-13 text-muted-foreground">
								{sinceLabel}
							</span>
						) : null}
					</div>
				</li>
			) : null}
		</ol>
	);
}

function StageOutcome({
	stage,
	stages,
}: {
	stage: string;
	stages: StageCatalog;
}) {
	const label = stages.label(stage);
	const tone = stages.tone(stage);
	return (
		<span className="flex min-w-0 items-baseline gap-1.5">
			<IndicatorDot tone={tone} aria-hidden="true" className="translate-y-px" />
			<span className="text-pretty wrap-break-word">{label}</span>
		</span>
	);
}
