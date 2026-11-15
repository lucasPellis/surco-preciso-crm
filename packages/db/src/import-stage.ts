import { ImportStageKind, PipelineStageTone } from "./generated/prisma/enums";

export const IMPORT_STAGE = {
	nameMaxLength: 40,
	firstIntermediatePosition: 1,
	fixedEndPosition: 1000,
	defaultTone: PipelineStageTone.NEUTRAL,
} as const;

type ImportStageShape = { isEntry: boolean; kind: ImportStageKind };

export function isClosedImportKind(kind: ImportStageKind): boolean {
	return kind !== ImportStageKind.IN_PROGRESS;
}

export function isFixedImportStage(stage: ImportStageShape): boolean {
	return stage.isEntry || isClosedImportKind(stage.kind);
}
