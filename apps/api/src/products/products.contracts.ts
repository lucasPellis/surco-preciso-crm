import { PRODUCT } from "@crm/db/product";
import { z } from "zod";
import { MAX_AMOUNT_CENTS } from "../deals/deals.contracts";
import { listInput } from "../trpc/list-input";

const text = (max: number) =>
	z.string().trim().max(max, `Máximo ${max} caracteres.`);

const productFields = {
	sku: text(PRODUCT.skuMaxLength).min(1, "El producto necesita un SKU."),
	name: text(PRODUCT.nameMaxLength).min(1, "El producto necesita un nombre."),
	brand: text(PRODUCT.brandMaxLength),
	category: text(PRODUCT.categoryMaxLength),
	description: text(PRODUCT.descriptionMaxLength),
	referenceCostCents: z
		.number()
		.int("El costo debe tener como máximo dos decimales.")
		.min(0, "El costo no puede ser negativo.")
		.max(MAX_AMOUNT_CENTS, "El costo es demasiado grande.")
		.nullable(),
};

export const productCreateInput = z.object(productFields);

export const productUpdateInput = z.object({
	id: z.string().min(1),
	...productFields,
});

export const productIdInput = z.object({ id: z.string().min(1) });

export const productListInput = listInput.extend({
	archived: z.boolean().default(false),
	category: z.array(z.string()).default([]),
});

export const productOutput = z.object({
	id: z.string(),
	sku: z.string(),
	name: z.string(),
	brand: z.string().nullable(),
	category: z.string().nullable(),
	description: z.string().nullable(),
	referenceCostCents: z.number().nullable(),
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
});

export const productListOutput = z.object({
	rows: z.array(productOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	canManage: z.boolean(),
});

export type ProductCreateInput = z.infer<typeof productCreateInput>;
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;
export type ProductIdInput = z.infer<typeof productIdInput>;
export type ProductListInput = z.infer<typeof productListInput>;
export type ProductRow = z.infer<typeof productOutput>;
export type ProductList = z.infer<typeof productListOutput>;
