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

Products are a module of their own (Phase 2). Nothing below depends on them.

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

Open in step 3:

- `deals.list` and `deals.byId` return the source. The deals table has an *Origen*
  column and facet, and the deal sheet shows it.
- The stage labels are Spanish. The rest of the deals UI is still English.

## Language

The UI is English today. New strings for Surco Preciso are Spanish, neutral.
Translating the existing UI is a separate step. Until then the UI mixes both.
