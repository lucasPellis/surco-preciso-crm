# Shipment Documents (part 7 of 8: documents panel, upload, download, move warning) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each shipment card lists its files and the checklist, uploads and deletes files. The move dialog warns about missing labels. A link downloads a file.

**Architecture:** Pure helpers in `apps/app/lib/import-documents.ts` (tested first). The labels screen copies the shape of `settings/import-processes`. The stage editor gets one dialog. The shipment card renders `ShipmentDocuments` from a new client file. The upload calls `importDocuments.uploadToken`, then `put` from `@vercel/blob/client`, then `importDocuments.attach`. A download is a plain link to a Next route handler that asks the API for a signed URL and redirects.

**Tech Stack:** Next.js 16 app router, React 19, TanStack Query with tRPC, Radix through `@crm/ui`, `@vercel/blob` 2.6.1 client, bun test.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Part 6 must be done.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server errors. No voseo: "Elige", never "Elegí".
- Do not run `migrate dev`, `migrate reset` or `db push`. The migration is written by hand. The owner applies it.
- Do not read `.env`. Use `--env-file`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument. Quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** No `git add`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app`, `apps/api` and docs. Before you edit a shared file (`schema.prisma`, `app.module.ts`, `generated/server.ts`, `import-processes.service.ts`, `import-stages.*`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk that this plan did not write and that collides with an old text below, stop and ask the owner.
- Never call `Promise.all` on a transaction client (`tx`).
- `lint:slop` rejects `.catch((x: unknown) => x)`, parameters typed `unknown` or `object`, `Record<string, unknown>` and `...(condition ? {...} : {})`.
- `noUncheckedIndexedAccess` is on. Guard `list[index]`.
- **Integration specs share `crm_test`.** Every spec here removes its own rows in foreign key order: processes (through `removeTestProcesses`, which cascades shipments, events, files and stage links), then labels, products, members, users. After a failed run, run the leftover check in part 8 (`-h.md`), Task 10 Step 6.

Extra rules for the screens:
- Read `docs/design.md`, `.agents/skills/no-use-effect`, `.agents/skills/shadcn` and `apps/app/AGENTS.md`. Next.js 16: read `apps/app/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before you write a route handler.
- A `"use client"` file imports only `@crm/ui`, the tRPC client (`@trpc/client` included), React, Next navigation, `sonner`, `lucide-react`, `@vercel/blob/client`, enum-only `@crm/db` subpaths, `@crm/db/import-document` (it imports nothing) and `@/lib/*` helpers. Never `@crm/db/import-document-blob`, never `@crm/auth`, never the `@crm/db` barrel.
- No `useEffect`. Derive during render.
- UI from `packages/ui` only. Semantic tokens and the scale. No new variant at the call site.

The decisions are in part 6 (`-f.md`), *Decisions recorded in this part*.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `apps/app/package.json`, `bun.lock` | `@vercel/blob` |
| `apps/app/app/(app)/[slug]/imports/[orderId]/shipment-documents.tsx` | Panel, checklist, files, upload dialog |
| `apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx` | Renders the panel and the dialog |
| `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx` | Move warning |
| `apps/app/app/(app)/[slug]/imports/files/[documentId]/route.ts` | Download redirect |


---

### Task 8: The documents panel, upload, download and the move warning

**Files:**
- Modify: `apps/app/package.json`, `bun.lock`
- Create: `apps/app/app/(app)/[slug]/imports/[orderId]/shipment-documents.tsx`
- Modify: `apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx`
- Modify: `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`
- Create: `apps/app/app/(app)/[slug]/imports/files/[documentId]/route.ts`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD --stat -- 'apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx' 'apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx' && rtk proxy rg -c "targets.map\(\(target\)" 'apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx'`
Expected: `order-view.tsx` is untracked (new in this branch), so the stat may be empty or show the split-shipments hunks of `shipment-dialogs.tsx`. The count is `1`. If another session changed `ShipmentCard` or `MoveShipmentDialog` so an old text below no longer matches, stop and ask the owner.

- [ ] **Step 2: Add the client dependency**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun add @vercel/blob@2.6.1`
Expected: `apps/app/package.json` lists `"@vercel/blob": "2.6.1"`. Check: `eza -la /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app/node_modules/@vercel` shows `blob ->` a path with `@vercel+blob@2.6.1`. Another version: stop and report.

- [ ] **Step 3: Write the panel and the upload dialog**

Create `apps/app/app/(app)/[slug]/imports/[orderId]/shipment-documents.tsx`:

```tsx
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
	SelectItem,
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
	const [label, setLabel] = useState(
		() =>
			suggestedLabelId(
				stages.find((stage) => stage.key === latest?.stage.key),
				shipment.documents,
			) ?? NO_LABEL,
	);
	const [file, setFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);

	const active = splitDocumentLabels(labels.data?.labels ?? []).active;
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
							<Select value={label} onValueChange={setLabel}>
								<SelectTrigger id={labelFieldId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_LABEL}>Sin etiqueta</SelectItem>
									{active.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{labelOptionText(item)}
										</SelectItem>
									))}
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
							<Select value={eventId} onValueChange={setEventId}>
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
```

- [ ] **Step 4: Render the panel on each shipment card**

In `apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx`, replace:

```tsx
} from "../shipment-dialogs";
```

with:

```tsx
} from "../shipment-dialogs";
import { ShipmentDocuments, UploadDocumentDialog } from "./shipment-documents";
```

Replace:

```tsx
	| { kind: "info"; shipment: ImportShipment }
	| null;
```

with:

```tsx
	| { kind: "info"; shipment: ImportShipment }
	| { kind: "upload"; shipment: ImportShipment }
	| null;
```

Replace:

```tsx
									onEdit={() => setDialog({ kind: "info", shipment })}
								/>
```

with:

```tsx
									onEdit={() => setDialog({ kind: "info", shipment })}
									documentsEnabled={order.documentsEnabled}
									onUpload={() => setDialog({ kind: "upload", shipment })}
								/>
```

Replace:

```tsx
			{dialog?.kind === "info" ? (
				<ShipmentInfoDialog shipment={dialog.shipment} onClose={close} />
			) : null}
```

with:

```tsx
			{dialog?.kind === "info" ? (
				<ShipmentInfoDialog shipment={dialog.shipment} onClose={close} />
			) : null}
			{dialog?.kind === "upload" ? (
				<UploadDocumentDialog
					shipment={dialog.shipment}
					stages={order.stages}
					onClose={close}
				/>
			) : null}
```

Replace:

```tsx
	onAdvance,
	onEdit,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	position: number;
	canManage: boolean;
	onAdvance: (nextKey: string | null) => void;
	onEdit: () => void;
}) {
```

with:

```tsx
	onAdvance,
	onEdit,
	documentsEnabled,
	onUpload,
}: {
	shipment: ImportShipment;
	stages: ImportStageOption[];
	position: number;
	canManage: boolean;
	onAdvance: (nextKey: string | null) => void;
	onEdit: () => void;
	documentsEnabled: boolean;
	onUpload: () => void;
}) {
```

Replace:

```tsx
			<MetaRow>
				{shipment.lines.map((line) => (
					<span key={line.orderLineId}>{`${line.sku}: ${line.quantity}`}</span>
				))}
			</MetaRow>
		</section>
```

with:

```tsx
			<MetaRow>
				{shipment.lines.map((line) => (
					<span key={line.orderLineId}>{`${line.sku}: ${line.quantity}`}</span>
				))}
			</MetaRow>

			<ShipmentDocuments
				shipment={shipment}
				stages={stages}
				canManage={canManage}
				documentsEnabled={documentsEnabled}
				onUpload={onUpload}
			/>
		</section>
```

- [ ] **Step 5: Warn in the move dialog**

In `apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx`, replace:

```tsx
import { utcDay } from "@/lib/import-stage-settings";
```

with:

```tsx
import { missingDocumentsText } from "@/lib/import-documents";
import { utcDay } from "@/lib/import-stage-settings";
```

Replace:

```tsx
	const [targetKey, setTargetKey] = useState(
		initialKey ?? targets[0]?.key ?? "",
	);
	const [occurredAt, setOccurredAt] = useState(today);
```

with:

```tsx
	const [targetKey, setTargetKey] = useState(
		initialKey ?? targets[0]?.key ?? "",
	);
	const [occurredAt, setOccurredAt] = useState(today);
	const missing = missingDocumentsText(
		stages.find((stage) => stage.key === targetKey),
		shipment.documents,
	);
```

Replace:

```tsx
									{targets.map((target) => (
										<SelectItem key={target.key} value={target.key}>
											{target.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
```

with:

```tsx
									{targets.map((target) => (
										<SelectItem key={target.key} value={target.key}>
											{target.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{missing ? <FieldDescription>{missing}</FieldDescription> : null}
						</Field>
```

`FieldDescription` is already imported in this file.

- [ ] **Step 6: Write the download route**

Read `apps/app/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` first: `params` is a promise. The existing `apps/app/app/api/[...path]/route.ts` calls `await connection()` first, and this route does the same.

Create `apps/app/app/(app)/[slug]/imports/files/[documentId]/route.ts`:

```ts
import { TRPCClientError } from "@trpc/client";
import { connection } from "next/server";
import { getServerTrpcClient } from "@/lib/trpc/server";

type DocumentParams = Promise<{ slug: string; documentId: string }>;

export async function GET(
	_request: Request,
	{ params }: { params: DocumentParams },
): Promise<Response> {
	await connection();
	const { documentId } = await params;

	try {
		const { url } = await getServerTrpcClient().importDocuments.downloadUrl.query(
			{ id: documentId },
		);
		return Response.redirect(url, 302);
	} catch (error) {
		if (!(error instanceof TRPCClientError)) throw error;
		const status =
			typeof error.data?.httpStatus === "number" ? error.data.httpStatus : 502;
		return new Response(error.message, {
			status,
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	}
}
```

The route is a server file. It forwards the session cookie through `getServerTrpcClient`. It holds no secret.

- [ ] **Step 7: Type check and test**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=app`
Expected: no errors. If `error.data?.httpStatus` does not type check, report the message. Do not cast to `any`.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test`
Expected: every app spec passes.
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy rg -n "import-document-blob|@crm/auth|from \"@crm/db\"" 'apps/app/app/(app)/[slug]/imports/[orderId]/shipment-documents.tsx' 'apps/app/app/(app)/[slug]/settings/document-labels/document-labels-settings.tsx' apps/app/lib/import-documents.ts`
Expected: no output. A client file reaches no server package.

- [ ] **Step 8: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/app/package.json 'apps/app/app/(app)/[slug]/imports/[orderId]/shipment-documents.tsx' 'apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx' 'apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx' 'apps/app/app/(app)/[slug]/imports/files/[documentId]/route.ts' && bunx biome check apps/app/package.json 'apps/app/app/(app)/[slug]/imports/[orderId]/shipment-documents.tsx' 'apps/app/app/(app)/[slug]/imports/[orderId]/order-view.tsx' 'apps/app/app/(app)/[slug]/imports/shipment-dialogs.tsx' 'apps/app/app/(app)/[slug]/imports/files/[documentId]/route.ts'`
Expected: no errors. If only import order is reported, run the same paths with `bunx biome check --write`.

- [ ] **Step 9: Hand over**

Tell the owner: part 7 is done, and part 8 (`docs/superpowers/plans/2026-11-16-shipment-documents-h.md`) is next. Do not commit.

---

## Self-review (parts 6 and 7)

| Brief item | Where |
| --- | --- |
| Labels settings screen, route decided, menu and palette | Task 7a Steps 8 and 9 |
| Stage editor picks expected labels | Task 7b (`-h.md`) |
| Documents panel with every event's files | Task 8 Step 3 `ShipmentDocuments` |
| Present and missing per stage, reuse across stages | `stageChecklists`, Task 7a test "counts a file of one stage at every stage…" |
| Move dialog warning, non-blocking | Task 8 Step 5, `missingDocumentsText` |
| Upload disabled without the token, says why | `documentsEnabled`, `NO_STORAGE_TEXT` |
| Members read and download, writes disabled | `canManage` on every write control; the link has no role gate |
| Download from the private decision | Task 8 Step 6 |
| No client import of a server package | Task 8 Step 7 check |

**Placeholder scan.** None.

**Name consistency.** `stageChecklists`, `missingDocumentsText`, `suggestedLabelId`, `labelOptionText`, `labelFromChoice`, `splitDocumentLabels`, `directionLabel`, `eventChoiceText`, `fileSizeLabel`, `NO_LABEL`, `DocumentLabelRow`, `ShipmentDocument`, `ExpectedLabel` (Task 7a Step 5) are the names Task 7a Step 8, Task 7b (`-h.md`) and Task 8 use. `cache.documentLabels` (Task 7a Step 7) is used by the labels screen.

**Known risks.**
- The browser `put` error messages of `@vercel/blob` are English. The dialog shows its own Spanish sentence for them.
- A file name longer than 200 characters is refused by the API with its own message after the click.
- The upload dialog cannot cancel a running upload. It blocks closing while `uploading` is true.
