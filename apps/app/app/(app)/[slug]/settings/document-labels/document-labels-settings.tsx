"use client";

import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { useFormSheetValidation } from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import { MetaRow } from "@crm/ui/components/meta-row";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SettingsCard, SettingsColumn } from "@crm/ui/components/settings-card";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	type DocumentLabelRow,
	directionLabel,
	splitDocumentLabels,
} from "@/lib/import-documents";
import { countLabel } from "@/lib/import-process-settings";
import { IMPORTS_UI } from "@/lib/imports-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const ROW =
	"flex flex-wrap items-center gap-2.5 border-b px-5 py-2.5 last:border-b-0";

type DialogState = { mode: "create" } | { mode: "edit"; row: DocumentLabelRow };

type LabelValues = { name: string; direction: DocumentDirection };

function isDirection(value: string): value is DocumentDirection {
	return value === DocumentDirection.IN || value === DocumentDirection.OUT;
}

function LabelDialog({
	state,
	pending,
	onClose,
	onSubmit,
}: {
	state: DialogState;
	pending: boolean;
	onClose: () => void;
	onSubmit: (values: LabelValues) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const directionId = useId();
	const [name, setName] = useState(state.mode === "edit" ? state.row.name : "");
	const [direction, setDirection] = useState<DocumentDirection>(
		state.mode === "edit" ? state.row.direction : DocumentDirection.IN,
	);

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{state.mode === "create" ? "Nueva etiqueta" : "Editar etiqueta"}
					</DialogTitle>
					<DialogDescription>
						{state.mode === "create"
							? "La etiqueta sirve para cualquier proceso."
							: "El cambio se ve en todos los documentos con esta etiqueta."}
					</DialogDescription>
				</DialogHeader>

				<form
					id="document-label-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit({ name: name.trim(), direction });
					}}
				>
					<FieldGroup>
						<Field data-invalid={!!validation.errors[nameId]}>
							<FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
							<Input
								id={nameId}
								aria-invalid={!!validation.errors[nameId]}
								aria-describedby={
									validation.errors[nameId] ? `${nameId}-error` : undefined
								}
								value={name}
								maxLength={IMPORT_DOCUMENT.labelNameMaxLength}
								placeholder="Packing list"
								onChange={(event) => setName(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={directionId}>Tipo</FieldLabel>
							<Select
								value={direction}
								onValueChange={(next) => {
									if (isDirection(next)) setDirection(next);
								}}
							>
								<SelectTrigger id={directionId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.values(DocumentDirection).map((value) => (
										<SelectItem key={value} value={value}>
											{directionLabel(value)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								{IMPORTS_UI.directionHints[direction]}
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="document-label-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function LabelSummary({ row }: { row: DocumentLabelRow }) {
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-px">
			<span className="truncate font-medium">{row.name}</span>
			<MetaRow>
				<span>{directionLabel(row.direction)}</span>
				<span className="tabular-nums">
					{countLabel(row.fileCount, "documento", "documentos")}
				</span>
				<span className="tabular-nums">
					{countLabel(row.stageCount, "etapa", "etapas")}
				</span>
			</MetaRow>
		</div>
	);
}

export function DocumentLabelsSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [dialog, setDialog] = useState<DialogState | null>(null);

	const list = useQuery(trpc.documentLabels.list.queryOptions());

	const settled = {
		onSettled: () => cache.documentLabels(),
		onError: (error: { message: string }) => toast.error(error.message),
	};
	const closeWith = (message: string) => () => {
		setDialog(null);
		toast.success(message);
	};

	const create = useMutation(
		trpc.documentLabels.create.mutationOptions({
			...settled,
			onSuccess: closeWith("Etiqueta creada."),
		}),
	);
	const update = useMutation(
		trpc.documentLabels.update.mutationOptions({
			...settled,
			onSuccess: closeWith("Etiqueta actualizada."),
		}),
	);
	const archive = useMutation(
		trpc.documentLabels.archive.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etiqueta archivada."),
		}),
	);
	const restore = useMutation(
		trpc.documentLabels.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etiqueta restaurada."),
		}),
	);

	if (list.isError) {
		return (
			<SettingsColumn>
				<SettingsCard
					title="No se pudieron cargar las etiquetas"
					description={list.error.message}
					action={
						<Button
							variant="outline"
							size="sm"
							disabled={list.isFetching}
							onClick={() => list.refetch()}
						>
							{list.isFetching ? <Spinner data-icon="inline-start" /> : null}
							Reintentar
						</Button>
					}
				/>
			</SettingsColumn>
		);
	}

	if (!list.data) return null;

	const { canManage, labels } = list.data;
	const { active, archived } = splitDocumentLabels(labels);
	const saving = create.isPending || update.isPending;
	const busy = !canManage || saving || archive.isPending || restore.isPending;

	return (
		<SettingsColumn>
			<SettingsCard
				title="Etiquetas"
				description="Entrada es lo que recibimos. Salida es lo que hacemos o presentamos. Un documento archivado conserva su etiqueta."
				hint={
					canManage
						? "Los cambios se guardan al instante."
						: "Solo un propietario o un administrador puede cambiar las etiquetas."
				}
				control="table"
				action={
					<Button
						size="sm"
						disabled={busy}
						onClick={() => setDialog({ mode: "create" })}
					>
						Nueva etiqueta
					</Button>
				}
			>
				<div>
					{active.length === 0 ? (
						<p className="px-5 py-2.5 text-13 text-muted-foreground">
							Todavía no hay etiquetas.
						</p>
					) : null}
					{active.map((row) => (
						<div key={row.id} className={ROW}>
							<LabelSummary row={row} />
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								onClick={() => setDialog({ mode: "edit", row })}
							>
								Editar
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								onClick={() => archive.mutate({ id: row.id })}
							>
								Archivar
							</Button>
						</div>
					))}
				</div>
			</SettingsCard>

			{archived.length > 0 ? (
				<SettingsCard
					title="Etiquetas archivadas"
					description="Una etiqueta archivada no se elige al subir un documento y sale de las listas de esperados. Los documentos que ya la tienen la conservan."
					control="table"
				>
					<Collapsible>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center gap-2 border-b px-5 py-2.5 text-left font-medium text-13"
							>
								Ver archivadas ({archived.length})
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							{archived.map((row) => (
								<div key={row.id} className={ROW}>
									<span className="min-w-0 flex-1 truncate text-13 text-muted-foreground">
										{row.name}
									</span>
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() => restore.mutate({ id: row.id })}
									>
										Restaurar
									</Button>
								</div>
							))}
						</CollapsibleContent>
					</Collapsible>
				</SettingsCard>
			) : null}

			{dialog ? (
				<LabelDialog
					key={dialog.mode === "create" ? "create" : dialog.row.id}
					state={dialog}
					pending={saving}
					onClose={() => setDialog(null)}
					onSubmit={(values) =>
						dialog.mode === "create"
							? create.mutate(values)
							: update.mutate({ id: dialog.row.id, ...values })
					}
				/>
			) : null}
		</SettingsColumn>
	);
}
