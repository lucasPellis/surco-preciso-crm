const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_WINDOW_DAYS = 30;

export const DEAL_BOARD = {
	cardsPerColumn: 50,
	closedWindowDays: CLOSED_WINDOW_DAYS,
	closedWindowMs: CLOSED_WINDOW_DAYS * DAY_MS,
} as const;
