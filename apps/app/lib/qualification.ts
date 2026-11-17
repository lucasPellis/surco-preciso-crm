import { QUALIFICATION } from "@crm/db/qualification";

export type QualificationCount = { answered: number; total: number } | null;

export function qualificationGate(
	stage: string,
	qualification: QualificationCount,
) {
	if (stage !== QUALIFICATION.stageKey || qualification === null) {
		return { warn: false, missing: 0 };
	}
	const missing = Math.max(qualification.total - qualification.answered, 0);
	return { warn: missing > 0, missing };
}

export function qualificationBadge(qualification: QualificationCount) {
	return qualification === null
		? null
		: `${qualification.answered}/${qualification.total}`;
}

export const QUALIFICATION_COPY = {
	counterLabel: "Preguntas de calificación respondidas",
	warning: (missing: number) =>
		missing === 1
			? "Falta responder 1 pregunta de calificación."
			: `Faltan responder ${missing} preguntas de calificación.`,
} as const;
