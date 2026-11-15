import { describe, expect, it } from "bun:test";
import {
	blankDraft,
	centsFromCost,
	daysLabel,
	dealChoices,
	dealLabel,
	draftFromLine,
	formatDay,
	type ImportOrderLine,
	type ImportStageOption,
	moveTargets,
	NO_DEAL,
	productChoices,
	productLabel,
	readLineDrafts,
	readShipmentQuantities,
	unitsLabel,
} from "../lib/import-orders";

function line(
	id: string,
	extra: Partial<ImportOrderLine> = {},
): ImportOrderLine {
	return {
		id,
		productId: `p-${id}`,
		sku: `SKU-${id}`,
		productName: `Equipo ${id}`,
		quantity: 10,
		unitCostCents: 12_345,
		dealId: null,
		dealName: null,
		shipped: 0,
		received: 0,
		remaining: 10,
		...extra,
	};
}

function stage(key: string): ImportStageOption {
	return { key, name: key, kind: "IN_PROGRESS", tone: "NEUTRAL" };
}

describe("labels", () => {
	it("formats counts and days", () => {
		expect(unitsLabel(4, 10)).toBe("4 de 10");
		expect(daysLabel(1)).toBe("1 día");
		expect(daysLabel(0)).toBe("0 días");
		expect(daysLabel(22)).toBe("22 días");
	});

	it("formats a UTC day without moving it", () => {
		const text = formatDay("2026-01-10");
		expect(text).toContain("10");
		expect(text).toContain("2026");
	});
});

describe("costs", () => {
	it("reads a cost in cents and refuses anything else", () => {
		expect(centsFromCost("123.45")).toBe(12_345);
		expect(centsFromCost("123,4")).toBe(12_340);
		expect(centsFromCost(" 7 ")).toBe(700);
		for (const bad of ["", "-1", "1.234", "abc"]) {
			expect(centsFromCost(bad)).toBeNull();
		}
	});
});

describe("order lines", () => {
	it("turns a saved line into a draft and back", () => {
		const draft = draftFromLine(line("a", { dealId: "d1", shipped: 2 }));

		expect(draft).toEqual({
			key: "a",
			id: "a",
			productId: "p-a",
			quantity: "10",
			cost: "123.45",
			dealId: "d1",
			shipped: 2,
		});
		expect(readLineDrafts([draft])).toEqual({
			ok: true,
			value: [
				{
					id: "a",
					productId: "p-a",
					quantity: 10,
					unitCostCents: 12_345,
					dealId: "d1",
				},
			],
		});
	});

	it("reads a new line without id and without deal", () => {
		const result = readLineDrafts([
			{ ...blankDraft("k"), productId: "p", quantity: "3", cost: "5" },
		]);

		expect(result).toEqual({
			ok: true,
			value: [
				{
					id: undefined,
					productId: "p",
					quantity: 3,
					unitCostCents: 500,
					dealId: null,
				},
			],
		});
		expect(blankDraft("k").dealId).toBe(NO_DEAL);
	});

	it("names the first wrong line", () => {
		const ready = { ...blankDraft("k"), productId: "p", cost: "1" };

		expect(readLineDrafts([])).toEqual({
			ok: false,
			error: "Agrega al menos una línea.",
		});
		expect(readLineDrafts([blankDraft("k")])).toEqual({
			ok: false,
			error: "Elige el producto de la línea 1.",
		});
		for (const quantity of ["0", "1.5", ""]) {
			expect(readLineDrafts([ready, { ...ready, quantity }])).toEqual({
				ok: false,
				error:
					"La cantidad de la línea 2 debe ser un número entero mayor que cero.",
			});
		}
		expect(readLineDrafts([{ ...ready, cost: "" }])).toEqual({
			ok: false,
			error: "Escribe el costo unitario de la línea 1.",
		});
	});
});

describe("shipment quantities", () => {
	const lines = [line("a", { remaining: 6 }), line("b", { remaining: 4 })];

	it("reads the quantities and skips empty lines", () => {
		expect(readShipmentQuantities(lines, { a: "4", b: " " })).toEqual({
			ok: true,
			value: [{ orderLineId: "a", quantity: 4 }],
		});
		expect(readShipmentQuantities(lines, { a: "0", b: "4" })).toEqual({
			ok: true,
			value: [{ orderLineId: "b", quantity: 4 }],
		});
	});

	it("refuses more than what is left, a fraction and an empty shipment", () => {
		expect(readShipmentQuantities(lines, { a: "7" })).toEqual({
			ok: false,
			error: "SKU-a tiene 6 unidades pendientes.",
		});
		expect(readShipmentQuantities(lines, { b: "1.5" })).toEqual({
			ok: false,
			error: "La cantidad de SKU-b debe ser un número entero.",
		});
		expect(readShipmentQuantities(lines, {})).toEqual({
			ok: false,
			error: "Escribe la cantidad de al menos una línea.",
		});
	});
});

describe("choices", () => {
	it("offers every stage but the current one", () => {
		expect(
			moveTargets([stage("A"), stage("B"), stage("C")], "B").map(
				(item) => item.key,
			),
		).toEqual(["A", "C"]);
	});

	it("keeps the product and the deal of a saved line among the choices", () => {
		const saved = [line("a", { dealId: "d-old", dealName: "Vieja" })];
		const products = productChoices(
			[{ id: "p-x", sku: "SKU-x", name: "Equipo x", referenceCostCents: 100 }],
			saved,
		);
		const deals = dealChoices(
			[{ id: "d-new", name: "Nueva", companyName: "Acme" }],
			saved,
		);

		expect(products.map(productLabel)).toEqual([
			"SKU-x, Equipo x",
			"SKU-a, Equipo a",
		]);
		expect(deals.map(dealLabel)).toEqual(["Nueva, Acme", "Vieja"]);
	});
});
