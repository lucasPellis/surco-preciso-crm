# Plan — Surco Preciso flow

Surco Preciso sells agricultural technology in Argentina, Paraguay and Brazil.
This plan adapts the CRM to that flow, one step at a time. Each step ships on its
own and leaves the CRM working.

Branch: `feat/surco-preciso-flow`, cut from `main`.

## Flow

1. Lead capture — manual at first. Web, SEO, Ads and WhatsApp hooks come later.
2. **Contact and qualification — this step.**
3. Commercial pipeline — new stages and currencies.
4. Order and invoice.
5. Import and logistics.
6. Delivery and after-sales.
7. Analytics across all steps.

Products, quotes and image proposals are a module of their own (Phase 2). Step 3b does not
depend on them. *Cotizado* gets a real entry rule, a sent quote, when they arrive.

## Step 2 — Contact and qualification

### Rules

- A contact always has a company. A deal needs a company (`Deal.companyId` is
  required), so a lead with no company cannot reach step 3.
- A contact has no duplicate phone. A contact has no duplicate email.
- A contact has a lead source. The rep chooses it from a list that an admin
  configures.

### Company resolution on contact create

`ContactsService.create` resolves the company in this order. The first match wins.

1. `input.companyId`, when the rep chose one.
2. Email domain. `CompanyDirectoryService.companyForEmail` already does this. It
   returns null for free-mail and machine domains.
3. Phone. A company with the same normalized phone.
4. None found: create a company with the person's full name. No domain. Enrichment
   status `SKIPPED`. The agent is not queued, because a person has nothing to research.

Every rule is an exact match on a normalized key. No rule scores or guesses, so
this respects *Intelligence never lives in the API* (`docs/api.md`). Rule 2 is
existing code. Rules 3 and 4 follow the same shape.

### Schema

| Change | Why |
| --- | --- |
| `LeadSource` model: `id`, `name`, `key`, `position`, `archivedAt` | A configurable list. A real table keeps a stable id for stats and for the future UTM hooks. |
| `Contact.leadSourceId`, nullable FK to `LeadSource` | The origin of the lead. Null reads as *Unknown*. |
| `LeadSource.icon`, text, nullable | A key from the icon catalog. Null draws the generic tag. |
| `Contact.originDetail`, text, nullable | Free text. A campaign name or who referred the lead. |
| `Contact.phone` stored normalized. Partial unique index where `archivedAt` is null | No duplicate phone. Same pattern as `contact_email_active_key`. |
| `Company.phone` stored normalized | Rule 3 needs both sides in one format. |

Not added:

- Location columns on `Contact`. `Company` already has `city`, `stateCode` and
  `countryCode`, and a contact now always has a company.
- A separate `whatsapp` column. `phone` is the identity. Add the column when a
  contact needs two numbers.
- A product interest field. It waits for the product module.
- `firstContactAt`. `createdAt` serves until a rep needs to backdate a lead.

`Contact.source` (`RecordSource`) stays. It says how the record entered the CRM.
`leadSource` says where the lead came from. The UI label for `leadSource` is
*Origen*.

Each `LeadSource` has an `icon`: a key from the fixed catalog `LEAD_SOURCE_ICONS`
in `@crm/db/lead-source` (WhatsApp, Facebook, Instagram, Google, YouTube, TikTok and
generic glyphs). `LeadSourceMark` in `packages/ui` draws it, with the brand colour
from `simple-icons`. An admin picks the icon from the list; there is no upload.

Seed these `LeadSource` rows in the migration: Web, SEO, Google Ads, WhatsApp
directo, Campaña de Facebook, Campaña de Instagram, Referido, Distribuidor, Feria o
evento, Llamada entrante. There is no *Desconocido* row. A
contact with a null `leadSourceId` is unknown, and the UI and the reports label it
*Desconocido*. Two ways to say *unknown* would split the statistics.

### Sub-steps

1. **Phone. Done.** `normalizePhone` and `isPlausiblePhone` live in `@crm/db/phone`,
   so the API and the agent share one rule. A phone keeps its leading `+` and its
   digits, and has 7 to 15 digits. Migration `20261114120000_contact_phone_unique`
   normalizes existing rows and stops with an error when two active contacts share a
   number. Partial unique index `contact_phone_active_key`. `ContactsService`
   checks the phone on `create` and `update`. `CompaniesService` normalizes
   `Company.phone` on import and `update`. The agent still writes `Company.phone`
   raw; sub-step 3 fixes that.
2. **Lead source. Done.** Migration `20261114130000_lead_source` creates the table,
   the two `Contact` columns and the seed rows. Module `apps/api/src/lead-sources`
   with the `leadSources` router: `list`, `create`, `rename`, `archive`, `restore`
   and `reorder`. A source is archived, never deleted. `key` is set once from the
   name and never changes, so hooks can rely on it. `canManageLeadSources` in
   `@crm/auth` lets an owner or an admin change the list. Every user can read it.
   `contacts.create` and `contacts.update` accept `leadSourceId` and
   `originDetail`, and refuse a source that is archived or missing. The contact
   list and detail outputs do not return them yet; sub-step 5 adds that.
3. **Company resolution. Done.** `CompanyDirectoryService.resolveForContact` runs
   the rules in order. A phone matches only when exactly one active company has the
   number; two companies with one number count as no match. Rules 3 and 4 run in one
   transaction. `ContactsService.create` and the tracker's form filing call it. The
   mailbox sync needs no change: it creates a contact only under a work-domain
   company. The agent normalizes `Company.phone` in `brand-mapping.ts`. Tests in
   `apps/api/test/contact-intake.integration.spec.ts`. They need a database.
4. **Settings UI. Done, not yet seen in a browser.** Settings → Orígenes at
   `/settings/lead-sources`: list, add, rename, reorder with up and down buttons,
   archive and restore. A user without `canManage` sees the list with every control
   disabled. The page copies `currencies/page.tsx`. `useCrmCache().leadSources()`
   invalidates the list. The nav and the quick switcher have the new entry. The
   strings are Spanish, neutral.
5. **Contact UI. Done, not yet seen in a browser.** `contacts.list` and
   `contacts.byId` return `leadSource {id, name, icon}` and `originDetail`. The list
   has a `leadSource` filter, a facet with counts, and a sort. The value `none` means
   unknown. The table has an *Origen* column with `LeadSourceMark` and an *Origen*
   facet. The create sheet has Teléfono, Origen (active sources only) and Detalle del
   origen. The contact sheet edits Origen and Detalle del origen. Test in
   `apps/api/test/contact-intake.integration.spec.ts`.
6. **Docs. Done for `docs/api.md`.** Update `docs/crm-plan.md` §15 when step 4 starts.

### Out of scope for step 2

- UTM and campaign hooks. `LeadSource.key` is the join point for them.
- Source statistics. They need deals (step 3). Step 3 copies `leadSourceId` onto the
  deal at creation, so a later edit of the contact does not rewrite history.
- Product interest.
- WhatsApp inbound.

## Step 3 — Commercial pipeline

Done in code, not yet seen in a browser. The stages live on `Deal`.

| Stage | Value | Old value it replaces |
| --- | --- | --- |
| Nuevo | `NEW` | `DEMO_BOOKED` |
| Contactado | `CONTACTED` | none |
| Calificado | `QUALIFIED` | `QUALIFIED_TO_BUY` |
| Cotizado | `QUOTED` | `CONTRACT_SENT` |
| Negociando | `NEGOTIATING` | `DECISION_MAKER_BOUGHT_IN` |
| Ganado | `WON` | `CLOSED_WON` |
| Perdido | `LOST` | `CLOSED_LOST` and `UNQUALIFIED_TO_BUY` |

- Migration `20261114140000_deal_stages` renames the enum values. It also rewrites
  the old names inside the JSON columns that can hold a stage: `activity.meta`,
  `savedView.filters`, agent tasks, events, audit rows and manifests.
- `LOST` is the only losing stage. It asks for a reason.
- `ARS`, `PYG` and `BRL` join `CURRENCIES`. `PYG` has no minor unit.

Lead to deal:

- `contacts.create` opens a `Deal` in `NEW` in the same transaction. The deal is
  named after the person, joins the contact, and copies `leadSourceId` into
  `Deal.leadSourceId`. A later edit of the contact does not rewrite it.
- The owner of the contact and of the deal is the user who picks one, else the user who
  created the contact. With neither, no deal opens.
- A lead with no human creator, such as a tracker form submission, goes to the default
  lead owner. An owner or admin sets it in Settings → Orígenes
  (`AppSetting.defaultLeadOwnerId`, `leadSources.setDefaultOwner`). The lead gets the
  `web` source and a deal in `NEW`. With no default owner, the contact is filed and no
  deal opens.

Pipeline screen:

- Route `/funnel`, nav entry *Funnel*. A board with one column per stage: the five
  open stages, then Ganado and Perdido. The closed columns show the last 30 days
  (`DEAL_BOARD` in `apps/api/src/deals/deals-config.ts`). A column shows 50 cards and
  its real count.
- `deals.board` returns the columns. The scope toggle is the overview's: *Yo* or
  *Todos*.
- Drag a card to another column to change its stage. The move is optimistic and rolls
  back on error. A drop on Perdido opens the loss reason dialog. The grip button is the
  keyboard handle, and each card also has the stage menu.
- *Nuevo lead* is the only door that creates a contact, in Contactos and in Funnel
  (`create-lead-sheet.tsx`). It creates the contact, the company if missing, and the
  deal in `NEW`. The short form asks for phone, name and source. *Más datos* holds
  last name, email, title, company, owner and source detail. A lead needs a phone or
  an email (`contactCreateInput`). The source is optional.
- The same phone or email twice returns a `CONFLICT`. The form then calls
  `contacts.findDuplicate` and offers *Abrir lead*, which opens the open deal, else the
  contact. `contacts.create` returns `dealId`, and the toast has *Ver oportunidad*.
  *Guardar y agregar otro* keeps the sheet open.
- A new lead gets a task, *Contactar al lead*, due today. It belongs to the deal owner,
  so it shows in their tasks. `openLeadDeal` creates the deal, the contact link and the
  task in one transaction, for both `contacts.create` and the tracker. The text and the
  due day are in `NEW_LEAD`.
- A card with no activity for 3 days or more (`DEAL_BOARD.idleAfterDays`) shows *Sin
  actividad hace N días*. The API computes it from the last activity, else from the day
  the deal entered its stage. Closed columns never flag.
- `packages/ui/src/components/pipeline-board.tsx` holds the generic board. The deal
  cards live in `funnel-view.tsx`.

Open in step 3:

- `deals.list` and `deals.byId` return the source. The deals table has an *Origen*
  column and facet. A rep edits the source in the deal sheet. An archived source cannot
  be chosen.
- The stage labels are Spanish. The rest of the deals UI is still English.

## Step 3b — Editable stages and qualification

Design agreed. No code yet. Each iteration ships on its own and leaves the CRM working.

Surco Preciso defines its own sales process. An engineer cannot choose the stages. So the
stages become data that an owner edits. The model follows the market (HubSpot, Pipedrive,
Salesforce, Close, Zoho): the name is free and the type is fixed.

### Stage rules

- A stage is a row in `PipelineStage`, not a value of the `DealStage` enum. The name is
  editable. The kind is not.
- `kind` is `OPEN`, `WON`, `LOST` or `PAUSED`. Code reads `kind`. Code never compares a name.
- There is one entry stage (*Nuevo*), one `WON` stage and one `LOST` stage. An owner or
  admin can rename them. Nobody can archive them, change their kind or move them out of
  place.
- Every other stage is editable: add, rename, reorder and archive. *Contactado*,
  *Calificado*, *Cotizado* and *Negociando* are seeded as `OPEN`. *Sin respuesta* is seeded
  as `PAUSED`.
- A stage is archived, never deleted. Its `key` never changes. The seven current enum
  values become the `key` of the seven seeded rows, so the JSON columns stay valid. A new
  stage takes its `key` from its name, once.
- Archive is refused while an active deal sits in the stage. An archived stage cannot be
  chosen for a move. A deal that already has it keeps it.
- `idleAfterHours` is a column of the stage. `null` means the stage never flags. It replaces
  `DEAL_BOARD.idleAfterDays`. Seed: *Nuevo* 24, every other `OPEN` stage 72, every other
  kind `null`.
- `PAUSED` leaves the active funnel. It is not a loss. It raises no idle flag and it does
  not count in the win rate. The retargeting list is the list filtered by that stage.
- A paused deal moves to *Perdido* on its own after one week, with the reason *Sin respuesta*.
  The number of days is a column of the stage, `autoLoseAfterDays`. An owner or admin edits
  it in Settings → Etapas. A cron makes the move, with the same pattern as the archive prune.
  The move is a fixed time rule, not a judgement about a person, so it respects *Intelligence
  never lives in the API*.

### First contact

`Deal.firstContactedAt` is set once. It records the first move from the entry stage to a
stage of kind `OPEN` or `PAUSED`. A move to `LOST` does not set it, because a wrong number
is not a contact. So *Nuevo* means *never contacted*.

### Qualification

The sellers are not sales engineers. The UI shows plain questions and never the word BANT.
The questions are custom fields with `entity = DEAL` in the existing `FieldDefinition`
model. An owner edits them in the fields screen. Seed:

| Question | Type | Covers |
| --- | --- | --- |
| ¿Qué necesita? | `TEXT` | Need |
| ¿Cómo piensa pagarlo? | `SELECT`: Contado, Financiado, No sabe | Budget |
| ¿Habla con quien decide? | `SELECT`: Sí, No, No sé | Authority |
| ¿Para cuándo lo necesita? | `DATE` | Timeline |

- Seed these fields with `agentFilled = false`. The default is `true`, and the agent could
  overwrite the seller's answers.
- A move to *Calificado* with unanswered questions shows a notice that lists them. The move
  still happens. The gate is soft. The card shows how many questions have an answer.
- Financing is offered in *Negociando*, before the win. One payment route is a financing product in Argentina
  that links producers with the team and pays Surco in cash. So financing is a field of the
  deal: *Estado de la financiación* (`SELECT`: Ofrecida, Solicitada, Aprobada, Rechazada). The card
  shows it from *Negociando*.

### Settings → Etapas

- Route `/settings/stages`, with the entry *Etapas* next to *Orígenes*. The page copies
  `lead-sources`. Owner and admin edit. Other users see the list with the controls disabled.
- The list reorders by drag and drop with `SortableList` from `packages/ui`. The fields
  screen already uses it. Only the intermediate stages are inside the list. *Nuevo* sits
  above it and *Ganado* and *Perdido* sit below it, each with a lock. `restrictToParentElement`
  keeps the intermediate stages between them. The order applies at once with `useOptimistic`,
  so the row does not jump back. The keyboard works through `sortableKeyboardCoordinates`.
- A row shows the name, the kind, the idle alert, the number of active deals and a menu with
  *Renombrar* and *Archivar*. A fixed stage can be renamed. It cannot be moved or archived.
- *Agregar etapa* asks for a name and a kind: *Abierta* or *En pausa*. The kind never
  changes. The new stage goes at the end of the intermediate stages.
- The idle alert is one field in hours with a live helper, for example *72 h = 3 días*. An
  empty field means the stage never flags. Closed stages have no field.
- Archive with deals: a dialog asks *¿A qué etapa movemos las N oportunidades?* The target is
  an `OPEN` or `PAUSED` stage, because *Perdido* needs a reason for each deal. The move and
  the archive run in one transaction. The move calls the same service code as a single stage
  move, so the activity and the agent events stay consistent. *Nuevo* is never archived, so
  this move never leaves the entry stage and never sets `firstContactedAt`.
- Each stage stores its tone. The board and the charts read it. Today the tone comes from
  the position, so a new stage in the middle would change the colours of the others.
- Archived stages are in a collapsed section with *Restaurar*.
- The hidden label of `SortableItem` changes from *Reorder* to *Reordenar*. The shared
  component must have no English label.

### Iterations

1. `PipelineStage` table, kinds, `idleAfterHours` and `Deal.firstContactedAt`. Seed the
   current stages and *Sin respuesta*. Code reads `kind`. There is no edit screen.
2. Settings → Etapas, as described above.
3. Pause timeout: `autoLoseAfterDays` on the stage, the Settings → Etapas field, and the
   cron that moves expired paused deals to *Perdido*.
4. Qualification fields, the soft gate, the card count, and loss reasons as a list.
5. Step 4 below.

## Step 4 — Order (Pedido)

The funnel ends at *Ganado*. After it, the work is not a sequence. A customer can be
installed before paying. A column order cannot say that. So an order is a record with
independent tracks.

- *Ganado* means the customer accepted. The sale is committed. Payment is a track of the
  order, not a stage. The win rate counts committed sales. Cash is read in *Pedidos*.
- An order is created when a deal reaches *Ganado*.
- Each track has its own status:

  | Track | Statuses |
  | --- | --- |
  | Pago | Pendiente, Parcial, Pagado |
  | Instalación | Sin fecha, Agendada (with a date), Instalada |
  | Posventa | To define with the team |
  | Importación | To define with the team (step 5) |

- Financing is not a track. It lives on the deal (see Qualification).
- The screen is *Pedidos*: a full screen with its own entry in the side menu. It is a table
  with one status chip per track. Two saved views: *Instalados sin pagar* and *Pagados sin
  fecha de instalación*.

## Open decisions

1. Which statuses do *Posventa* and *Importación* have? The team postponed this until the
   *Pedidos* step.
2. Who may edit the questions? Check the permission of the fields screen first.
3. Can the deal sheet group the questions under one *Calificación* heading? Check
   `FieldDefinition`: it has no group today.
4. A deal can still point to an archived stage, for example a deal that is restored. The
   board has no column for it and the dashboard rows do not add up to the total. Show an
   *Archivadas* column, or move the deal to the entry stage when it is restored? Decide in
   iteration 2.

## Language

The UI is English today. Every new string and every screen we touch is Spanish,
neutral, with no voseo. There is no i18n library: the strings live in the code.

Translate a whole screen when you touch it, never a single string. A screen is
translated when no English label, button, placeholder, toast or empty state is left.
The navigation and the screens nobody touched stay English until their turn.

Glossary. Use these words and no others:

| English | Spanish |
| --- | --- |
| Deal | Oportunidad |
| Contact | Contacto |
| Company | Empresa |
| Owner | Responsable |
| Stage | Etapa |
| Lead source | Origen |
| Pipeline | Funnel |
| Amount | Monto |
| Archive | Archivar |
| Settings | Configuración |
| Overview | Resumen |
| Tasks | Tareas |
| Workspace | Espacio de trabajo |
| Members | Miembros |
| Connections | Conexiones |
| Currencies | Monedas |
| API Keys | Claves de API |
| Tracking & Analytics | Seguimiento y analítica |
| Phone | Teléfono |
| Last activity | Última actividad |
| Persona | Perfil |
| Seniority | Jerarquía |
| Order | Pedido |
| Paused | En pausa |
| Qualification | Calificación |

Add a row here when a screen needs a new term.
