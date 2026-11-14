"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { Icon } from "@crm/ui/components/icon";
import { ChevronRightIcon } from "lucide-react";
import { TIMELINE_COPY } from "@/lib/timeline-config";
import { stageMoveLabel } from "@/lib/timeline-groups";
import { useStages } from "@/lib/use-stages";
import type { TimelineAnchor } from "./timeline";
import { TimelineEntry, type TimelineEntryData } from "./timeline-entry";

export function TimelineStageGroup({
	entries,
	latest,
	anchor,
}: {
	entries: TimelineEntryData[];
	latest: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const stages = useStages();
	const move = stageMoveLabel(latest.meta, stages.label);

	return (
		<li>
			<Collapsible>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="group/stages flex w-full items-center gap-2.5 rounded-sm py-3 text-left text-muted-foreground outline-none focus-visible:shadow-focus"
					>
						<Icon
							icon={ChevronRightIcon}
							className="shrink-0 transition-transform group-data-[state=open]/stages:rotate-90"
						/>
						<span className="font-medium text-foreground">
							{TIMELINE_COPY.stageGroup.count(entries.length)}
						</span>
						{move ? (
							<span className="min-w-0 truncate">
								{TIMELINE_COPY.stageGroup.latest(move)}
							</span>
						) : null}
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<ul className="divide-y">
						{entries.map((entry) => (
							<TimelineEntry key={entry.id} entry={entry} anchor={anchor} />
						))}
					</ul>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}
