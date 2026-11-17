import { ImportStageKind } from "@crm/db/enums";
import {
	IMPORT_ORDER,
	splitCount,
	splitQuantities,
} from "@crm/db/import-order";
import { isClosedImportKind } from "@crm/db/import-stage";
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
export type ProcessOption = ImportOrderOptions["processes"][number];

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

export type SplitPreview = {
	perShipment: number;
	count: number;
	summary: string;
	submitLabel: string;
};

export function unitCountLabel(units: number): string {
	return units === 1 ? "1 unidad" : `${units} unidades`;
}

export function shipmentsRegisteredLabel(count: number): string {
	return count === 1 ? "1 envío registrado." : `${count} envíos registrados.`;
}

export function splitPreview(
	remaining: number,
	raw: string,
): Parsed<SplitPreview> {
	const perShipment = wholeNumber(raw);
	if (perShipment === null || perShipment < 1) {
		return { ok: false, error: "Escribe un número entero mayor que cero." };
	}
	const split = splitQuantities(
		remaining,
		perShipment,
		IMPORT_ORDER.maxSplitShipments,
	);
	if (!split.ok) {
		return {
			ok: false,
			error:
				split.error === "TOO_MANY"
					? `Se crearían ${splitCount(remaining, perShipment)} envíos. El máximo es ${IMPORT_ORDER.maxSplitShipments}. Sube las unidades por envío.`
					: "Esta línea no tiene unidades pendientes.",
		};
	}
	const count = split.quantities.length;
	const first = split.quantities[0] ?? 0;
	const last = split.quantities.at(-1) ?? 0;
	const summary =
		first === last
			? `${count === 1 ? "Se creará" : "Se crearán"} ${shipmentsLabel(count)} de ${unitCountLabel(first)}.`
			: `Se crearán ${shipmentsLabel(count)}: ${count - 1} de ${unitCountLabel(first)} y 1 de ${unitCountLabel(last)}.`;
	return {
		ok: true,
		value: {
			perShipment,
			count,
			summary,
			submitLabel: `Registrar ${shipmentsLabel(count)}`,
		},
	};
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

export function processChoices(
	processes: readonly ProcessOption[],
	saved: ImportOrderDetail["process"] | null,
): ProcessOption[] {
	if (saved === null || processes.some((item) => item.id === saved.id)) {
		return [...processes];
	}
	return [
		...processes,
		{ id: saved.id, name: saved.name, countryCode: null, stages: [] },
	];
}

export function defaultProcessId(processes: readonly ProcessOption[]): string {
	const [only, ...rest] = processes;
	return only !== undefined && rest.length === 0 ? only.id : "";
}

export function processLabel(option: ProcessOption): string {
	return option.countryCode === null
		? option.name
		: `${option.name}, ${IMPORTS_UI.countryLabels[option.countryCode]}`;
}

export function productLabel(product: ProductOption): string {
	return `${product.sku}, ${product.name}`;
}

export function dealLabel(deal: DealOption): string {
	return deal.companyName === ""
		? deal.name
		: `${deal.name}, ${deal.companyName}`;
}

export type RouteStage = { key: string; name: string; kind: ImportStageKind };

export type StepState = "done" | "current" | "pending";

export type PathStep = {
	key: string;
	label: string;
	state: StepState;
	detail: string | null;
};

export type Totals = { cents: number; units: number };

export function shipmentsLabel(count: number): string {
	return count === 1 ? "1 envío" : `${count} envíos`;
}

export function shareOf(part: number, total: number): number {
	return total === 0 ? 0 : (part / total) * 100;
}

export function lineSubtotalCents(draft: LineDraft): number | null {
	const quantity = wholeNumber(draft.quantity);
	const cents = centsFromCost(draft.cost);
	return quantity === null || cents === null ? null : quantity * cents;
}

export function draftTotals(drafts: readonly LineDraft[]): Totals {
	let cents = 0;
	let units = 0;
	for (const draft of drafts) {
		const quantity = wholeNumber(draft.quantity);
		const cost = centsFromCost(draft.cost);
		if (quantity === null || cost === null) continue;
		cents += quantity * cost;
		units += quantity;
	}
	return { cents, units };
}

export function orderTotals(lines: readonly ImportOrderLine[]): Totals {
	return lines.reduce(
		(sum, line) => ({
			cents: sum.cents + line.quantity * line.unitCostCents,
			units: sum.units + line.quantity,
		}),
		{ cents: 0, units: 0 },
	);
}

export function routeStages<Stage extends RouteStage>(
	stages: readonly Stage[],
): Stage[] {
	return stages.filter((stage) => stage.kind !== ImportStageKind.CANCELLED);
}

export function routePreview(stages: readonly RouteStage[]): PathStep[] {
	return routeStages(stages).map(
		(stage): PathStep => ({
			key: stage.key,
			label: stage.name,
			state: "pending",
			detail: null,
		}),
	);
}

export function nextStageKey(
	stages: readonly RouteStage[],
	currentKey: string,
): string | null {
	const route = routeStages(stages);
	const index = route.findIndex((stage) => stage.key === currentKey);
	return index === -1 ? null : (route[index + 1]?.key ?? null);
}

export function shipmentPath(
	stages: readonly RouteStage[],
	shipment: ImportShipment,
): PathStep[] {
	const route = routeStages(stages);
	const currentIndex = route.findIndex(
		(stage) => stage.key === shipment.stage.key,
	);
	const open = !isClosedImportKind(shipment.stage.kind);
	const latest = shipment.events.at(-1);

	return route.map((stage, index): PathStep => {
		const step = { key: stage.key, label: stage.name };
		if (open && index === currentIndex) {
			return {
				...step,
				state: "current",
				detail:
					latest === undefined || latest.days === null
						? null
						: daysLabel(latest.days),
			};
		}
		const reached =
			currentIndex === -1 ||
			index < currentIndex ||
			(!open && index === currentIndex);
		const event = shipment.events.findLast(
			(item) => item.stage.key === stage.key,
		);
		if (reached && event !== undefined) {
			return { ...step, state: "done", detail: formatDay(event.occurredAt) };
		}
		if (reached && currentIndex !== -1) {
			return { ...step, state: "pending", detail: "Omitida" };
		}
		return { ...step, state: "pending", detail: null };
	});
}

export function orderStatusLabel(
	lines: readonly ImportOrderLine[],
	shipments: readonly ImportShipment[],
): string {
	const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
	const received = lines.reduce((sum, line) => sum + line.received, 0);
	const shipped = lines.reduce((sum, line) => sum + line.shipped, 0);
	if (ordered > 0 && received >= ordered) return "Recibida";
	if (shipments.some((shipment) => !isClosedImportKind(shipment.stage.kind))) {
		return "En camino";
	}
	if (shipped === 0) return "Sin envíos";
	return "Pendiente de envío";
}
