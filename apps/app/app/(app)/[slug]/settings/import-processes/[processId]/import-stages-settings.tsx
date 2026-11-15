"use client";

import { ImportStageKind, type PipelineStageTone } from "@crm/db/enums";
import { IMPORT_STAGE } from "@crm/db/import-stage";
import { PIPELINE_STAGE_TONES } from "@crm/db/pipeline-stage";
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
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
	type ReactNode,
	startTransition,
	useId,
	useOptimistic,
	useState,
} from "react";
import { toast } from "sonner";
import { STAGE_TONE_LABELS, STAGE_TONE_STATUS } from "@/lib/deal-stage-config";
import {
	applyImportStageOrder,
	type ImportStageRow,
	importArchiveTargets,
	splitImportStages,
	utcDay,
} from "@/lib/import-stage-settings";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const ROW = "flex items-center gap-2.5 border-b px-5 py-2.5 last:border-b-0";

const KIND_LABELS = {
	[ImportStageKind.IN_PROGRESS]: "En curso",
	[ImportStageKind.RECEIVED]: "Recepción",
	[ImportStageKind.CANCELLED]: "Cancelación",
} as const;

function shipmentsLabel(count: number): string {
	return count === 1 ? "1 envío" : `${count} envíos`;
}

function ToneSelect({
	id,
	value,
	onChange,
}: {
	id: string;
	value: PipelineStageTone;
	onChange: (tone: PipelineStageTone) => void;
}) {
	return (
		<Select
			value={value}
			onValueChange={(next) => {
				const tone = PIPELINE_STAGE_TONES.find((entry) => entry === next);
				if (tone) onChange(tone);
			}}
		>
			<SelectTrigger id={id} className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PIPELINE_STAGE_TONES.map((tone) => (
					<SelectItem key={tone} value={tone}>
						<StatusIndicator
							size="sm"
							tone={STAGE_TONE_STATUS[tone]}
							label={STAGE_TONE_LABELS[tone]}
						/>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function StageDialog({
	target,
	pending,
	onClose,
	onSubmit,
}: {
	target: ImportStageRow | "new";
	pending: boolean;
	onClose: () => void;
	onSubmit: (values: { name: string; tone: PipelineStageTone }) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const toneId = useId();
	const creating = target === "new";
	const [name, setName] = useState(creating ? "" : target.name);
	const [tone, setTone] = useState<PipelineStageTone>(
		creating ? IMPORT_STAGE.defaultTone : target.tone,
	);

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{creating ? "Agregar etapa" : "Editar etapa"}
					</DialogTitle>
					<DialogDescription>
						{creating
							? "La etapa nueva queda al final de las intermedias."
							: "El cambio se ve en todos los envíos de esta etapa."}
					</DialogDescription>
				</DialogHeader>

				<form
					id="import-stage-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (name.trim() === "") errors[nameId] = "Escribe un nombre.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit({ name: name.trim(), tone });
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
								maxLength={IMPORT_STAGE.nameMaxLength}
								placeholder="Depósito fiscal"
								onChange={(event) => setName(event.target.value)}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={toneId}>Color</FieldLabel>
							<ToneSelect id={toneId} value={tone} onChange={setTone} />
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="import-stage-form" disabled={pending}>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ArchiveDialog({
	stage,
	targets,
	pending,
	onClose,
	onConfirm,
}: {
	stage: ImportStageRow;
	targets: ImportStageRow[];
	pending: boolean;
	onClose: () => void;
	onConfirm: (values: { targetKey: string; occurredAt: string }) => void;
}) {
	const validation = useFormSheetValidation();
	const targetId = useId();
	const dateId = useId();
	const [today] = useState(() => utcDay());
	const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
	const [occurredAt, setOccurredAt] = useState(today);

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Archivar {stage.name}</DialogTitle>
					<DialogDescription>
						{stage.shipmentCount === 1
							? "Hay 1 envío en esta etapa."
							: `Hay ${stage.shipmentCount} envíos en esta etapa.`}{" "}
						Elige a qué etapa pasan y en qué fecha. Cada envío registra el
						cambio con esa fecha. Si un envío ya tiene un cambio posterior, no
						se archiva nada.
					</DialogDescription>
				</DialogHeader>

				<form
					id="import-stage-archive-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending || targetKey === "") return;
						const errors: Record<string, string> = {};
						if (occurredAt === "") errors[dateId] = "Elige una fecha.";
						if (!validation.validate(event.currentTarget, errors)) return;
						onConfirm({ targetKey, occurredAt });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={targetId}>Mover a</FieldLabel>
							<Select value={targetKey} onValueChange={setTargetKey}>
								<SelectTrigger id={targetId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{targets.map((target) => (
										<SelectItem key={target.key} value={target.key}>
											{target.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field data-invalid={!!validation.errors[dateId]}>
							<FieldLabel htmlFor={dateId}>Fecha del cambio</FieldLabel>
							<Input
								id={dateId}
								type="date"
								required
								max={today}
								aria-invalid={!!validation.errors[dateId]}
								aria-describedby={
									validation.errors[dateId] ? `${dateId}-error` : undefined
								}
								value={occurredAt}
								onChange={(event) => setOccurredAt(event.target.value)}
							/>
							<FieldError id={`${dateId}-error`}>
								{validation.errors[dateId]}
							</FieldError>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						form="import-stage-archive-form"
						variant="destructive"
						disabled={pending || targetKey === ""}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Mover y archivar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function StageSummary({ stage }: { stage: ImportStageRow }) {
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-px">
			<StatusIndicator
				size="sm"
				tone={STAGE_TONE_STATUS[stage.tone]}
				label={stage.name}
			/>
			<MetaRow>
				<span>{KIND_LABELS[stage.kind]}</span>
				<span className="tabular-nums">
					{shipmentsLabel(stage.shipmentCount)}
				</span>
			</MetaRow>
		</div>
	);
}

function Row({ children }: { children: ReactNode }) {
	return <div className={ROW}>{children}</div>;
}

export function ImportStagesSettings({ processId }: { processId: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const url = useWorkspaceUrl();

	const [editing, setEditing] = useState<ImportStageRow | "new" | null>(null);
	const [archiving, setArchiving] = useState<ImportStageRow | null>(null);

	const list = useQuery(trpc.importStages.settings.queryOptions({ processId }));
	const [rows, applyKeys] = useOptimistic(
		list.data?.stages,
		(current, keys: string[]) =>
			current ? applyImportStageOrder(current, keys) : current,
	);

	const settled = {
		onSettled: () => cache.importStages(),
		onError: (error: { message: string }) => toast.error(error.message),
	};

	const create = useMutation(
		trpc.importStages.create.mutationOptions({
			...settled,
			onSuccess: () => {
				setEditing(null);
				toast.success("Etapa agregada.");
			},
		}),
	);
	const update = useMutation(
		trpc.importStages.update.mutationOptions({
			...settled,
			onSuccess: () => {
				setEditing(null);
				toast.success("Etapa actualizada.");
			},
		}),
	);
	const reorder = useMutation(
		trpc.importStages.reorder.mutationOptions({ ...settled }),
	);
	const archive = useMutation(
		trpc.importStages.archive.mutationOptions({
			...settled,
			onSuccess: () => {
				setArchiving(null);
				toast.success("Etapa archivada.");
			},
		}),
	);
	const restore = useMutation(
		trpc.importStages.restore.mutationOptions({
			...settled,
			onSuccess: () => toast.success("Etapa restaurada."),
		}),
	);

	if (list.isError) {
		return (
			<SettingsColumn>
				<SettingsCard
					title="No se pudieron cargar las etapas"
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

	if (!list.data || !rows) return null;

	const { canManage } = list.data;
	const { entry, intermediate, received, cancelled, archived } =
		splitImportStages(rows);
	const busy =
		!canManage ||
		create.isPending ||
		update.isPending ||
		archive.isPending ||
		restore.isPending;

	const onReorder = (keys: string[]) => {
		startTransition(async () => {
			applyKeys(keys);
			await reorder.mutateAsync({ processId, keys }).catch(() => undefined);
		});
	};

	const edit = (stage: ImportStageRow) => (
		<Button
			variant="ghost"
			size="sm"
			disabled={busy}
			onClick={() => setEditing(stage)}
		>
			Editar
		</Button>
	);

	const fixed = (stage: ImportStageRow | undefined) =>
		stage ? (
			<Row key={stage.key}>
				<StageSummary stage={stage} />
				{edit(stage)}
			</Row>
		) : null;

	return (
		<SettingsColumn>
			<Button asChild variant="link" size="inline" className="self-start">
				<Link href={url("/settings/import-processes")}>
					Volver a los procesos
				</Link>
			</Button>
			<SettingsCard
				title={list.data.process.name}
				description="Arrastra las etapas intermedias para cambiar el orden. Pedido va siempre primero, y Recibido y Cancelado siempre al final."
				hint={
					canManage
						? "Los cambios se guardan al instante."
						: "Solo un propietario o un administrador puede cambiar las etapas."
				}
				control="table"
				action={
					<Button size="sm" disabled={busy} onClick={() => setEditing("new")}>
						Agregar etapa
					</Button>
				}
			>
				<div>
					{fixed(entry)}

					<SortableList
						ids={intermediate.map((stage) => stage.key)}
						onReorder={onReorder}
					>
						<div>
							{intermediate.map((stage) => (
								<SortableItem
									key={stage.key}
									id={stage.key}
									label={stage.name}
									className={ROW}
								>
									<StageSummary stage={stage} />
									{edit(stage)}
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() =>
											stage.shipmentCount === 0
												? archive.mutate({ key: stage.key })
												: setArchiving(stage)
										}
									>
										Archivar
									</Button>
								</SortableItem>
							))}
						</div>
					</SortableList>

					{fixed(received)}
					{fixed(cancelled)}
				</div>
			</SettingsCard>

			{archived.length > 0 ? (
				<SettingsCard
					title="Etapas archivadas"
					description="Una etapa archivada no recibe envíos. El historial que ya la menciona se conserva."
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
							{archived.map((stage) => (
								<Row key={stage.key}>
									<span className="flex-1 truncate text-13 text-muted-foreground">
										{stage.name}
									</span>
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() => restore.mutate({ key: stage.key })}
									>
										Restaurar
									</Button>
								</Row>
							))}
						</CollapsibleContent>
					</Collapsible>
				</SettingsCard>
			) : null}

			{editing ? (
				<StageDialog
					key={editing === "new" ? "new" : editing.key}
					target={editing}
					pending={create.isPending || update.isPending}
					onClose={() => setEditing(null)}
					onSubmit={(values) =>
						editing === "new"
							? create.mutate({ processId, ...values })
							: update.mutate({ key: editing.key, ...values })
					}
				/>
			) : null}

			{archiving ? (
				<ArchiveDialog
					key={archiving.key}
					stage={archiving}
					targets={importArchiveTargets(rows, archiving.key)}
					pending={archive.isPending}
					onClose={() => setArchiving(null)}
					onConfirm={({ targetKey, occurredAt }) =>
						archive.mutate({ key: archiving.key, targetKey, occurredAt })
					}
				/>
			) : null}
		</SettingsColumn>
	);
}
