import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { PipelineStageKind } from "./generated/prisma/enums";

export const DEFAULT_STAGE_KEYS = [
	"NEW",
	"CONTACTED",
	"QUALIFIED",
	"QUOTED",
	"NEGOTIATING",
	"NO_RESPONSE",
	"WON",
	"LOST",
] as const;

export const OPEN_STAGE_FILTER = {
	pipelineStage: { kind: PipelineStageKind.OPEN },
} satisfies Prisma.DealWhereInput;

export const CLOSED_STAGE_FILTER = {
	pipelineStage: {
		kind: { in: [PipelineStageKind.WON, PipelineStageKind.LOST] },
	},
} satisfies Prisma.DealWhereInput;

export const NOT_CLOSED_STAGE_FILTER = {
	pipelineStage: {
		kind: { notIn: [PipelineStageKind.WON, PipelineStageKind.LOST] },
	},
} satisfies Prisma.DealWhereInput;

export function isClosedKind(kind: PipelineStageKind): boolean {
	return kind === PipelineStageKind.WON || kind === PipelineStageKind.LOST;
}

export function isLosingKind(kind: PipelineStageKind): boolean {
	return kind === PipelineStageKind.LOST;
}

export function isContactedKind(kind: PipelineStageKind): boolean {
	return kind === PipelineStageKind.OPEN || kind === PipelineStageKind.PAUSED;
}

export function firstContactStamp(
	from: { isEntry: boolean },
	to: { isEntry: boolean; kind: PipelineStageKind },
	current: Date | null,
	now: Date,
): Date | null {
	if (current) return current;
	return from.isEntry && !to.isEntry && isContactedKind(to.kind) ? now : null;
}

export async function entryStage(client: Pick<Db, "pipelineStage">) {
	return client.pipelineStage.findFirstOrThrow({
		where: { isEntry: true, archivedAt: null },
		select: { key: true, kind: true, isEntry: true, archivedAt: true },
	});
}
