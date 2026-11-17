"use client";

import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useStages } from "@/lib/use-stages";

export function DealStageIndicator({
	stage,
	className,
}: {
	stage: string;
	className?: string;
}) {
	const stages = useStages();
	return (
		<StatusIndicator
			tone={stages.tone(stage)}
			label={stages.label(stage)}
			className={className}
		/>
	);
}
