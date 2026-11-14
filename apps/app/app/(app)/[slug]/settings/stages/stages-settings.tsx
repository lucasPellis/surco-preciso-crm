"use client";

import { PipelineStageKind, type PipelineStageTone } from "@crm/db/enums";
import {
	hoursLabel,
	INTERMEDIATE_KINDS,
	PIPELINE_STAGE,
	PIPELINE_STAGE_TONES,
} from "@crm/db/pipeline-stage";
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
	applyOrder,
	archiveTargets,
	type StageSettingsRow,
	splitStages,
	wholeNumberOf,
} from "@/lib/stage-settings";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const ROW = "flex items-center gap-2.5 border-b px-5 py-2.5 last:border-b-0";

const KIND_LABELS = {
	[PipelineStageKind.OPEN]: "Abierta",
	[PipelineStageKind.PAUSED]: "En pausa",
	[PipelineStageKind.WON]: "Cierre ganado",
	[PipelineStageKind.LOST]: "Cierre perdido",
} as const;

type FormValues = {
	name: string;
	kind: (typeof INTERMEDIATE_KINDS)[number];
	tone: PipelineStageTone;
	idle: string;
	autoLose: string;
};

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
	target: StageSettingsRow | "new";
	pending: boolean;
	onClose: () => void;
	onSubmit: (values: {
		name: string;
		kind: FormValues["kind"];
		tone: PipelineStageTone;
		idleAfterHours: number | null;
		autoLoseAfterDays: number | null;
	}) => void;
}) {
	const validation = useFormSheetValidation();
	const nameId = useId();
	const kindId = useId();
	const toneId = useId();
	const idleId = useId();
	const autoLoseId = useId();
	const creating = target === "new";
	const closed =
		!creating &&
		(target.kind === PipelineStageKind.WON ||
			target.kind === PipelineStageKind.LOST);
	const [values, setValues] = useState<FormValues>({
		name: creating ? "" : target.name,
		kind:
			!creating && target.kind === PipelineStageKind.PAUSED
				? PipelineStageKind.PAUSED
				: PipelineStageKind.OPEN,
		tone: creating ? PIPELINE_STAGE.defaultTone : target.tone,
		idle:
			creating || target.idleAfterHours === null
				? ""
				: String(target.idleAfterHours),
		autoLose:
			creating || target.autoLoseAfterDays === null
				? ""
				: String(target.autoLoseAfterDays),
	});
	const kind = creating ? values.kind : target.kind;
	const showIdle = kind === PipelineStageKind.OPEN;
	const showAutoLose = kind === PipelineStageKind.PAUSED;
	const idleHours = wholeNumberOf(values.idle);
	const autoLoseDays = wholeNumberOf(values.autoLose);

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
							: "El cambio se ve en todas las oportunidades de esta etapa."}
					</DialogDescription>
				</DialogHeader>

				<form
					id="stage-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (pending) return;
						const errors: Record<string, string> = {};
						if (values.name.trim() === "")
							errors[nameId] = "Escribe un nombre.";
						if (showIdle && idleHours === undefined) {
							errors[idleId] =
								`Escribe un número entero entre 1 y ${PIPELINE_STAGE.idleMaxHours}, o déjalo vacío.`;
						}
						if (showIdle && (idleHours ?? 0) > PIPELINE_STAGE.idleMaxHours) {
							errors[idleId] =
								`El máximo es ${PIPELINE_STAGE.idleMaxHours} horas.`;
						}
						if (showAutoLose && autoLoseDays === undefined) {
							errors[autoLoseId] =
								`Escribe un número entero entre 1 y ${PIPELINE_STAGE.autoLoseMaxDays}, o déjalo vacío.`;
						}
						if (
							showAutoLose &&
							(autoLoseDays ?? 0) > PIPELINE_STAGE.autoLoseMaxDays
						) {
							errors[autoLoseId] =
								`El máximo es ${PIPELINE_STAGE.autoLoseMaxDays} días.`;
						}
						if (!validation.validate(event.currentTarget, errors)) return;
						onSubmit({
							name: values.name.trim(),
							kind: values.kind,
							tone: values.tone,
							idleAfterHours: showIdle ? (idleHours ?? null) : null,
							autoLoseAfterDays: showAutoLose ? (autoLoseDays ?? null) : null,
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
								value={values.name}
								maxLength={PIPELINE_STAGE.nameMaxLength}
								placeholder="Visita técnica"
								onChange={(event) =>
									setValues({ ...values, name: event.target.value })
								}
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
						</Field>

						{creating ? (
							<Field>
								<FieldLabel htmlFor={kindId}>Tipo</FieldLabel>
								<Select
									value={values.kind}
									onValueChange={(next) => {
										const found = INTERMEDIATE_KINDS.find(
											(entry) => entry === next,
										);
										if (found) setValues({ ...values, kind: found });
									}}
								>
									<SelectTrigger id={kindId} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{INTERMEDIATE_KINDS.map((entry) => (
											<SelectItem key={entry} value={entry}>
												{KIND_LABELS[entry]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldDescription>
									Una etapa en pausa no cuenta como pérdida ni como oportunidad
									abierta.
								</FieldDescription>
							</Field>
						) : null}

						{closed ? null : (
							<Field>
								<FieldLabel htmlFor={toneId}>Color</FieldLabel>
								<ToneSelect
									id={toneId}
									value={values.tone}
									onChange={(tone) => setValues({ ...values, tone })}
								/>
							</Field>
						)}

						{showIdle && !closed ? (
							<Field data-invalid={!!validation.errors[idleId]}>
								<FieldLabel htmlFor={idleId}>Horas sin actividad</FieldLabel>
								<Input
									id={idleId}
									inputMode="numeric"
									aria-invalid={!!validation.errors[idleId]}
									aria-describedby={
										validation.errors[idleId] ? `${idleId}-error` : undefined
									}
									value={values.idle}
									placeholder="Sin alerta"
									onChange={(event) =>
										setValues({ ...values, idle: event.target.value })
									}
								/>
								<FieldDescription>
									{idleHours
										? `Se avisa tras ${hoursLabel(idleHours)} sin actividad.`
										: "Vacío significa sin alerta."}
								</FieldDescription>
								<FieldError id={`${idleId}-error`}>
									{validation.errors[idleId]}
								</FieldError>
							</Field>
						) : null}
						{showAutoLose ? (
							<Field data-invalid={!!validation.errors[autoLoseId]}>
								<FieldLabel htmlFor={autoLoseId}>
									Días hasta pasar a Perdido
								</FieldLabel>
								<Input
									id={autoLoseId}
									inputMode="numeric"
									aria-invalid={!!validation.errors[autoLoseId]}
									aria-describedby={
										validation.errors[autoLoseId]
											? `${autoLoseId}-error`
											: undefined
									}
									value={values.autoLose}
									placeholder="Nunca"
									onChange={(event) =>
										setValues({ ...values, autoLose: event.target.value })
									}
								/>
								<FieldDescription>
									{autoLoseDays
										? `Tras ${autoLoseDays} ${autoLoseDays === 1 ? "día" : "días"} sin moverse, la oportunidad pasa a Perdido con el motivo Sin respuesta.`
										: "Vacío significa que nunca pasa a Perdido."}
								</FieldDescription>
								<FieldError id={`${autoLoseId}-error`}>
									{validation.errors[autoLoseId]}
								</FieldError>
							</Field>
						) : null}
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form="stage-form" disabled={pending}>
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
	stage: StageSettingsRow;
	targets: StageSettingsRow[];
	pending: boolean;
	onClose: () => void;
	onConfirm: (targetKey: string) => void;
}) {
	const targetId = useId();
	const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Archivar {stage.name}</DialogTitle>
					<DialogDescription>
						{stage.dealCount === 1
							? "Hay 1 oportunidad en esta etapa."
							: `Hay ${stage.dealCount} oportunidades en esta etapa.`}{" "}
						Elige a qué etapa pasan. Todas se mueven juntas y cada movimiento
						queda en su historial.
					</DialogDescription>
				</DialogHeader>

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

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						variant="destructive"
						disabled={pending || targetKey === ""}
						onClick={() => onConfirm(targetKey)}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Mover y archivar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function StageSummary({ stage }: { stage: StageSettingsRow }) {
	return (
		<span className="flex min-w-0 flex-1 flex-col gap-px">
			<span className="flex items-center gap-2">
				<StatusIndicator
					size="sm"
					tone={STAGE_TONE_STATUS[stage.tone]}
					label={stage.name}
				/>
			</span>
			<span className="flex flex-wrap gap-x-3 text-13 text-muted-foreground">
				<span>{KIND_LABELS[stage.kind]}</span>
				<span className="tabular-nums">
					{stage.dealCount === 1
						? "1 oportunidad"
						: `${stage.dealCount} oportunidades`}
				</span>
				{stage.idleAfterHours === null ? null : (
					<span>Alerta tras {hoursLabel(stage.idleAfterHours)}</span>
				)}
				{stage.autoLoseAfterDays === null ? null : (
					<span>Pasa a Perdido tras {stage.autoLoseAfterDays} días</span>
				)}
			</span>
		</span>
	);
}

function Row({ children }: { children: ReactNode }) {
	return <div className={ROW}>{children}</div>;
}

export function StagesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [editing, setEditing] = useState<StageSettingsRow | "new" | null>(null);
	const [archiving, setArchiving] = useState<StageSettingsRow | null>(null);

	const list = useQuery(trpc.deals.stageList.queryOptions());
	const [rows, applyKeys] = useOptimistic(
		list.data?.stages,
		(current, keys: string[]) =>
			current ? applyOrder(current, keys) : current,
	);

	const settled = {
		onSettled: () => cache.stages(),
		onError: (error: { message: string }) => toast.error(error.message),
	};

	const create = useMutation(
		trpc.deals.createStage.mutationOptions({
			...settled,
			onSuccess: () => {
				setEditing(null);
				toast.success("Etapa agregada.");
			},
		}),
	);
	const update = useMutation(
		trpc.deals.updateStage.mutationOptions({
			...settled,
			onSuccess: () => {
				setEditing(null);
				toast.success("Etapa actualizada.");
			},
		}),
	);
	const reorder = useMutation(
		trpc.deals.reorderStages.mutationOptions({ ...settled }),
	);
	const archive = useMutation(
		trpc.deals.archiveStage.mutationOptions({
			...settled,
			onSuccess: () => {
				setArchiving(null);
				toast.success("Etapa archivada.");
			},
		}),
	);
	const restore = useMutation(
		trpc.deals.restoreStage.mutationOptions({
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
	const { entry, intermediate, won, lost, archived } = splitStages(rows);
	const busy =
		!canManage ||
		create.isPending ||
		update.isPending ||
		archive.isPending ||
		restore.isPending;

	const onReorder = (keys: string[]) => {
		startTransition(async () => {
			applyKeys(keys);
			await reorder.mutateAsync({ keys }).catch(() => undefined);
		});
	};

	const edit = (stage: StageSettingsRow) => (
		<Button
			variant="ghost"
			size="sm"
			disabled={busy}
			onClick={() => setEditing(stage)}
		>
			Editar
		</Button>
	);

	const fixed = (stage: StageSettingsRow | undefined) =>
		stage ? (
			<Row key={stage.key}>
				<StageSummary stage={stage} />
				{edit(stage)}
			</Row>
		) : null;

	return (
		<SettingsColumn>
			<SettingsCard
				title="Etapas del funnel"
				description="Arrastra las etapas intermedias para cambiar el orden. Nuevo va siempre primero, y Ganado y Perdido siempre al final."
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
											stage.dealCount === 0
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

					{fixed(won)}
					{fixed(lost)}
				</div>
			</SettingsCard>

			{archived.length > 0 ? (
				<SettingsCard
					title="Etapas archivadas"
					description="Una etapa archivada no recibe oportunidades. El historial que ya la menciona se conserva."
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
							? create.mutate({
									name: values.name,
									kind: values.kind,
									tone: values.tone,
									idleAfterHours: values.idleAfterHours,
									autoLoseAfterDays: values.autoLoseAfterDays,
								})
							: update.mutate({
									key: editing.key,
									name: values.name,
									tone:
										editing.kind === PipelineStageKind.WON ||
										editing.kind === PipelineStageKind.LOST
											? undefined
											: values.tone,
									idleAfterHours:
										editing.kind === PipelineStageKind.OPEN
											? values.idleAfterHours
											: undefined,
									autoLoseAfterDays:
										editing.kind === PipelineStageKind.PAUSED
											? values.autoLoseAfterDays
											: undefined,
								})
					}
				/>
			) : null}

			{archiving ? (
				<ArchiveDialog
					key={archiving.key}
					stage={archiving}
					targets={archiveTargets(rows, archiving.key)}
					pending={archive.isPending}
					onClose={() => setArchiving(null)}
					onConfirm={(targetKey) =>
						archive.mutate({ key: archiving.key, targetKey })
					}
				/>
			) : null}
		</SettingsColumn>
	);
}
