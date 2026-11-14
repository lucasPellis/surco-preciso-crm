"use client";

import { PRODUCT } from "@crm/db/product";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@crm/ui/components/field";
import {
	FormSheet,
	FormSheetContent,
	FormSheetFooter,
	FormSheetForm,
	useFormSheetValidation,
} from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

export type ProductRow = RouterOutputs["products"]["list"]["rows"][number];

type ProductSheetProps = {
	product: ProductRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function costFromCents(cents: number | null): string {
	return cents === null ? "" : (cents / 100).toFixed(2);
}

function centsFromCost(value: string): number | null {
	const trimmed = value.trim().replace(",", ".");
	if (trimmed === "") return null;
	const amount = Number(trimmed);
	return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

export function ProductSheet({
	product,
	open,
	onOpenChange,
}: ProductSheetProps) {
	return (
		<ProductForm
			key={product?.id ?? "new"}
			product={product}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}

function ProductForm({ product, open, onOpenChange }: ProductSheetProps) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();

	const [sku, setSku] = useState(product?.sku ?? "");
	const [name, setName] = useState(product?.name ?? "");
	const [brand, setBrand] = useState(product?.brand ?? "");
	const [category, setCategory] = useState(product?.category ?? "");
	const [description, setDescription] = useState(product?.description ?? "");
	const [cost, setCost] = useState(
		costFromCents(product?.referenceCostCents ?? null),
	);

	const skuId = useId();
	const nameId = useId();
	const brandId = useId();
	const categoryId = useId();
	const descriptionId = useId();
	const costId = useId();

	const editing = product !== null;

	const onSuccess = async (saved: ProductRow) => {
		await cache.products();
		toast.success(
			editing ? "Producto actualizado." : `${saved.name} agregado.`,
		);
		onOpenChange(false);
	};
	const onError = (error: { message: string }) => toast.error(error.message);

	const create = useMutation(
		trpc.products.create.mutationOptions({ onSuccess, onError }),
	);
	const update = useMutation(
		trpc.products.update.mutationOptions({ onSuccess, onError }),
	);
	const pending = create.isPending || update.isPending;

	const dirty = editing
		? sku !== product.sku ||
			name !== product.name ||
			brand !== (product.brand ?? "") ||
			category !== (product.category ?? "") ||
			description !== (product.description ?? "") ||
			cost !== costFromCents(product.referenceCostCents)
		: [sku, name, brand, category, description, cost].some(
				(value) => value !== "",
			);

	return (
		<FormSheet
			dirty={dirty}
			pending={pending}
			onDiscard={validation.reset}
			open={open}
			onOpenChange={onOpenChange}
		>
			<FormSheetContent side="right">
				<SheetHeader>
					<SheetTitle>
						{editing ? "Editar producto" : "Nuevo producto"}
					</SheetTitle>
					<SheetDescription>
						El SKU identifica al producto en órdenes y stock. No se puede
						repetir.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="product-form"
					onSubmit={(event) => {
						event.preventDefault();
						const cents = centsFromCost(cost);
						const errors: Record<string, string> = {};
						if (sku.trim() === "") errors[skuId] = "Escribe un SKU.";
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (Number.isNaN(cents))
							errors[costId] = "Escribe un monto válido.";
						else if (cents !== null && cents < 0)
							errors[costId] = "El costo no puede ser negativo.";
						if (!validation.validate(event.currentTarget, errors)) return;
						const values = {
							sku,
							name,
							brand,
							category,
							description,
							referenceCostCents: cents,
						};
						if (product) update.mutate({ id: product.id, ...values });
						else create.mutate(values);
					}}
				>
					<Field data-invalid={!!validation.errors[skuId]}>
						<FieldLabel htmlFor={skuId}>SKU</FieldLabel>
						<Input
							id={skuId}
							aria-invalid={!!validation.errors[skuId]}
							aria-describedby={
								validation.errors[skuId] ? `${skuId}-error` : undefined
							}
							value={sku}
							onChange={(event) => setSku(event.target.value)}
							maxLength={PRODUCT.skuMaxLength}
							placeholder="XR-500"
							autoComplete="off"
						/>
						<FieldError id={`${skuId}-error`}>
							{validation.errors[skuId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[nameId]}>
						<FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
						<Input
							id={nameId}
							aria-invalid={!!validation.errors[nameId]}
							aria-describedby={
								validation.errors[nameId] ? `${nameId}-error` : undefined
							}
							value={name}
							onChange={(event) => setName(event.target.value)}
							maxLength={PRODUCT.nameMaxLength}
							autoComplete="off"
						/>
						<FieldError id={`${nameId}-error`}>
							{validation.errors[nameId]}
						</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor={brandId}>Marca</FieldLabel>
						<Input
							id={brandId}
							value={brand}
							onChange={(event) => setBrand(event.target.value)}
							maxLength={PRODUCT.brandMaxLength}
							autoComplete="off"
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={categoryId}>Categoría</FieldLabel>
						<Input
							id={categoryId}
							value={category}
							onChange={(event) => setCategory(event.target.value)}
							maxLength={PRODUCT.categoryMaxLength}
							autoComplete="off"
						/>
					</Field>

					<Field data-invalid={!!validation.errors[costId]}>
						<FieldLabel htmlFor={costId}>Costo de referencia (USD)</FieldLabel>
						<Input
							id={costId}
							aria-invalid={!!validation.errors[costId]}
							aria-describedby={
								validation.errors[costId] ? `${costId}-error` : undefined
							}
							value={cost}
							onChange={(event) => setCost(event.target.value)}
							inputMode="decimal"
							placeholder="0.00"
							autoComplete="off"
						/>
						<FieldDescription>
							Es una referencia. El costo real sale de las órdenes de compra.
						</FieldDescription>
						<FieldError id={`${costId}-error`}>
							{validation.errors[costId]}
						</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor={descriptionId}>Descripción</FieldLabel>
						<Textarea
							id={descriptionId}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							maxLength={PRODUCT.descriptionMaxLength}
						/>
					</Field>
				</FormSheetForm>

				<FormSheetFooter>
					<Button type="submit" form="product-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{editing ? "Guardar" : "Agregar producto"}
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
