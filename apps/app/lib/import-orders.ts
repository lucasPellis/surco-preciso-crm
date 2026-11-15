import type { RouterOutputs } from "@/lib/trpc/types";
import { IMPORTS_UI } from "./imports-config";

export type ImportOrderRow =
	RouterOutputs["importOrders"]["list"]["rows"][number];
export type ImportOrderDetail = RouterOutputs["importOrders"]["byId"];
export type ImportOrderLine = ImportOrderDetail["lines"][number];
export type ImportShipment = ImportOrderDetail["shipments"][number];
export type ImportStageOption = ImportOrderDetail["stages"][number];

type ImportOrderOptions = RouterOutputs["importOrders"]["options"];

export type ProductOption = ImportOrderOptions["products"][number];
export type DealOption = ImportOrderOptions["deals"][number];

export const NO_DEAL = "none";

export type LineDraft = {
	key: string;
	id: string | null;
	productId: string;
	quantity: string;
	cost: string;
	dealId: string;
	shipped: number;
};

export type OrderLineValue = {
	id?: string;
	productId: string;
	quantity: number;
	unitCostCents: number;
	dealId: string | null;
};

export type ShipmentLineValue = { orderLineId: string; quantity: number };

export type Parsed<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: string };

const dayFormat = new Intl.DateTimeFormat(IMPORTS_UI.locale, {
	dateStyle: "medium",
	timeZone: "UTC",
});

export function formatDay(day: string): string {
	return dayFormat.format(new Date(`${day}T00:00:00.000Z`));
}

export function unitsLabel(done: number, total: number): string {
	return `${done} de ${total}`;
}

export function daysLabel(days: number): string {
	return days === 1 ? "1 día" : `${days} días`;
}

export function costFromCents(cents: number | null): string {
	return cents === null ? "" : (cents / 100).toFixed(2);
}

export function centsFromCost(value: string): number | null {
	const trimmed = value.trim().replace(",", ".");
	if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
	return Math.round(Number(trimmed) * 100);
}

function wholeNumber(value: string): number | null {
	const trimmed = value.trim();
	return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function blankDraft(key: string): LineDraft {
	return {
		key,
		id: null,
		productId: "",
		quantity: "1",
		cost: "",
		dealId: NO_DEAL,
		shipped: 0,
	};
}

export function draftFromLine(line: ImportOrderLine): LineDraft {
	return {
		key: line.id,
		id: line.id,
		productId: line.productId,
		quantity: String(line.quantity),
		cost: costFromCents(line.unitCostCents),
		dealId: line.dealId ?? NO_DEAL,
		shipped: line.shipped,
	};
}

export function readLineDrafts(
	drafts: readonly LineDraft[],
): Parsed<OrderLineValue[]> {
	if (drafts.length === 0) {
		return { ok: false, error: "Agrega al menos una línea." };
	}
	const lines: OrderLineValue[] = [];
	for (const [index, draft] of drafts.entries()) {
		const position = index + 1;
		if (draft.productId === "") {
			return { ok: false, error: `Elige el producto de la línea ${position}.` };
		}
		const quantity = wholeNumber(draft.quantity);
		if (quantity === null || quantity < 1) {
			return {
				ok: false,
				error: `La cantidad de la línea ${position} debe ser un número entero mayor que cero.`,
			};
		}
		const cents = centsFromCost(draft.cost);
		if (cents === null) {
			return {
				ok: false,
				error: `Escribe el costo unitario de la línea ${position}.`,
			};
		}
		lines.push({
			id: draft.id ?? undefined,
			productId: draft.productId,
			quantity,
			unitCostCents: cents,
			dealId: draft.dealId === NO_DEAL ? null : draft.dealId,
		});
	}
	return { ok: true, value: lines };
}

export function readShipmentQuantities(
	lines: readonly ImportOrderLine[],
	values: Readonly<Record<string, string>>,
): Parsed<ShipmentLineValue[]> {
	const picked: ShipmentLineValue[] = [];
	for (const line of lines) {
		const raw = (values[line.id] ?? "").trim();
		if (raw === "" || raw === "0") continue;
		const quantity = wholeNumber(raw);
		if (quantity === null) {
			return {
				ok: false,
				error: `La cantidad de ${line.sku} debe ser un número entero.`,
			};
		}
		if (quantity > line.remaining) {
			return {
				ok: false,
				error: `${line.sku} tiene ${line.remaining} unidades pendientes.`,
			};
		}
		picked.push({ orderLineId: line.id, quantity });
	}
	return picked.length === 0
		? { ok: false, error: "Escribe la cantidad de al menos una línea." }
		: { ok: true, value: picked };
}

export function moveTargets(
	stages: readonly ImportStageOption[],
	currentKey: string,
): ImportStageOption[] {
	return stages.filter((stage) => stage.key !== currentKey);
}

export function productChoices(
	products: readonly ProductOption[],
	saved: readonly ImportOrderLine[],
): ProductOption[] {
	const known = new Set(products.map((product) => product.id));
	const missing = new Map<string, ProductOption>();
	for (const line of saved) {
		if (known.has(line.productId)) continue;
		missing.set(line.productId, {
			id: line.productId,
			sku: line.sku,
			name: line.productName,
			referenceCostCents: null,
		});
	}
	return [...products, ...missing.values()];
}

export function dealChoices(
	deals: readonly DealOption[],
	saved: readonly ImportOrderLine[],
): DealOption[] {
	const known = new Set(deals.map((deal) => deal.id));
	const missing = new Map<string, DealOption>();
	for (const line of saved) {
		if (line.dealId === null || known.has(line.dealId)) continue;
		missing.set(line.dealId, {
			id: line.dealId,
			name: line.dealName ?? line.dealId,
			companyName: "",
		});
	}
	return [...deals, ...missing.values()];
}

export function productLabel(product: ProductOption): string {
	return `${product.sku}, ${product.name}`;
}

export function dealLabel(deal: DealOption): string {
	return deal.companyName === ""
		? deal.name
		: `${deal.name}, ${deal.companyName}`;
}
