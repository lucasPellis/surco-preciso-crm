# Shipment documents — design

Date: 2026-11-16. Status: draft for the owner, not built.

Plan B of `docs/superpowers/specs/2026-11-15-import-processes-design.md`. It builds the
section *Documents and storage* of `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`
and closes its open item 1 (where the Blob handshake lives).

Plans, run in order: `docs/superpowers/plans/2026-11-16-shipment-documents-a.md` (rules,
database), `-b.md` (labels API), `-c.md` (expected labels), `-d.md` (upload token, attach),
`-e.md` (remove, download, order detail), `-f.md` (helpers, labels screen), `-g.md`
(documents panel), `-h.md` (stage editor, seed, docs, checks).

## Goal

In each stage of a shipment, the owner uploads files and tags each file with a label. The
files stay for good. Examples: the commercial invoice (PI) and the packing list from the
factory, the DHL *informe de pedido tomado*, the import costs (files we receive), the payment
receipt and the bank presentation (files we produce). Each stage lists the labels it
expects. The shipment shows which expected labels have a file and which do not. The list
warns. It never blocks a move.

## Decisions

| Question | Answer |
| --- | --- |
| Where a file hangs | On one `ShipmentStageEvent` (lifecycle design). Each shipment has its own files |
| Label | A `DocumentLabel` row: unique name, `direction` (`IN` or `OUT`), `archivedAt` |
| Label on upload | Optional. The upload dialog proposes the first missing expected label of the stage |
| Expected labels | `ImportStageDocument` (stage, label, position). A checklist that warns |
| Present means | Any file of the shipment with that label, at any stage event |
| Archived label | Leaves every checklist. Stays on its files. Cannot tag a new file |
| Storage | Vercel Blob, private access, client upload |
| Handshake | The tRPC mutation `importDocuments.uploadToken` in the API. No REST route |
| `handleUpload` / `onUploadCompleted` | Not used. The browser calls `importDocuments.attach` after the upload |
| Download | `/[slug]/imports/files/[documentId]`, a Next route handler that redirects to a signed URL valid 5 minutes |
| Preview | The browser opens the file in a new tab. A PDF or an image shows there. No preview inside the app |
| Max size | 20 MB (`IMPORT_DOCUMENT.maxMegabytes`) |
| Types | PDF, JPEG, PNG, WebP, XLSX, XLS, DOCX, CSV, plain text |
| Closed shipment | Files are allowed on a received or cancelled shipment and on an archived order |
| Delete | Owner and admin. The row goes first, then the blob, best effort and logged |
| Settings route | `/settings/document-labels`, *Etiquetas de documentos* |
| Seed | A sibling script `seed-document-labels-courier-ar.ts`, idempotent |

### Why the handshake is a tRPC mutation in the API

- The Next.js app has no `BLOB_READ_WRITE_TOKEN` (`docs/environment.md`). The API has it:
  `apps/api/src/config/env.validation.ts` declares it and `apps/api/turbo.json` passes it.
- `docs/api.md`: tRPC is the data surface, REST is auth and health only.
- The installed `@vercel/blob` 2.6.1 exports `generateClientTokenFromReadWriteToken` from
  `@vercel/blob/client`. A mutation calls it after the checks that `onBeforeGenerateToken`
  would run. The browser then calls `put(pathname, file, { access, token, contentType })`
  from `@vercel/blob/client`. That is what `upload()` does inside, without the extra route.
- `onUploadCompleted` needs a callback URL that Vercel Blob can reach. A local install has
  none. The browser calls `attach` instead, and `attach` trusts nothing from the browser.

### Why private, and the cost

`@vercel/blob` 2.6.1 has `access: "private"` (`BlobAccessType = 'public' | 'private'`),
`issueSignedToken` and `presignUrl` for a signed `GET`.

- **Public:** the URL is unguessable but permanent. Anyone who gets it (a forwarded mail,
  browser history, a log) reads the invoice or the bank paper forever. Revoking it means
  deleting the file.
- **Private (chosen):** every download goes through the API, which checks the session. A
  link dies after 5 minutes. The cost: one API call per download, and a file cannot be
  embedded as a plain `<img>` source.
- The access mode is one constant, `IMPORT_DOCUMENT.access`. The download path is the same
  for both modes, because `presignUrl` takes `access`.

## Data model

New enum and three tables. One migration, `20261116120000_shipment_documents`, written by
hand.

- `DocumentDirection`: `IN`, `OUT`.
- `DocumentLabel` (`document_label`): `id`, `name` (unique), `direction`, `archivedAt`,
  `createdAt`, `updatedAt`.
- `ImportStageDocument` (`import_stage_document`): `stageKey` (FK `import_stage.key`,
  cascade), `labelId` (FK, restrict), `position`. Primary key (`stageKey`, `labelId`).
- `Attachment` (`attachment`): `id`, `pathname` (unique), `filename`, `contentType`, `size`,
  `labelId` (optional, FK restrict), `uploadedById` (optional, FK `user`, set null),
  `shipmentStageEventId` (required, FK cascade), `createdAt`.

Migration notes:

- The name `Attachment` is free. `AgentConversationAttachment` is a different model.
- `shipmentStageEventId` is required now. Phase 4 adds `stockMovementId` and makes both
  optional with a check that exactly one is set.
- No backfill. Nothing is deleted.
- `ImportStageDocument` follows the stage by `key`, like `Shipment.stageKey`. Stage keys
  never change.

## Rules

1. A label name is unique ignoring case. Create and rename take one advisory lock, so two
   writers never store *Packing list* and *packing list*.
2. A label is never deleted. Archive hides it from every checklist and from the upload
   dialog. Its files keep it. Restore brings it back, with its old stage links.
3. A stage has at most 20 expected labels, without repeats. Saving the list replaces the
   active links of the stage. Links to archived labels stay.
4. Duplicating a process copies the expected labels of each copied stage.
5. The checklist of a stage compares its expected labels with the labels of **every** file
   of the shipment. A packing list uploaded at *Documentos de fábrica* counts at
   *Presentado al banco*.
6. The checklist never blocks. The move dialog names the missing labels of the target stage
   and says the move is still allowed.
7. Allowed types and the size limit live in `IMPORT_DOCUMENT` (`packages/db/src/import-document.ts`).
   The browser, the token and the attach step use the same rule, `documentFileProblem`.
8. The server builds the pathname: `import-documents/<shipmentId>/<eventId>/<uuid>-<safe name>`.
   The token is valid for that pathname only, for 10 minutes.
9. `attach` accepts a pathname only under the prefix of the given event. It reads the size
   and the type from the store (`head`), never from the browser.
10. A refused attach removes the uploaded blob. A second attach of one pathname is refused,
    and the saved file stays.
11. A file is allowed on any shipment of any order. Documents are records. They are not a
    stage move.
12. Delete removes the row, then the blob. A failed blob removal is logged with the
    document id only. The screen still shows success.
13. Without `BLOB_READ_WRITE_TOKEN`, the upload button is disabled and the panel says why.
    `uploadToken`, `attach` and `downloadUrl` refuse with a sentence. The list of files and
    the checklist still show. Nothing crashes.

## Upload and storage flow

1. The owner clicks *Subir documento* on a shipment card. The dialog has *Archivo*,
   *Etiqueta* and *Etapa* (the stage events of the shipment, the latest one chosen).
2. The browser checks the file with `documentContentType` and `documentFileProblem`.
3. The browser calls `importDocuments.uploadToken({ eventId, filename, contentType, size })`.
   The API checks, in order: `canManageInventory`, storage enabled, `documentFileProblem`,
   the event exists. It builds the pathname and calls `generateClientTokenFromReadWriteToken`
   with `allowedContentTypes: [contentType]`, `maximumSizeInBytes`, `validUntil`,
   `addRandomSuffix: false`, `allowOverwrite: false`. It returns `{ pathname, token }`.
4. The browser calls `put(pathname, file, { access: "private", token, contentType })`. Vercel
   Blob enforces the pathname, the type and the size in the token.
5. The browser calls `importDocuments.attach({ eventId, pathname, filename, labelId })`. The
   API checks, in order: `canManageInventory`, storage enabled, the event exists, the
   pathname is under `import-documents/<shipmentId>/<eventId>/`, no row has the pathname,
   the store has the blob (`head`), the stored type and size pass `documentFileProblem`,
   the label exists and is active. A refusal after step 4 removes the blob. Then it writes
   the row with the stored size and type, and returns the order detail.
6. The page refreshes through `cache.importOrders()`.

Download: the link points to `/[slug]/imports/files/[documentId]`. The route handler calls
`importDocuments.downloadUrl` with the session cookie. The API checks the session, finds the
row, calls `issueSignedToken({ pathname, operations: ["get"], validUntil })` and
`presignUrl(..., { operation: "get", access })`. The handler answers `302` to that URL.

## Screens

All text is neutral Spanish. UI comes from `packages/ui`.

- **Etiquetas de documentos** (`/settings/document-labels`). In the settings menu after
  *Procesos de importación* and in the command palette. One card with the active labels:
  name, *Entrada* or *Salida*, the count of files and of stages. *Nueva etiqueta*, *Editar*
  (name and direction), *Archivar*. A collapsible card with the archived labels and
  *Restaurar*.
- **Stage editor** (`/settings/import-processes/[processId]`). Each active stage row gets
  *Documentos*. It opens a dialog with one checkbox per active label. The row meta says
  *N documentos esperados*. With no label yet, the dialog links to the labels screen.
- **Documents panel** (each shipment card on `/imports/[orderId]`). A heading *Documentos*
  and *Subir documento*. Then the checklist, then the files.
- **Checklist chips.** One line per stage that expects labels: the stage name, then a badge
  per label. A present label shows a check and its name. A missing label says
  *Falta <name>*. The text carries the state, not the colour only. The cancelled stage has
  no line.
- **Files.** Each file is a link that opens in a new tab, then its label (or *Sin
  etiqueta*), its stage, its day, its size and who uploaded it. *Eliminar* asks first.
- **Move dialog.** Under *Nueva etapa*: *Falta: Packing list. Puedes moverlo igual.* or
  *Faltan: A, B. Puedes moverlo igual.* Nothing when the target expects nothing or has all.
- **Upload dialog.** *Archivo* (`accept` from the config, the limit in the hint), *Etiqueta*
  (*Sin etiqueta* plus active labels, the first missing expected label chosen), *Etapa*.
  Without a label the hint says the file does not count for the checklist.
- **No storage.** The panel says *Para subir documentos falta configurar el almacenamiento
  de archivos (BLOB_READ_WRITE_TOKEN).* The button is disabled.

## Permissions

| Action | Owner, admin | Member |
| --- | --- | --- |
| See labels, checklists, files | Yes | Yes |
| Download a file | Yes | Yes |
| Create, rename, archive, restore a label | Yes | No |
| Set the expected labels of a stage | Yes | No |
| Upload, delete a file | Yes | No |

`canManageInventory(role)` guards every write in the service. The screens disable the same
controls with `canManage`.

## Testing

- Pure, unit tests first (`packages/db/test/import-document.spec.ts`): the checklist across
  files, the type from name and browser type, the file rule, the safe name, the pathname and
  its prefix check.
- App helpers (`apps/app/test/import-documents.spec.ts`): stage checklists, the move
  warning text, the suggested label, the size label.
- Integration, every procedure through `expectOutput`:
  - labels: create, order, case-insensitive duplicate, two creates at once, rename,
    archive and restore, boundary, member refused;
  - expected labels: order, replace, archived and unknown refused, archived hidden and kept,
    boundary, duplicate copies, member refused;
  - files: token path and expiry, type and size refused before a token, stored size wins,
    foreign path refused, missing blob, oversize blob removed, archived label refused and
    blob removed, closed shipment allowed, two attaches at once keep one row, delete with a
    failed blob removal, two deletes at once, signed link, no storage, member refused;
  - order detail: files of every event, checklist without archived labels, archived label
    on a file, `documentsEnabled`.
- The Blob calls go through one object, `documentBlob` (`@crm/db/import-document-blob`). The
  specs replace its methods with `spyOn`. No spec reaches Vercel.
- The plan ends with a leftover check on `TEST_DATABASE_URL` and a browser checklist.

## Out of scope

- DHL costs as numbers and payments with the USD equivalent (plan C).
- The bank decision step with rejections (the rest of plan A2).
- `Product.unitsPerShipment`.
- Files on stock movements (Phase 4).
- Antivirus scanning.
- OCR or reading an invoice.
- A preview inside the app. The browser tab is the preview.
- Changing the label of a saved file. Delete it and upload it again.
- Blobs left by an attach that never ran (closed tab, network loss after `put`).

## Open items

1. **Which Blob store does `BLOB_READ_WRITE_TOKEN` name, and is it private?** The token
   today mirrors logos and photos, which must be public. `docs/crm-plan.md` §14 records a
   store `crm-attachments` with private access, not yet attached. If the token names a
   public store, a private upload fails. The answer decides one of: set
   `IMPORT_DOCUMENT.access` to `"public"` (and accept permanent URLs), or point the token
   at a store that accepts private blobs.
2. **The 20 MB limit.** A scanned bank presentation can be larger. The owner confirms or
   gives another number. It is one constant.
