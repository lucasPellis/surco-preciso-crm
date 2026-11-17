"use client";

import { ImportCountry } from "@crm/db/enums";
import { IMPORT_PROCESS } from "@crm/db/import-process";
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
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	copyName,
	countLabel,
	countryFromChoice,
	countryLabel,
	type ImportProcessRow,
	NO_COUNTRY,
	splitImportProcesses,
} from "@/lib/import-process-settings";
import { IMPORTS_UI } from "@/lib/imports-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const ROW =
	"flex flex-wrap items-center gap-2.5 border-b px-5 py-2.5 last:border-b-0";

const DIALOG_TEXT = {
	create: {
		title: "Nuevo proceso",
		description:
			"El proceso nuevo empieza con Pedido, Recibido y Cancelado. Agrega las demás etapas después.",
	},
	edit: {
		title: "Editar proceso",
		description: "El cambio se ve en todas las órdenes de este proceso.",
	},
	duplicate: {
		title: "Duplicar proceso",
		description:
			"La copia lleva las etapas activas y el país. No lleva órdenes ni envíos.",
	},
} as const;

type DialogState =
	| { mode: "create" }
	| { mode: "edit"; row: ImportProcessRow }
	| { mode: "duplicate"; row: ImportProcessRow };

type ProcessValues = { name: string; countryCode: ImportCountry | null };

function initialName(state: DialogState): string {
	if (state.mode === "create") return "";
	if (state.mode === "edit") return state.row.name;
	return copyName(state.row.name, IMPORT_PROCESS.nameMaxLength);
}

function dialogKey(state: DialogState): string {
	return state.mode === "create" ? "create" : `${state.mode}-${state.row.id}`;
}

function ProcessDialog({
	state,
	pending,
	onClose,
	onSubmit,
}: {
	state: DialogState;
	pending: boolean;
	onClose: () => void;
	onSubmit: (values: ProcessValues) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const countryId = useId();
	const [name, setName] = useState(() => initialName(state));
	const [country, setCountry] = useState<string>(
		state.mode === "create"
			? NO_COUNTRY
			: (state.row.countryCode ?? NO_COUNTRY),
	);
	const text = DIALOG_TEXT[state.mode];

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{text.title}</DialogTitle>
					<DialogDescription>{text.description}</DialogDescription>
				</DialogHeader>

				<form
					id="import-process-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit({
							name: name.trim(),
							countryCode: countryFromChoice(country),
						});
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
								maxLength={IMPORT_PROCESS.nameMaxLength}
								placeholder="Courier Argentina"
								onChange={(event) => setName(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						{state.mode === "duplicate" ? null : (
							<Field>
								<FieldLabel htmlFor={countryId}>País</FieldLabel>
								<Select value={country} onValueChange={setCountry}>
									<SelectTrigger id={countryId} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_COUNTRY}>Sin país</SelectItem>
										{Object.values(ImportCountry).map((code) => (
											<SelectItem key={code} value={code}>
												{IMPORTS_UI.countryLabels[code]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="import-process-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ProcessSummary({ row }: { row: ImportProcessRow }) {
	const country = countryLabel(row.countryCode);

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-px">
			<span className="truncate font-medium">{row.name}</span>
			<MetaRow>
				{country ? <span>{country}</span> : null}
				<span className="tabular-nums">
					{countLabel(row.stageCount, "etapa", "etapas")}
				</span>
				<span className="tabular-nums">
					{countLabel(row.orderCount, "orden", "órdenes")}
				</span>
				{row.activeShipmentCount > 0 ? (
					<span className="tabular-nums">
						{countLabel(
							row.activeShipmentCount,
							"envío en curso",
							"envíos en curso",
						)}
					</span>
				) : null}
			</MetaRow>
		</div>
	);
}

export function ImportProcessesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const url = useWorkspaceUrl();

	const [dialog, setDialog] = useState<DialogState | null>(null);

	const list = useQuery(trpc.importProcesses.list.queryOptions());

	const settled = {
		onSettled: () => cache.importProcesses(),
		onError: (error: { message: string }) => toast.error(error.message),
	};
	const closeWith = (message: string) => () => {
		setDialog(null);
		toast.success(message);
	};

	const create = useMutation(
		trpc.importProcesses.create.mutationOptions({
			...settled,
			onSuccess: closeWith("Proceso creado."),
		}),
	);
	const update = useMutation(
		trpc.importProcesses.update.mutationOptions({
			...settled,
			onSuccess: closeWith("Proceso actualizado."),
		}),
	);
	const duplicate = useMutation(
		trpc.importProcesses.duplicate.mutationOptions({
			...settled,
			onSuccess: closeWith("Proceso duplicado."),
		}),
	);
	const archive = useMutation(
		trpc.importProcesses.archive.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Proceso archivado."),
		}),
	);
	const restore = useMutation(
		trpc.importProcesses.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Proceso restaurado."),
		}),
	);

	if (list.isError) {
		return (
			<SettingsColumn>
				<SettingsCard
					title="No se pudieron cargar los procesos"
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

	const { canManage, processes } = list.data;
	const { active, archived } = splitImportProcesses(processes);
	const saving = create.isPending || update.isPending || duplicate.isPending;
	const busy = !canManage || saving || archive.isPending || restore.isPending;

	const stagesLink = (row: ImportProcessRow) => (
		<Button asChild variant="ghost" size="sm">
			<Link href={url(`/settings/import-processes/${row.id}`)}>Etapas</Link>
		</Button>
	);

	return (
		<SettingsColumn>
			<SettingsCard
				title="Procesos de importación"
				description="Cada orden sigue un proceso. Abre las etapas de un proceso para cambiarlas."
				hint={
					canManage
						? "Los cambios se guardan al instante."
						: "Solo un propietario o un administrador puede cambiar los procesos."
				}
				control="table"
				action={
					<Button
						size="sm"
						disabled={busy}
						onClick={() => setDialog({ mode: "create" })}
					>
						Nuevo proceso
					</Button>
				}
			>
				<div>
					{active.map((row) => (
						<div key={row.id} className={ROW}>
							<ProcessSummary row={row} />
							{stagesLink(row)}
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
								onClick={() => setDialog({ mode: "duplicate", row })}
							>
								Duplicar
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
					title="Procesos archivados"
					description="Un proceso archivado no se elige en una orden nueva. Sus órdenes y su historial se conservan."
					control="table"
				>
					<Collapsible>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center gap-2 border-b px-5 py-2.5 text-left font-medium text-13"
							>
								Ver archivados ({archived.length})
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							{archived.map((row) => (
								<div key={row.id} className={ROW}>
									<span className="min-w-0 flex-1 truncate text-13 text-muted-foreground">
										{row.name}
									</span>
									{stagesLink(row)}
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
				<ProcessDialog
					key={dialogKey(dialog)}
					state={dialog}
					pending={saving}
					onClose={() => setDialog(null)}
					onSubmit={(values) => {
						if (dialog.mode === "create") create.mutate(values);
						else if (dialog.mode === "edit")
							update.mutate({ id: dialog.row.id, ...values });
						else duplicate.mutate({ id: dialog.row.id, name: values.name });
					}}
				/>
			) : null}
		</SettingsColumn>
	);
}
