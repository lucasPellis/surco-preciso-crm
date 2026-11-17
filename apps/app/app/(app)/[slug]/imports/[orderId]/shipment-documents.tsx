"use client";

import {
	DOCUMENT_ACCEPT,
	DOCUMENT_PROBLEM_MESSAGES,
	documentContentType,
	documentFileProblem,
	IMPORT_DOCUMENT,
} from "@crm/db/import-document";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Badge } from "@crm/ui/components/badge";
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
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { put } from "@vercel/blob/client";
import { CheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	eventChoiceText,
	fileSizeLabel,
	groupLabelsForStage,
	labelFromChoice,
	labelOptionText,
	NO_LABEL,
	type ShipmentDocument,
	splitDocumentLabels,
	stageChecklists,
	suggestedLabelId,
} from "@/lib/import-documents";
import {
	formatDay,
	type ImportShipment,
	type ImportStageOption,
} from "@/lib/import-orders";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const NO_STORAGE_TEXT =
	"Para subir documentos falta configurar el almacenamiento de archivos (BLOB_READ_WRITE_TOKEN).";

const UPLOAD_FAILED = "No se pudo subir el archivo. Intenta de nuevo.";

export function ShipmentDocuments({
	shipment,
	stages,
	canManage,
	documentsEnabled,
	onUpload,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	canManage: boolean;
	documentsEnabled: boolean;
	onUpload: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const url = useWorkspaceUrl();
	const [removing, setRemoving] = useState<ShipmentDocument | null>(null);

	const remove = useMutation(
		trpc.importDocuments.remove.mutationOptions({
			onSuccess: async () => {
				await cache.importOrders();
				setRemoving(null);
				toast.success("Documento eliminado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const checklists = stageChecklists(stages, shipment.documents);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-medium">Documentos</h3>
				<Button
					variant="outline"
					size="sm"
					disabled={!canManage || !documentsEnabled}
					onClick={onUpload}
				>
					Subir documento
				</Button>
			</div>

			{documentsEnabled ? null : (
				<p className="text-13 text-muted-foreground">{NO_STORAGE_TEXT}</p>
			)}

			{checklists.length === 0 ? null : (
				<ul
					aria-label="Documentos esperados por etapa"
					className="flex flex-col gap-2"
				>
					{checklists.map((item) => (
						<li key={item.key} className="flex flex-wrap items-center gap-1.5">
							<span className="text-13 text-muted-foreground">{item.name}</span>
							{item.present.map((label) => (
								<Badge key={label.id} variant="secondary">
									<CheckIcon data-icon="inline-start" aria-hidden="true" />
									{label.name}
								</Badge>
							))}
							{item.missing.map((label) => (
								<Badge key={label.id} variant="outline">
									{`Falta ${label.name}`}
								</Badge>
							))}
						</li>
					))}
				</ul>
			)}

			{shipment.documents.length === 0 ? (
				<p className="text-13 text-muted-foreground">
					Todavía no hay documentos en este envío.
				</p>
			) : (
				<ul aria-label="Documentos del envío" className="flex flex-col">
					{shipment.documents.map((document) => (
						<li
							key={document.id}
							className="flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-px">
								<Button
									asChild
									variant="link"
									size="inline"
									className="self-start"
								>
									<a
										href={url(`/imports/files/${document.id}`)}
										target="_blank"
										rel="noreferrer"
									>
										{document.filename}
									</a>
								</Button>
								<MetaRow>
									<span>{document.label?.name ?? "Sin etiqueta"}</span>
									<span>{document.stage.name}</span>
									<span>{formatDay(document.uploadedAt.slice(0, 10))}</span>
									<span className="tabular-nums">
										{fileSizeLabel(document.size)}
									</span>
									{document.uploadedByName ? (
										<span>{document.uploadedByName}</span>
									) : null}
								</MetaRow>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={!canManage || remove.isPending}
								onClick={() => setRemoving(document)}
							>
								Eliminar
							</Button>
						</li>
					))}
				</ul>
			)}

			<AlertDialog
				open={removing !== null}
				onOpenChange={(open) => (open ? undefined : setRemoving(null))}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
						<AlertDialogDescription>
							{removing
								? `${removing.filename} se borra para siempre del envío y del almacenamiento.`
								: ""}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Conservar</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={(event) => {
								event.preventDefault();
								if (removing) remove.mutate({ id: removing.id });
							}}
						>
							Eliminar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

export function UploadDocumentDialog({
	shipment,
	stages,
	onClose,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const validation = useFormSheetValidation();
	const fileId = useId();
	const labelFieldId = useId();
	const eventFieldId = useId();

	const labels = useQuery(trpc.documentLabels.list.queryOptions());
	const uploadToken = useMutation(
		trpc.importDocuments.uploadToken.mutationOptions(),
	);
	const attach = useMutation(trpc.importDocuments.attach.mutationOptions());

	const latest = shipment.events.at(-1);
	const [eventId, setEventId] = useState(latest?.id ?? "");
	const [labelChoice, setLabelChoice] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);

	const chosenEvent = shipment.events.find((item) => item.id === eventId);
	const chosenStage = stages.find(
		(stage) => stage.key === chosenEvent?.stage.key,
	);
	const label =
		labelChoice ??
		suggestedLabelId(chosenStage, shipment.documents) ??
		NO_LABEL;
	const active = splitDocumentLabels(labels.data?.labels ?? []).active;
	const groups = groupLabelsForStage(active, chosenStage);
	const contentType = file ? documentContentType(file.name, file.type) : null;

	const send = async (chosen: File, type: string) => {
		setUploading(true);
		try {
			const ticket = await uploadToken.mutateAsync({
				eventId,
				filename: chosen.name,
				contentType: type,
				size: chosen.size,
			});
			await put(ticket.pathname, chosen, {
				access: IMPORT_DOCUMENT.access,
				token: ticket.token,
				contentType: type,
			});
			await attach.mutateAsync({
				eventId,
				pathname: ticket.pathname,
				filename: chosen.name,
				labelId: labelFromChoice(label),
			});
			await cache.importOrders();
			toast.success("Documento guardado.");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof TRPCClientError ? error.message : UPLOAD_FAILED,
			);
		} finally {
			setUploading(false);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(next) => (next || uploading ? undefined : onClose())}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Subir documento</DialogTitle>
					<DialogDescription>
						El documento queda en la etapa que elijas. Cuenta para los
						documentos esperados de todas las etapas de este envío.
					</DialogDescription>
				</DialogHeader>

				<form
					id="upload-document-form"
					noValidate
					onInput={validation.onInput}
					onSubmit={(formEvent) => {
						formEvent.preventDefault();
						if (uploading) return;
						const errors: Record<string, string> = {};
						if (!file) {
							errors[fileId] = "Elige un archivo.";
						} else {
							const problem = contentType
								? documentFileProblem({ contentType, size: file.size })
								: "TYPE";
							if (problem) errors[fileId] = DOCUMENT_PROBLEM_MESSAGES[problem];
						}
						if (!validation.validate(formEvent.currentTarget, errors)) return;
						if (!file || !contentType) return;
						void send(file, contentType);
					}}
				>
					<FieldGroup>
						<Field data-invalid={!!validation.errors[fileId]}>
							<FieldLabel htmlFor={fileId}>Archivo</FieldLabel>
							<Input
								id={fileId}
								type="file"
								accept={DOCUMENT_ACCEPT}
								aria-invalid={!!validation.errors[fileId]}
								aria-describedby={
									validation.errors[fileId]
										? `${fileId}-error`
										: `${fileId}-hint`
								}
								onChange={(changeEvent) =>
									setFile(changeEvent.target.files?.[0] ?? null)
								}
							/>
							<FieldDescription id={`${fileId}-hint`}>
								{`PDF, imagen, Excel, Word, CSV o texto. Máximo ${IMPORT_DOCUMENT.maxMegabytes} MB.`}
							</FieldDescription>
							<FieldError id={`${fileId}-error`}>
								{validation.errors[fileId]}
							</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={labelFieldId}>Etiqueta</FieldLabel>
							<Select value={label} onValueChange={setLabelChoice}>
								<SelectTrigger id={labelFieldId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{groups.stage.length > 0 ? (
										<SelectGroup>
											<SelectLabel>De esta etapa</SelectLabel>
											{groups.stage.map((item) => (
												<SelectItem key={item.id} value={item.id}>
													{labelOptionText(item)}
												</SelectItem>
											))}
										</SelectGroup>
									) : null}
									{groups.stage.length > 0 ? <SelectSeparator /> : null}
									<SelectGroup>
										{groups.stage.length > 0 ? (
											<SelectLabel>Otras</SelectLabel>
										) : null}
										<SelectItem value={NO_LABEL}>Sin etiqueta</SelectItem>
										{groups.other.map((item) => (
											<SelectItem key={item.id} value={item.id}>
												{labelOptionText(item)}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							{label === NO_LABEL ? (
								<FieldDescription>
									Sin etiqueta, el documento no cuenta para los documentos
									esperados.
								</FieldDescription>
							) : null}
						</Field>

						<Field>
							<FieldLabel htmlFor={eventFieldId}>Etapa</FieldLabel>
							<Select
								value={eventId}
								onValueChange={(next) => {
									setEventId(next);
									setLabelChoice(null);
								}}
							>
								<SelectTrigger id={eventFieldId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{shipment.events.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{eventChoiceText(item)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button variant="outline" disabled={uploading} onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						form="upload-document-form"
						disabled={uploading || eventId === ""}
					>
						{uploading ? <Spinner data-icon="inline-start" /> : null}
						Subir
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
