import { describe, expect, it } from "bun:test";
import {
	blankDraft,
	draftTotals,
	formatDay,
	type ImportOrderLine,
	type ImportShipment,
	type ImportStageOption,
	lineSubtotalCents,
	nextStageKey,
	orderStatusLabel,
	orderTotals,
	routePreview,
	shareOf,
	shipmentPath,
	shipmentsLabel,
} from "../lib/import-orders";

const STAGES: ImportStageOption[] = [
	{
		key: "PEDIDO",
		name: "Pedido",
		kind: "IN_PROGRESS",
		tone: "NEUTRAL",
		expectedLabels: [],
	},
	{
		key: "DOCS",
		name: "Documentos",
		kind: "IN_PROGRESS",
		tone: "NEUTRAL",
		expectedLabels: [],
	},
	{
		key: "RECIBIDO",
		name: "Recibido",
		kind: "RECEIVED",
		tone: "SUCCESS",
		expectedLabels: [],
	},
	{
		key: "CANCELADO",
		name: "Cancelado",
		kind: "CANCELLED",
		tone: "ERROR",
		expectedLabels: [],
	},
];

function stageOf(key: string): ImportStageOption {
	const found = STAGES.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

type Visit = {
	key: string;
	day: string;
	days: number | null;
	running: boolean;
};

function shipment(visits: readonly Visit[]): ImportShipment {
	const last = visits.at(-1);
	if (!last) throw new Error("A shipment needs a visit.");
	return {
		id: "s-1",
		reference: null,
		trackingNumber: null,
		stage: stageOf(last.key),
		stageChangedAt: last.day,
		lines: [],
		events: visits.map((visit, index) => ({
			id: `e-${index}`,
			stage: stageOf(visit.key),
			occurredAt: visit.day,
			days: visit.days,
			running: visit.running,
		})),
		orderToReceivedDays: null,
		documents: [],
	};
}

function line(
	quantity: number,
	shipped: number,
	received: number,
): ImportOrderLine {
	return {
		id: `l-${quantity}-${shipped}-${received}`,
		productId: "p-1",
		sku: "SKU-1",
		productName: "Equipo",
		quantity,
		unitCostCents: 12_345,
		dealId: null,
		dealName: null,
		shipped,
		received,
		remaining: quantity - shipped,
	};
}

const atDocs = shipment([
	{ key: "PEDIDO", day: "2026-01-10", days: 5, running: false },
	{ key: "DOCS", day: "2026-01-15", days: 3, running: true },
]);

const received = shipment([
	{ key: "PEDIDO", day: "2026-01-10", days: 10, running: false },
	{ key: "RECIBIDO", day: "2026-01-20", days: null, running: false },
]);

const cancelled = shipment([
	{ key: "PEDIDO", day: "2026-01-10", days: 2, running: false },
	{ key: "CANCELADO", day: "2026-01-12", days: null, running: false },
]);

describe("the route of a process", () => {
	it("leaves out the cancelled stage and shows every step as pending", () => {
		expect(routePreview(STAGES)).toEqual([
			{ key: "PEDIDO", label: "Pedido", state: "pending", detail: null },
			{ key: "DOCS", label: "Documentos", state: "pending", detail: null },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});

	it("gives the next step and nothing after the last one", () => {
		expect(nextStageKey(STAGES, "PEDIDO")).toBe("DOCS");
		expect(nextStageKey(STAGES, "DOCS")).toBe("RECIBIDO");
		expect(nextStageKey(STAGES, "RECIBIDO")).toBeNull();
		expect(nextStageKey(STAGES, "CANCELADO")).toBeNull();
		expect(nextStageKey(STAGES, "ARCHIVADA")).toBeNull();
	});
});

describe("the path of a shipment", () => {
	it("dates the done steps and counts the days of the current one", () => {
		expect(shipmentPath(STAGES, atDocs)).toEqual([
			{
				key: "PEDIDO",
				label: "Pedido",
				state: "done",
				detail: formatDay("2026-01-10"),
			},
			{ key: "DOCS", label: "Documentos", state: "current", detail: "3 días" },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});

	it("marks a received shipment done and names a skipped step", () => {
		expect(shipmentPath(STAGES, received)).toEqual([
			{
				key: "PEDIDO",
				label: "Pedido",
				state: "done",
				detail: formatDay("2026-01-10"),
			},
			{ key: "DOCS", label: "Documentos", state: "pending", detail: "Omitida" },
			{
				key: "RECIBIDO",
				label: "Recibido",
				state: "done",
				detail: formatDay("2026-01-20"),
			},
		]);
	});

	it("keeps the steps of a cancelled shipment pending after its last event", () => {
		expect(shipmentPath(STAGES, cancelled)).toEqual([
			{
				key: "PEDIDO",
				label: "Pedido",
				state: "done",
				detail: formatDay("2026-01-10"),
			},
			{ key: "DOCS", label: "Documentos", state: "pending", detail: null },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});

	it("shows the steps after the current one as pending when it went back", () => {
		const back = shipment([
			{ key: "PEDIDO", day: "2026-01-10", days: 2, running: false },
			{ key: "DOCS", day: "2026-01-12", days: 1, running: false },
			{ key: "PEDIDO", day: "2026-01-13", days: 4, running: true },
		]);

		expect(shipmentPath(STAGES, back)).toEqual([
			{ key: "PEDIDO", label: "Pedido", state: "current", detail: "4 días" },
			{ key: "DOCS", label: "Documentos", state: "pending", detail: null },
			{ key: "RECIBIDO", label: "Recibido", state: "pending", detail: null },
		]);
	});
});

describe("totals", () => {
	it("gives the subtotal of a valid line only", () => {
		expect(
			lineSubtotalCents({ ...blankDraft("a"), quantity: "3", cost: "12.50" }),
		).toBe(3750);
		expect(
			lineSubtotalCents({ ...blankDraft("a"), quantity: "3", cost: "" }),
		).toBeNull();
		expect(
			lineSubtotalCents({ ...blankDraft("a"), quantity: "x", cost: "1" }),
		).toBeNull();
	});

	it("adds the valid lines of a draft and skips the others", () => {
		expect(
			draftTotals([
				{ ...blankDraft("a"), quantity: "3", cost: "12.50" },
				{ ...blankDraft("b"), quantity: "2", cost: "abc" },
				{ ...blankDraft("c"), quantity: "1", cost: "1,5" },
			]),
		).toEqual({ cents: 3900, units: 4 });
		expect(draftTotals([])).toEqual({ cents: 0, units: 0 });
	});

	it("adds the saved lines of an order", () => {
		expect(orderTotals([line(10, 0, 0), line(2, 0, 0)])).toEqual({
			cents: 148_140,
			units: 12,
		});
	});
});

describe("the state of an order", () => {
	it("names the four states", () => {
		expect(orderStatusLabel([line(10, 0, 0)], [])).toBe("Sin envíos");
		expect(orderStatusLabel([line(10, 0, 0)], [cancelled])).toBe("Sin envíos");
		expect(orderStatusLabel([line(10, 4, 0)], [atDocs])).toBe("En camino");
		expect(orderStatusLabel([line(10, 4, 4)], [received])).toBe(
			"Pendiente de envío",
		);
		expect(orderStatusLabel([line(10, 10, 10)], [received])).toBe("Recibida");
	});
});

describe("small labels", () => {
	it("counts shipments and computes a share", () => {
		expect(shipmentsLabel(1)).toBe("1 envío");
		expect(shipmentsLabel(3)).toBe("3 envíos");
		expect(shareOf(4, 10)).toBe(40);
		expect(shareOf(1, 0)).toBe(0);
	});
});
