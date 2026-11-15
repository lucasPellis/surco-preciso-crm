import { ImportStageKind, PipelineStageTone } from "@crm/db/enums";
import { IMPORT_ORDER } from "@crm/db/import-order";
import { z } from "zod";
import { taskDueDayInput } from "../activities/task-due-date";
import { MAX_AMOUNT_CENTS } from "../deals/deals.contracts";
import { listInput } from "../trpc/list-input";

const text = (max: number) =>
	z.string().trim().max(max, `Máximo ${max} caracteres.`);

const recordId = z.string().min(1);

const quantity = z
	.number()
	.int("La cantidad debe ser un número entero.")
	.min(1, "La cantidad debe ser mayor que cero.")
	.max(IMPORT_ORDER.maxQuantity, "La cantidad es demasiado grande.");

export const importOrderLineInput = z.object({
	id: recordId.optional(),
	productId: recordId,
	quantity,
	unitCostCents: z
		.number()
		.int("El costo debe tener como máximo dos decimales.")
		.min(0, "El costo no puede ser negativo.")
		.max(MAX_AMOUNT_CENTS, "El costo es demasiado grande."),
	dealId: recordId.nullable(),
});

const orderFields = {
	number: text(IMPORT_ORDER.numberMaxLength).min(
		1,
		"La orden necesita un número.",
	),
	supplierName: text(IMPORT_ORDER.supplierNameMaxLength).min(
		1,
		"La orden necesita un proveedor.",
	),
	orderedAt: taskDueDayInput,
	notes: text(IMPORT_ORDER.notesMaxLength),
	lines: z
		.array(importOrderLineInput)
		.min(1, "La orden necesita al menos una línea.")
		.max(IMPORT_ORDER.maxLines, `Máximo ${IMPORT_ORDER.maxLines} líneas.`),
};

export const importOrderCreateInput = z.object(orderFields);

export const importOrderUpdateInput = z.object({
	id: recordId,
	...orderFields,
});

export const importOrderIdInput = z.object({ id: recordId });

export const importOrderListInput = listInput.extend({
	archived: z.boolean().default(false),
});

const shipmentText = {
	reference: text(IMPORT_ORDER.referenceMaxLength),
	trackingNumber: text(IMPORT_ORDER.trackingNumberMaxLength),
};

export const shipmentCreateInput = z.object({
	orderId: recordId,
	...shipmentText,
	occurredAt: taskDueDayInput.optional(),
	lines: z
		.array(z.object({ orderLineId: recordId, quantity }))
		.min(1, "El envío necesita al menos una línea.")
		.max(IMPORT_ORDER.maxLines, `Máximo ${IMPORT_ORDER.maxLines} líneas.`),
});

export const shipmentUpdateInput = z.object({
	id: recordId,
	...shipmentText,
});

export const shipmentMoveRequest = z.object({
	shipmentId: recordId,
	targetKey: z.string().trim().min(1),
	occurredAt: taskDueDayInput.optional(),
});

const day = z.iso.date();

export const importOrderRowOutput = z.object({
	id: z.string(),
	number: z.string(),
	supplierName: z.string(),
	orderedAt: day,
	lineCount: z.number(),
	orderedUnits: z.number(),
	shippedUnits: z.number(),
	receivedUnits: z.number(),
	shipmentCount: z.number(),
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
});

export const importOrderListOutput = z.object({
	rows: z.array(importOrderRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	canManage: z.boolean(),
});

const stageOutput = z.object({
	key: z.string(),
	name: z.string(),
	kind: z.enum(ImportStageKind),
	tone: z.enum(PipelineStageTone),
});

const orderLineOutput = z.object({
	id: z.string(),
	productId: z.string(),
	sku: z.string(),
	productName: z.string(),
	quantity: z.number(),
	unitCostCents: z.number(),
	dealId: z.string().nullable(),
	dealName: z.string().nullable(),
	shipped: z.number(),
	received: z.number(),
	remaining: z.number(),
});

const shipmentOutput = z.object({
	id: z.string(),
	reference: z.string().nullable(),
	trackingNumber: z.string().nullable(),
	stage: stageOutput,
	stageChangedAt: day,
	lines: z.array(
		z.object({
			orderLineId: z.string(),
			sku: z.string(),
			productName: z.string(),
			quantity: z.number(),
		}),
	),
	events: z.array(
		z.object({
			id: z.string(),
			stage: stageOutput,
			occurredAt: day,
			days: z.number().nullable(),
			running: z.boolean(),
		}),
	),
	orderToReceivedDays: z.number().nullable(),
});

export const importOrderDetailOutput = z.object({
	id: z.string(),
	number: z.string(),
	supplierName: z.string(),
	orderedAt: day,
	notes: z.string().nullable(),
	archivedAt: z.string().nullable(),
	lines: z.array(orderLineOutput),
	shipments: z.array(shipmentOutput),
	stages: z.array(stageOutput),
	canManage: z.boolean(),
});

export const importOrderOptionsOutput = z.object({
	products: z.array(
		z.object({
			id: z.string(),
			sku: z.string(),
			name: z.string(),
			referenceCostCents: z.number().nullable(),
		}),
	),
	deals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			companyName: z.string(),
		}),
	),
});

export type ImportOrderLineInput = z.infer<typeof importOrderLineInput>;
export type ImportOrderCreateInput = z.infer<typeof importOrderCreateInput>;
export type ImportOrderUpdateInput = z.infer<typeof importOrderUpdateInput>;
export type ImportOrderIdInput = z.infer<typeof importOrderIdInput>;
export type ImportOrderListInput = z.infer<typeof importOrderListInput>;
export type ShipmentCreateInput = z.infer<typeof shipmentCreateInput>;
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateInput>;
export type ShipmentMoveRequest = z.infer<typeof shipmentMoveRequest>;
export type ImportOrderRow = z.infer<typeof importOrderRowOutput>;
export type ImportOrderList = z.infer<typeof importOrderListOutput>;
export type ImportOrderDetail = z.infer<typeof importOrderDetailOutput>;
export type ImportOrderOptions = z.infer<typeof importOrderOptionsOutput>;
