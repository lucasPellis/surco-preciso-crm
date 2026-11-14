import type { DealStage } from "@crm/db/enums";
import type { RouterOutputs } from "@/lib/trpc/types";

export type PipelineBoardData = RouterOutputs["deals"]["board"];

export function moveCard(
	board: PipelineBoardData,
	id: string,
	to: DealStage,
): PipelineBoardData {
	const from = board.columns.find((column) =>
		column.cards.some((card) => card.id === id),
	);
	if (!from || from.stage === to) return board;

	const card = from.cards.find((entry) => entry.id === id);
	if (!card) return board;

	return {
		...board,
		columns: board.columns.map((column) => {
			if (column.stage === from.stage) {
				return {
					...column,
					total: column.total - 1,
					cards: column.cards.filter((entry) => entry.id !== id),
				};
			}
			if (column.stage === to) {
				return {
					...column,
					total: column.total + 1,
					cards: [{ ...card, stage: to }, ...column.cards],
				};
			}
			return column;
		}),
	};
}
