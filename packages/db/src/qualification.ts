import { fieldKeyFromLabel } from "./fields-shape";
import { FieldType } from "./generated/prisma/enums";

export const QUALIFICATION = {
	stageKey: "QUALIFIED",
	questions: [
		{ label: "¿Qué necesita?", type: FieldType.TEXT, options: [] },
		{
			label: "¿Cómo piensa pagarlo?",
			type: FieldType.SELECT,
			options: ["Contado", "Financiado", "No sabe"],
		},
		{
			label: "¿Habla con quien decide?",
			type: FieldType.SELECT,
			options: ["Sí", "No", "No sé"],
		},
		{ label: "¿Para cuándo lo necesita?", type: FieldType.DATE, options: [] },
	],
} as const;

export const QUALIFICATION_KEYS: readonly string[] =
	QUALIFICATION.questions.map((question) => fieldKeyFromLabel(question.label));
