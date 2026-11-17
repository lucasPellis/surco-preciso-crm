import { ImportStageKind, PipelineStageTone } from "./generated/prisma/enums";
import { IMPORT_STAGE } from "./import-stage";
import { uniqueStageKey } from "./pipeline-stage";

export type ImportStageTemplate = {
	name: string;
	kind: ImportStageKind;
	tone: PipelineStageTone;
	position: number;
	isEntry: boolean;
};

export type KeyedImportStage = ImportStageTemplate & { key: string };

export const IMPORT_PROCESS = {
	nameMaxLength: 60,
	fallbackStageName: "Etapa",
	fixedStages: [
		{
			name: "Pedido",
			kind: ImportStageKind.IN_PROGRESS,
			tone: PipelineStageTone.NEUTRAL,
			position: IMPORT_STAGE.entryPosition,
			isEntry: true,
		},
		{
			name: "Recibido",
			kind: ImportStageKind.RECEIVED,
			tone: PipelineStageTone.SUCCESS,
			position: IMPORT_STAGE.fixedEndPosition,
			isEntry: false,
		},
		{
			name: "Cancelado",
			kind: ImportStageKind.CANCELLED,
			tone: PipelineStageTone.ERROR,
			position: IMPORT_STAGE.cancelledPosition,
			isEntry: false,
		},
	],
} as const;

export function keyedStages(
	templates: readonly ImportStageTemplate[],
	taken: ReadonlySet<string>,
): KeyedImportStage[] {
	const used = new Set(taken);
	return templates.map((template) => {
		const key =
			uniqueStageKey(template.name, used) ||
			uniqueStageKey(IMPORT_PROCESS.fallbackStageName, used);
		used.add(key);
		return { ...template, key };
	});
}
