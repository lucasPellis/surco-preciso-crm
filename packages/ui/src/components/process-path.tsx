import {
	PROCESS_PATH,
	type ProcessPathState,
} from "@crm/ui/lib/process-path-config";
import { cn } from "@crm/ui/lib/utils";

export type ProcessPathStep = {
	key: string;
	label: string;
	state: ProcessPathState;
	detail: string | null;
};

const BAR_CLASS: Record<ProcessPathState, string> = {
	done: "bg-brand forced-colors:bg-[CanvasText]",
	current: "bg-brand/40 forced-colors:bg-[Highlight]",
	pending: "bg-muted",
};

function ProcessPath({
	steps,
	label,
	className,
}: {
	steps: readonly ProcessPathStep[];
	label: string;
	className?: string;
}) {
	return (
		<ol
			data-slot="process-path"
			aria-label={label}
			className={cn(
				"flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-2",
				className,
			)}
		>
			{steps.map((step) => (
				<li
					key={step.key}
					data-slot="process-path-step"
					data-state={step.state}
					aria-current={step.state === "current" ? "step" : undefined}
					className="flex min-w-0 flex-col gap-1.5 sm:min-w-28 sm:flex-1"
				>
					<span
						aria-hidden="true"
						className={cn(
							"h-1 rounded-sm forced-colors:outline-1 forced-colors:outline-[CanvasText] forced-colors:outline-solid",
							BAR_CLASS[step.state],
						)}
					/>
					<span
						className={cn(
							"text-pretty text-sm",
							step.state === "pending"
								? "text-muted-foreground"
								: "font-medium text-foreground",
						)}
					>
						{step.label}
					</span>
					<span className="sr-only">
						{PROCESS_PATH.stateLabels[step.state]}
					</span>
					{step.detail === null ? null : (
						<span
							data-slot="process-path-detail"
							className="text-13 text-muted-foreground tabular-nums"
						>
							{step.detail}
						</span>
					)}
				</li>
			))}
		</ol>
	);
}

export { ProcessPath };
