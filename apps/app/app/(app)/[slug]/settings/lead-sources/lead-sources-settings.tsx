"use client";

import {
	isLeadSourceIcon,
	LEAD_SOURCE,
	LEAD_SOURCE_ICONS,
	type LeadSourceIcon,
} from "@crm/db/lead-source";
import { Button } from "@crm/ui/components/button";
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
import {
	LEAD_SOURCE_ICON_LABELS,
	LeadSourceMark,
} from "@crm/ui/components/lead-source-mark";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SettingsCard, SettingsColumn } from "@crm/ui/components/settings-card";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const COLUMNS: SimpleTableColumn[] = [
	{ id: "name", header: "Origen" },
	{ id: "contacts", header: "Contactos", width: "w-28", align: "right" },
	{ id: "status", header: "Estado", width: "w-28" },
	{ id: "actions", srLabel: "Acciones", width: "w-80", align: "right" },
];

type EditTarget = { id: string; name: string; icon: LeadSourceIcon };

function iconOf(value: string | null): LeadSourceIcon {
	return value && isLeadSourceIcon(value) ? value : "other";
}

export function LeadSourcesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const nameId = useId();
	const iconId = useId();

	const [draft, setDraft] = useState("");
	const [draftIcon, setDraftIcon] = useState<LeadSourceIcon>("other");
	const [editing, setEditing] = useState<EditTarget | null>(null);

	const list = useQuery(trpc.leadSources.list.queryOptions());

	const create = useMutation(
		trpc.leadSources.create.mutationOptions({
			onSuccess: async () => {
				await cache.leadSources();
				validation.reset();
				setDraft("");
				setDraftIcon("other");
				toast.success("Origen agregado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const update = useMutation(
		trpc.leadSources.update.mutationOptions({
			onSuccess: async () => {
				await cache.leadSources();
				setEditing(null);
				toast.success("Origen actualizado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.leadSources.archive.mutationOptions({
			onSuccess: async () => {
				await cache.leadSources();
				toast.success("Origen archivado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const restore = useMutation(
		trpc.leadSources.restore.mutationOptions({
			onSuccess: async () => {
				await cache.leadSources();
				toast.success("Origen restaurado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reorder = useMutation(
		trpc.leadSources.reorder.mutationOptions({
			onSuccess: () => cache.leadSources(),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (list.isError) {
		return (
			<SettingsColumn>
				<SettingsCard
					title="No se pudieron cargar los orígenes"
					description={list.error.message}
					hint="Si acabas de actualizar el código, aplica las migraciones pendientes y reinicia la API."
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

	const { sources, canManage } = list.data;

	const busy =
		!canManage ||
		create.isPending ||
		update.isPending ||
		archive.isPending ||
		restore.isPending ||
		reorder.isPending;

	const move = (index: number, delta: -1 | 1) => {
		const ids = sources.map((source) => source.id);
		ids.splice(index + delta, 0, ...ids.splice(index, 1));
		reorder.mutate({ ids });
	};

	return (
		<SettingsColumn>
			<SettingsCard
				title="Lista de orígenes"
				description="Un origen archivado no se puede elegir en contactos nuevos. Los contactos que ya lo tienen lo conservan, así los reportes no cambian."
				hint={
					canManage
						? "Los cambios se guardan al instante."
						: "Solo un propietario o un administrador puede cambiar los orígenes."
				}
				control={sources.length === 0 ? "full" : "table"}
			>
				{sources.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Todavía no hay orígenes. Agrega el primero.
					</p>
				) : (
					<SimpleTable columns={COLUMNS}>
						{sources.map((source, index) => (
							<SimpleTableRow key={source.id}>
								<TableCell className={CELL}>
									<span className="flex items-center gap-2">
										<LeadSourceMark icon={source.icon} />
										<span
											className={
												source.archived
													? "text-muted-foreground"
													: "font-medium"
											}
										>
											{source.name}
										</span>
									</span>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{source.contacts}
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={source.archived ? "neutral" : "success"}
										label={source.archived ? "Archivado" : "Activo"}
									/>
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									<span className="flex items-center justify-end gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Subir ${source.name}`}
											disabled={busy || index === 0}
											onClick={() => move(index, -1)}
										>
											<ArrowUpIcon />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Bajar ${source.name}`}
											disabled={busy || index === sources.length - 1}
											onClick={() => move(index, 1)}
										>
											<ArrowDownIcon />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											disabled={busy}
											onClick={() =>
												setEditing({
													id: source.id,
													name: source.name,
													icon: iconOf(source.icon),
												})
											}
										>
											Editar
										</Button>
										{source.archived ? (
											<Button
												variant="ghost"
												size="sm"
												disabled={busy}
												onClick={() => restore.mutate({ id: source.id })}
											>
												Restaurar
											</Button>
										) : (
											<Button
												variant="ghost"
												size="sm"
												disabled={busy}
												onClick={() => archive.mutate({ id: source.id })}
											>
												Archivar
											</Button>
										)}
									</span>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</SettingsCard>

			<SettingsCard
				title="Agregar origen"
				description="Por ejemplo, una feria, una campaña o un distribuidor."
				control="compact"
				action={
					<Button
						type="submit"
						form="new-lead-source"
						size="sm"
						disabled={busy}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Agregar origen
					</Button>
				}
			>
				<form
					id="new-lead-source"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (busy) return;
						const errors: Record<string, string> = {};
						if (draft.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						create.mutate({ name: draft.trim(), icon: draftIcon });
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
								value={draft}
								maxLength={LEAD_SOURCE.nameMaxLength}
								placeholder="Exposición Rural"
								disabled={busy}
								onChange={(event) => setDraft(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={iconId}>Icono</FieldLabel>
							<IconSelect
								id={iconId}
								value={draftIcon}
								disabled={busy}
								onChange={setDraftIcon}
							/>
						</Field>
					</FieldGroup>
				</form>
			</SettingsCard>

			{editing ? (
				<EditDialog
					key={editing.id}
					target={editing}
					pending={update.isPending}
					onClose={() => setEditing(null)}
					onSubmit={(name, icon) =>
						update.mutate({ id: editing.id, name, icon })
					}
				/>
			) : null}
		</SettingsColumn>
	);
}

function IconSelect({
	id,
	value,
	disabled,
	onChange,
}: {
	id: string;
	value: LeadSourceIcon;
	disabled?: boolean;
	onChange: (icon: LeadSourceIcon) => void;
}) {
	return (
		<Select
			value={value}
			disabled={disabled}
			onValueChange={(next) => {
				if (isLeadSourceIcon(next)) onChange(next);
			}}
		>
			<SelectTrigger id={id} className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{LEAD_SOURCE_ICONS.map((icon) => (
					<SelectItem key={icon} value={icon}>
						<span className="flex items-center gap-2">
							<LeadSourceMark icon={icon} />
							{LEAD_SOURCE_ICON_LABELS[icon]}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function EditDialog({
	target,
	pending,
	onClose,
	onSubmit,
}: {
	target: EditTarget;
	pending: boolean;
	onClose: () => void;
	onSubmit: (name: string, icon: LeadSourceIcon) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const iconId = useId();
	const [name, setName] = useState(target.name);
	const [icon, setIcon] = useState(target.icon);

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar origen</DialogTitle>
					<DialogDescription>
						El cambio se ve en todos los contactos que ya tienen este origen.
					</DialogDescription>
				</DialogHeader>

				<form
					id="edit-lead-source"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit(name.trim(), icon);
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
								maxLength={LEAD_SOURCE.nameMaxLength}
								onChange={(event) => setName(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={iconId}>Icono</FieldLabel>
							<IconSelect id={iconId} value={icon} onChange={setIcon} />
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="edit-lead-source" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
