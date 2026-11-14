import type { ActivityMeta } from "@crm/validation/activity-meta";
import { z } from "zod";

const STAGE_CHANGE = "STAGE_CHANGE";

const stageMove = z
	.object({ from: z.string(), to: z.string() })
	.nullable()
	.catch(null);

type Groupable = {
	type: string;
	occurredAt: string | null;
	createdAt: string;
};

export type TimelineRow<Entry extends Groupable> =
	| { kind: "entry"; entry: Entry }
	| { kind: "stages"; entries: Entry[]; latest: Entry };

function stamp(entry: Groupable): string {
	return entry.occurredAt ?? entry.createdAt;
}

export function groupStageChanges<Entry extends Groupable>(
	entries: Entry[],
): TimelineRow<Entry>[] {
	const rows: TimelineRow<Entry>[] = [];
	let run: Entry[] = [];

	const flush = () => {
		const [only] = run;
		if (run.length === 1 && only) {
			rows.push({ kind: "entry", entry: only });
		} else if (run.length > 1) {
			const latest = run.reduce((best, entry) =>
				stamp(entry) > stamp(best) ? entry : best,
			);
			rows.push({ kind: "stages", entries: run, latest });
		}
		run = [];
	};

	for (const entry of entries) {
		if (entry.type === STAGE_CHANGE) {
			run.push(entry);
		} else {
			flush();
			rows.push({ kind: "entry", entry });
		}
	}
	flush();

	return rows;
}

export function stageMoveLabel(
	meta: ActivityMeta,
	label: (key: string) => string,
): string | null {
	const move = stageMove.parse(meta);
	return move ? `${label(move.from)} → ${label(move.to)}` : null;
}
