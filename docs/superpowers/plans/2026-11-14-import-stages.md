# Import Stages (Phase 2a-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The whole Phase 2a data model in one migration. An editable list of import stages with a screen at `/settings/import-stages`: rename, recolour, add, reorder by drag and drop, archive with move of the shipments in it, restore. The one function that moves a shipment between stages with a date, `moveShipmentInTx`. Owner and admin write. Members read.

**Architecture:** Six new Prisma tables (`import_stage`, `purchase_order`, `purchase_order_line`, `shipment`, `shipment_line`, `shipment_stage_event`) in one hand-written migration that also seeds the stages. One Nest module `imports` with one router `importStages`, a service, and Zod contracts. The stage rules copy `PipelineStagesService`, but read `ImportStageKind` and never import a deal helper. `moveShipmentInTx` is a plain exported function that takes a transaction. The stage archive calls it now. Plan 2a-2 calls it from the order screen, and Phase 4 adds the stock entry inside it. The screen copies `settings/stages`.

**Tech Stack:** Prisma (hand-written SQL), NestJS with `nestjs-trpc`, Zod, Next.js, TanStack Query, `@crm/ui` (`SettingsCard`, `SortableList`, `StatusIndicator`, `Dialog`), bun test.

Spec: `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`.

**This is Plan 2a-1 of 2.** Phase 2a does not fit one plan. Plan 2a-2 (`2026-11-14-import-orders.md`, not written yet) builds, on top of this plan:
- the orders service and router (create, edit, archive, restore, lines with the `unitCostCents` money rule, the open-deal picker query);
- shipments with `ShipmentLine` and the quantity rule under a row lock, with a two-writers test modelled on `apps/api/test/paused-sweep.integration.spec.ts`;
- shipment creation that writes the first event in the entry stage;
- the move procedure that calls `moveShipmentInTx`, lead times computed on read, received over ordered;
- the *Importaciones* screen (`/imports`, `DataTable` plus side sheet), its nav entry, quick-switcher entry and `cache.imports`;
- `docs/imports.md` and its row in the `AGENTS.md` index.

Plan 2a-2 adds no migration. Every table it needs is created here.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server error messages. No voseo: "Escribe", never "Escribí".
- UI comes only from `packages/ui`. No literal colours, radii or shadows at the call site. No `className` that restyles a shared component.
- Do not run `migrate dev`, `reset` or `db push`. The owner applies migrations.
- Do not read `.env`. Use `--env-file`.
- Do not build.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`: it exited 0 twice without changing a file.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. If `biome check` reports only import order, run `bunx biome check --write <paths>`. Never run the repo-wide `bun run format`. Quote every path that contains `[slug]` or `(app)`, or zsh expands it as a glob.
- Commit only after the owner says so. Conventional commits. No `Co-Authored-By`.
- **The git index already holds files that another session staged.** A bare `git commit` ships them. Every commit step in this plan is `git add <paths>` and then `git commit -m "<message>" -- <paths>`, which commits only those paths. Paths that contain `[slug]` use the `':(literal)…'` pathspec.
- Another session edits `apps/app`, `apps/api/src/enrichment`, `apps/agent` and docs. Before a commit that touches a shared file (`schema.prisma`, `app.module.ts`, `generated/server.ts`, `cache.ts`, `workspace-nav.tsx`, `quick-switcher.tsx`), run `git diff HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.

## Decisions recorded in this plan

Each line is one decision that the brief does not make. The owner can veto any of them.

1. **Split into 2a-1 and 2a-2.** One plan for all of Phase 2a is more than 3000 lines.
2. **The whole Phase 2a data model is in this plan, in one migration `20261114220000_imports`.** Archive-with-move needs real `shipment` rows, and 2a-2 then needs no migration.
3. **`ShipmentStageEvent.stageKey` references `ImportStage.key`**, not `stageId` as the spec says. It is the same shape as `Shipment.stageKey` and `Deal.stage`. Keys never change.
4. **A stage date is a calendar day.** The wire carries `"YYYY-MM-DD"`. The database stores that day at `00:00 UTC`. This is the convention that task due dates already use (`apps/api/src/activities/task-due-date.ts`).
5. **"Today" is the UTC day** (`TASKS.day.timeZone` is `"UTC"`). The owner confirmed UTC. The date of a move cannot be after today and cannot be before the previous event. The same day as the previous event is accepted.
6. **The move reuses `taskDueDay`, `taskDayBoundaries` and `serializeTaskDueDay`** from `activities/task-due-date.ts` instead of new day helpers. The names say "task". The behaviour is the one this plan needs.
7. **Two events on the same day are ordered by `createdAt`.** `Shipment.stageKey` is always the target of the latest write, so the current stage never depends on that order.
8. **The generic key helpers are reused.** `stageKey`, `uniqueStageKey` and `sameKeySet` from `@crm/db/pipeline-stage` have no deal rule in them. `isFixedStage`, `INTERMEDIATE_KINDS`, idle and auto-lose rules are not imported.
9. **Import stages reuse the `PipelineStageTone` enum** and the app's `STAGE_TONE_STATUS` and `STAGE_TONE_LABELS`. No new enum, no new mapping.
10. **The tone of every import stage can change, fixed stages included.** Deals forbid it on closed stages. Import stages have no reason to.
11. **The archive target must be an active `IN_PROGRESS` stage** (the entry stage counts). A settings action never moves a shipment into *Recibido* or *Cancelado*, because Phase 4 attaches stock to *Recibido*.
12. **The date of the archive moves is chosen in the archive dialog and defaults to today (UTC). The archiving user is the actor.** The input field is `occurredAt`, a `"YYYY-MM-DD"` day. When it is missing, the service uses today's UTC day, as a move does. Each shipment follows the rules of a normal move: not after today, not before its latest event. One refused shipment refuses the whole archive and rolls it back. A stage with no shipments archives without a dialog and without a date. One event per shipment. Shipments of archived orders move too, as archived deals do.
13. **Moving a shipment to the stage it is already in is an error** (`BadRequest`). Deals return "unchanged" silently. A user who picks a date for a move expects a move.
14. **`moveShipmentInTx` takes `now` as a third argument** (default `new Date()`) so that tests fix "today". It returns the `from` and `to` stage with their `kind`. Phase 4 branches on `to.kind` inside the same function.
15. **`PurchaseOrder.supplierName` and `orderedAt` are required. `PurchaseOrder` has `archivedAt` now.** The brief makes order archiving the delete.
16. **Foreign keys:** a line keeps its product (`RESTRICT`). Deleting an order cascades to lines, shipments, shipment lines and events. A shipment line refuses the delete of its order line (`NO ACTION`, checked at the end of the statement, so the order cascade still works).
17. **`CHECK ("quantity" > 0)`** on `purchase_order_line` and `shipment_line`. The repo already has a `CHECK` in `20260804210000_agent_builder_artifacts`.
18. **No database constraint for "exactly one *Recibido* and one *Cancelado*".** The service creates only `IN_PROGRESS` stages and never archives a fixed stage. A partial unique index on `kind` cannot be written in the Prisma schema without drift.
19. **No `apps/api/src/imports/imports-config.ts` and no `apps/app/lib/imports-config.ts` in this plan.** No value in 2a-1 is tunable. The stage limits live in `@crm/db/import-stage`, where `PIPELINE_STAGE` lives. Plan 2a-2 creates the config modules when it has a value for them.
20. **The *Importaciones* nav entry and its quick-switcher page wait for 2a-2.** A nav entry to a page that does not exist is a broken link. This plan adds only the settings entries.
21. **`docs/imports.md` and the `AGENTS.md` row are written in 2a-2**, when the module is complete.

## Open questions for the owner

There are no open questions. The owner answered both:

- "Today" stays the UTC day (Decision 5).
- The archive dialog lets the user choose the date of the moves (Decision 12).

## File structure

| File | Responsibility |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `ImportStageKind`, `ImportStage`, `PurchaseOrder`, `PurchaseOrderLine`, `Shipment`, `ShipmentLine`, `ShipmentStageEvent`, back-relations on `Product`, `Deal`, `User` |
| `packages/db/prisma/migrations/20261114220000_imports/migration.sql` | Creates the tables, seeds six stages |
| `packages/db/src/import-stage.ts` | `IMPORT_STAGE` limits, `isFixedImportStage`, `isClosedImportKind` |
| `packages/db/test/import-stage.spec.ts` | Unit test of the two functions |
| `packages/db/package.json` | `./import-stage` export |
| `apps/api/src/imports/shipment-moves.ts` | `moveShipmentInTx` |
| `apps/api/test/shipment-moves.integration.spec.ts` | Every move rule |
| `apps/api/src/imports/import-stages.contracts.ts` | Zod inputs and outputs |
| `apps/api/src/imports/import-stages.service.ts` | Stage rules and permission |
| `apps/api/test/import-stages.integration.spec.ts` | Service and contract tests |
| `apps/api/src/imports/import-stages.router.ts` | tRPC procedures |
| `apps/api/src/imports/imports.module.ts` | Nest module |
| `apps/api/src/app.module.ts` | Registers the module |
| `apps/api/src/generated/server.ts` | Regenerated, committed |
| `apps/app/lib/import-stage-settings.ts` | Split, reorder and archive-target helpers, `utcDay` |
| `apps/app/test/import-stage-settings.spec.ts` | Unit test of the helpers |
| `apps/app/lib/trpc/cache.ts` | `importStages` invalidator |
| `apps/app/app/(app)/[slug]/settings/import-stages/page.tsx` | Server page |
| `apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx` | The settings screen |
| `apps/app/components/workspace-nav.tsx` | Settings nav entry |
| `apps/app/components/crm/quick-switcher.tsx` | Command palette entry |

---

### Task 1: Prisma models and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (the `User`, `Product` and `Deal` models; new models after `Product`)
- Create: `packages/db/prisma/migrations/20261114220000_imports/migration.sql`

- [ ] **Step 1: Check the schema is clean**

Run: `git diff HEAD -- packages/db/prisma/schema.prisma`
Expected: no output. If there is output, stop and ask the owner.

- [ ] **Step 2: Back-relation on `User`**

In `packages/db/prisma/schema.prisma`, replace:

```prisma
  ssoproviders SsoProvider[]

  apiKeys Apikey[]
```

with:

```prisma
  ssoproviders SsoProvider[]

  apiKeys Apikey[]

  shipmentStageEvents ShipmentStageEvent[] @relation("ShipmentStageEventActor")
```

- [ ] **Step 3: Back-relation on `Deal`**

Replace:

```prisma
  contacts    DealContact[]
  activities  Activity[]
  fieldValues FieldValue[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
```

with:

```prisma
  contacts    DealContact[]
  activities  Activity[]
  fieldValues FieldValue[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  purchaseOrderLines PurchaseOrderLine[]
```

- [ ] **Step 4: Back-relation on `Product` and the new models**

Replace:

```prisma
  updatedAt        DateTime  @updatedAt

  @@index([archivedAt])
  @@map("product")
}
```

with:

```prisma
  updatedAt        DateTime  @updatedAt

  orderLines PurchaseOrderLine[]

  @@index([archivedAt])
  @@map("product")
}

enum ImportStageKind {
  IN_PROGRESS
  RECEIVED
  CANCELLED
}

model ImportStage {
  id         String            @id @default(cuid())
  key        String            @unique
  name       String
  kind       ImportStageKind
  tone       PipelineStageTone @default(NEUTRAL)
  position   Int               @default(0)
  isEntry    Boolean           @default(false)
  archivedAt DateTime?

  shipments Shipment[]
  events    ShipmentStageEvent[]
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  @@unique([isEntry], map: "import_stage_entry_key", where: { isEntry: true, archivedAt: null })
  @@index([archivedAt])
  @@map("import_stage")
}

model PurchaseOrder {
  id           String    @id @default(cuid())
  number       String    @unique
  supplierName String
  orderedAt    DateTime
  notes        String?
  archivedAt   DateTime?

  lines     PurchaseOrderLine[]
  shipments Shipment[]
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  @@index([archivedAt])
  @@map("purchase_order")
}

model PurchaseOrderLine {
  id          String        @id @default(cuid())
  orderId     String
  order       PurchaseOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId   String
  product     Product       @relation(fields: [productId], references: [id], onDelete: Restrict)
  quantity    Int
  unitCostUsd Decimal       @db.Decimal(14, 2)
  dealId      String?
  deal        Deal?         @relation(fields: [dealId], references: [id], onDelete: SetNull)

  shipmentLines ShipmentLine[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([orderId])
  @@index([productId])
  @@index([dealId])
  @@map("purchase_order_line")
}

model Shipment {
  id             String        @id @default(cuid())
  orderId        String
  order          PurchaseOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  reference      String?
  trackingNumber String?
  stageKey       String
  stage          ImportStage   @relation(fields: [stageKey], references: [key])
  stageChangedAt DateTime

  lines     ShipmentLine[]
  events    ShipmentStageEvent[]
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  @@index([orderId])
  @@index([stageKey])
  @@map("shipment")
}

model ShipmentLine {
  id          String            @id @default(cuid())
  shipmentId  String
  shipment    Shipment          @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  orderLineId String
  orderLine   PurchaseOrderLine @relation(fields: [orderLineId], references: [id], onDelete: NoAction)
  quantity    Int
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@unique([shipmentId, orderLineId])
  @@index([orderLineId])
  @@map("shipment_line")
}

model ShipmentStageEvent {
  id         String      @id @default(cuid())
  shipmentId String
  shipment   Shipment    @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  stageKey   String
  stage      ImportStage @relation(fields: [stageKey], references: [key])
  occurredAt DateTime
  actorId    String?
  actor      User?       @relation("ShipmentStageEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  createdAt  DateTime    @default(now())

  @@index([shipmentId, occurredAt])
  @@index([stageKey])
  @@map("shipment_stage_event")
}
```

- [ ] **Step 5: Write the migration by hand**

Create `packages/db/prisma/migrations/20261114220000_imports/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ImportStageKind" AS ENUM ('IN_PROGRESS', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "import_stage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ImportStageKind" NOT NULL,
    "tone" "PipelineStageTone" NOT NULL DEFAULT 'NEUTRAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostUsd" DECIMAL(14,2) NOT NULL,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_line_quantity_positive" CHECK ("quantity" > 0)
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reference" TEXT,
    "trackingNumber" TEXT,
    "stageKey" TEXT NOT NULL,
    "stageChangedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_line" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipment_line_quantity_positive" CHECK ("quantity" > 0)
);

-- CreateTable
CREATE TABLE "shipment_stage_event" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_stage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_stage_key_key" ON "import_stage"("key");

-- CreateIndex
CREATE INDEX "import_stage_archivedAt_idx" ON "import_stage"("archivedAt");

CREATE UNIQUE INDEX "import_stage_entry_key" ON "import_stage"("isEntry") WHERE ("isEntry" = true AND "archivedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_number_key" ON "purchase_order"("number");

-- CreateIndex
CREATE INDEX "purchase_order_archivedAt_idx" ON "purchase_order"("archivedAt");

-- CreateIndex
CREATE INDEX "purchase_order_line_orderId_idx" ON "purchase_order_line"("orderId");

-- CreateIndex
CREATE INDEX "purchase_order_line_productId_idx" ON "purchase_order_line"("productId");

-- CreateIndex
CREATE INDEX "purchase_order_line_dealId_idx" ON "purchase_order_line"("dealId");

-- CreateIndex
CREATE INDEX "shipment_orderId_idx" ON "shipment"("orderId");

-- CreateIndex
CREATE INDEX "shipment_stageKey_idx" ON "shipment"("stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_line_shipmentId_orderLineId_key" ON "shipment_line"("shipmentId", "orderLineId");

-- CreateIndex
CREATE INDEX "shipment_line_orderLineId_idx" ON "shipment_line"("orderLineId");

-- CreateIndex
CREATE INDEX "shipment_stage_event_shipmentId_occurredAt_idx" ON "shipment_stage_event"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "shipment_stage_event_stageKey_idx" ON "shipment_stage_event"("stageKey");

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_stageKey_fkey" FOREIGN KEY ("stageKey") REFERENCES "import_stage"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_line" ADD CONSTRAINT "shipment_line_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_line" ADD CONSTRAINT "shipment_line_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "purchase_order_line"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stage_event" ADD CONSTRAINT "shipment_stage_event_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stage_event" ADD CONSTRAINT "shipment_stage_event_stageKey_fkey" FOREIGN KEY ("stageKey") REFERENCES "import_stage"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stage_event" ADD CONSTRAINT "shipment_stage_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "import_stage" ("id", "key", "name", "kind", "tone", "position", "isEntry", "updatedAt") VALUES
  ('import_stage_ordered', 'ORDERED', 'Pedido', 'IN_PROGRESS', 'NEUTRAL', 0, true, CURRENT_TIMESTAMP),
  ('import_stage_shipped', 'SHIPPED', 'Embarcado', 'IN_PROGRESS', 'INFO', 1, false, CURRENT_TIMESTAMP),
  ('import_stage_tracking', 'TRACKING', 'Guía', 'IN_PROGRESS', 'INFO', 2, false, CURRENT_TIMESTAMP),
  ('import_stage_customs', 'CUSTOMS', 'Aduana', 'IN_PROGRESS', 'WARNING', 3, false, CURRENT_TIMESTAMP),
  ('import_stage_received', 'RECEIVED', 'Recibido', 'RECEIVED', 'SUCCESS', 1000, false, CURRENT_TIMESTAMP),
  ('import_stage_cancelled', 'CANCELLED', 'Cancelado', 'CANCELLED', 'ERROR', 1001, false, CURRENT_TIMESTAMP);
```

- [ ] **Step 6: Generate the client (no database needed)**

Run: `bun run db:generate`
Expected: Prisma Client generated. `packages/db/src/generated/prisma/enums.ts` now exports `ImportStageKind`.
Check: `rg -n 'ImportStageKind' packages/db/src/generated/prisma/enums.ts` prints at least one line.

- [ ] **Step 7: Stop and ask the owner to apply the migration**

Tell the owner to run both commands from the repo root:
1. `bun --env-file=.env run --filter=@crm/db db:deploy` applies the migration to the `crm` database.
2. `bun --env-file=.env run db:test` creates or updates the throwaway `crm_test` database.

Under `bun test`, `packages/db/src/client.ts` uses `TEST_DATABASE_URL` and never `DATABASE_URL`. Without command 2 every integration test in this plan fails with `relation "public.import_stage" does not exist`.
Wait for the owner to confirm.

- [ ] **Step 8: Commit (only with the owner's OK)**

```bash
git diff HEAD -- packages/db/prisma/schema.prisma
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261114220000_imports
git commit -m "feat: add the import stage, order and shipment tables" -- packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261114220000_imports
```

---

### Task 2: Import stage rules

**Files:**
- Create: `packages/db/src/import-stage.ts`
- Create: `packages/db/test/import-stage.spec.ts`
- Modify: `packages/db/package.json` (exports map)

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/import-stage.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { ImportStageKind } from "../src/generated/prisma/enums";
import {
	IMPORT_STAGE,
	isClosedImportKind,
	isFixedImportStage,
} from "../src/import-stage";

describe("fixed import stages", () => {
	it("treats the entry, received and cancelled stages as fixed", () => {
		expect(
			isFixedImportStage({ isEntry: true, kind: ImportStageKind.IN_PROGRESS }),
		).toBe(true);
		expect(
			isFixedImportStage({ isEntry: false, kind: ImportStageKind.RECEIVED }),
		).toBe(true);
		expect(
			isFixedImportStage({ isEntry: false, kind: ImportStageKind.CANCELLED }),
		).toBe(true);
	});

	it("treats every other in-progress stage as intermediate", () => {
		expect(
			isFixedImportStage({ isEntry: false, kind: ImportStageKind.IN_PROGRESS }),
		).toBe(false);
	});
});

describe("closed import kinds", () => {
	it("closes received and cancelled only", () => {
		expect(isClosedImportKind(ImportStageKind.IN_PROGRESS)).toBe(false);
		expect(isClosedImportKind(ImportStageKind.RECEIVED)).toBe(true);
		expect(isClosedImportKind(ImportStageKind.CANCELLED)).toBe(true);
	});
});

describe("IMPORT_STAGE", () => {
	it("keeps the intermediate positions below the fixed end", () => {
		expect(IMPORT_STAGE.firstIntermediatePosition).toBeLessThan(
			IMPORT_STAGE.fixedEndPosition,
		);
		expect(IMPORT_STAGE.nameMaxLength).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd packages/db && bun test test/import-stage.spec.ts`
Expected: FAIL with `Cannot find module '../src/import-stage'`.

- [ ] **Step 3: Write the module**

Create `packages/db/src/import-stage.ts`:

```ts
import { ImportStageKind, PipelineStageTone } from "./generated/prisma/enums";

export const IMPORT_STAGE = {
	nameMaxLength: 40,
	firstIntermediatePosition: 1,
	fixedEndPosition: 1000,
	defaultTone: PipelineStageTone.NEUTRAL,
} as const;

type ImportStageShape = { isEntry: boolean; kind: ImportStageKind };

export function isClosedImportKind(kind: ImportStageKind): boolean {
	return kind !== ImportStageKind.IN_PROGRESS;
}

export function isFixedImportStage(stage: ImportStageShape): boolean {
	return stage.isEntry || isClosedImportKind(stage.kind);
}
```

- [ ] **Step 4: Export it**

In `packages/db/package.json`, in the `exports` map, replace:

```json
		"./fx": "./src/fx.ts",
```

with:

```json
		"./fx": "./src/fx.ts",
		"./import-stage": "./src/import-stage.ts",
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd packages/db && bun test test/import-stage.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Format**

Run: `bunx biome format --write packages/db/src/import-stage.ts packages/db/test/import-stage.spec.ts packages/db/package.json && bunx biome check packages/db/src/import-stage.ts packages/db/test/import-stage.spec.ts packages/db/package.json`
Expected: no findings.

- [ ] **Step 7: Commit (only with the owner's OK)**

```bash
git add packages/db/src/import-stage.ts packages/db/test/import-stage.spec.ts packages/db/package.json
git commit -m "feat: add the import stage rules" -- packages/db/src/import-stage.ts packages/db/test/import-stage.spec.ts packages/db/package.json
```

---

### Task 3: Moving a shipment between stages

**Files:**
- Create: `apps/api/src/imports/shipment-moves.ts`
- Create: `apps/api/test/shipment-moves.integration.spec.ts`

The rules, in the order the function checks them:
1. Lock the shipment row `FOR UPDATE`. A missing shipment is `NotFound`.
2. The target is the current stage: `BadRequest`.
3. Take `FOR SHARE` on the target stage row, then read both stages and the latest event.
4. The current stage is `RECEIVED` or `CANCELLED`: `Conflict`.
5. The target is missing or archived: `BadRequest`.
6. The day is after today (UTC): `BadRequest`.
7. The day is before the latest event's day: `BadRequest`.
8. Write one `ShipmentStageEvent`. Set `Shipment.stageKey` and `stageChangedAt` to that event's `occurredAt`.

Phase 4 adds the stock entry for `to.kind === RECEIVED` between step 8 and the return, inside the same transaction.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/test/shipment-moves.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
import { taskDueDay } from "../src/activities/task-due-date";
import {
	moveShipmentInTx,
	type ShipmentMoveInput,
} from "../src/imports/shipment-moves";

const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
const actorId = `sm-actor-${suffix}`;
const prefix = `SM${suffix}`;
const NOW = new Date("2026-03-01T15:00:00.000Z");
const START_DAY = "2026-01-10";

const stageKeys = {
	first: `SM_FIRST_${suffix}`,
	second: `SM_SECOND_${suffix}`,
	archived: `SM_ARCHIVED_${suffix}`,
};

let orderId: string;
let entryKey: string;
let receivedKey: string;

function move(input: Omit<ShipmentMoveInput, "actorId">) {
	return db.$transaction((tx) =>
		moveShipmentInTx(tx, { ...input, actorId }, NOW),
	);
}

async function shipmentIn(stageKey: string): Promise<string> {
	const shipment = await db.shipment.create({
		data: {
			orderId,
			stageKey,
			stageChangedAt: taskDueDay(START_DAY),
			events: {
				create: { stageKey, occurredAt: taskDueDay(START_DAY), actorId },
			},
		},
		select: { id: true },
	});
	return shipment.id;
}

async function eventsOf(shipmentId: string) {
	return db.shipmentStageEvent.findMany({
		where: { shipmentId },
		orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
		select: { stageKey: true, occurredAt: true, actorId: true },
	});
}

async function stageOf(shipmentId: string) {
	return db.shipment.findUniqueOrThrow({
		where: { id: shipmentId },
		select: { stageKey: true, stageChangedAt: true },
	});
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: actorId,
			name: "Shipment Actor",
			email: `${actorId}@example.test`,
		},
	});
	const [entry, received] = await Promise.all([
		db.importStage.findFirstOrThrow({
			where: { isEntry: true, archivedAt: null },
			select: { key: true },
		}),
		db.importStage.findFirstOrThrow({
			where: { kind: ImportStageKind.RECEIVED, archivedAt: null },
			select: { key: true },
		}),
	]);
	entryKey = entry.key;
	receivedKey = received.key;
	await db.importStage.createMany({
		data: [
			{
				key: stageKeys.first,
				name: `Primera ${suffix}`,
				kind: ImportStageKind.IN_PROGRESS,
				position: 900,
			},
			{
				key: stageKeys.second,
				name: `Segunda ${suffix}`,
				kind: ImportStageKind.IN_PROGRESS,
				position: 901,
			},
			{
				key: stageKeys.archived,
				name: `Archivada ${suffix}`,
				kind: ImportStageKind.IN_PROGRESS,
				position: 902,
				archivedAt: new Date(),
			},
		],
	});
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-1`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(START_DAY),
		},
		select: { id: true },
	});
	orderId = order.id;
});

afterAll(async () => {
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await db.importStage.deleteMany({
		where: { key: { in: Object.values(stageKeys) } },
	});
	await db.user.deleteMany({ where: { id: actorId } });
});

describe("moving a shipment", () => {
	it("writes an event and moves the shipment on that day", async () => {
		const id = await shipmentIn(entryKey);

		const moved = await move({
			shipmentId: id,
			targetKey: stageKeys.first,
			occurredOn: "2026-02-01",
		});

		expect(moved.from.key).toBe(entryKey);
		expect(moved.to).toEqual({
			key: stageKeys.first,
			kind: ImportStageKind.IN_PROGRESS,
		});
		expect(moved.occurredAt).toEqual(taskDueDay("2026-02-01"));
		const shipment = await stageOf(id);
		expect(shipment.stageKey).toBe(stageKeys.first);
		expect(shipment.stageChangedAt).toEqual(taskDueDay("2026-02-01"));
		const events = await eventsOf(id);
		expect(events.map((event) => event.stageKey)).toEqual([
			entryKey,
			stageKeys.first,
		]);
		expect(events[1]?.actorId).toBe(actorId);
	});

	it("accepts the same day as the previous event and today", async () => {
		const id = await shipmentIn(entryKey);

		await move({
			shipmentId: id,
			targetKey: stageKeys.first,
			occurredOn: START_DAY,
		});
		await move({
			shipmentId: id,
			targetKey: stageKeys.second,
			occurredOn: "2026-03-01",
		});

		expect((await eventsOf(id)).length).toBe(3);
		expect((await stageOf(id)).stageKey).toBe(stageKeys.second);
	});

	it("refuses a day before the previous event and writes nothing", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-01-09",
			}),
		).rejects.toBeInstanceOf(BadRequestException);

		expect((await eventsOf(id)).length).toBe(1);
		expect((await stageOf(id)).stageKey).toBe(entryKey);
	});

	it("refuses a day after today", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-03-02",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses the stage the shipment is already in", async () => {
		const id = await shipmentIn(stageKeys.first);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived or missing target", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.archived,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			move({
				shipmentId: id,
				targetKey: `NO_SUCH_STAGE_${suffix}`,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses every move once the shipment is received", async () => {
		const id = await shipmentIn(entryKey);
		await move({
			shipmentId: id,
			targetKey: receivedKey,
			occurredOn: "2026-02-01",
		});

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-02-02",
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await stageOf(id)).stageKey).toBe(receivedKey);
	});

	it("reports a missing shipment as not found", async () => {
		await expect(
			move({
				shipmentId: `no-such-shipment-${suffix}`,
				targetKey: stageKeys.first,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts`
Expected: FAIL with `Cannot find module '../src/imports/shipment-moves'`.

- [ ] **Step 3: Write the function**

Create `apps/api/src/imports/shipment-moves.ts`:

```ts
import type { Prisma } from "@crm/db";
import type { ImportStageKind } from "@crm/db/enums";
import { isClosedImportKind } from "@crm/db/import-stage";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
	taskDueDay,
} from "../activities/task-due-date";

export type ShipmentMoveInput = {
	shipmentId: string;
	targetKey: string;
	occurredOn: string;
	actorId: string;
};

type StageRef = { key: string; kind: ImportStageKind };

export type ShipmentMoved = {
	shipmentId: string;
	from: StageRef;
	to: StageRef;
	occurredAt: Date;
};

export async function moveShipmentInTx(
	tx: Prisma.TransactionClient,
	input: ShipmentMoveInput,
	now: Date = new Date(),
): Promise<ShipmentMoved> {
	const [shipment] = await tx.$queryRaw<
		Array<{ id: string; stageKey: string }>
	>`
		SELECT id, "stageKey"
		FROM shipment
		WHERE id = ${input.shipmentId}
		FOR UPDATE
	`;
	if (!shipment) {
		throw new NotFoundException("No existe un envío con ese id.");
	}
	if (shipment.stageKey === input.targetKey) {
		throw new BadRequestException("El envío ya está en esa etapa.");
	}

	await tx.$queryRaw`
		SELECT 1 FROM import_stage WHERE "key" = ${input.targetKey} FOR SHARE
	`;
	const from = await tx.importStage.findUniqueOrThrow({
		where: { key: shipment.stageKey },
		select: { key: true, kind: true },
	});
	const to = await tx.importStage.findUnique({
		where: { key: input.targetKey },
		select: { key: true, kind: true, archivedAt: true },
	});
	const last = await tx.shipmentStageEvent.findFirst({
		where: { shipmentId: shipment.id },
		orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
		select: { occurredAt: true },
	});

	if (isClosedImportKind(from.kind)) {
		throw new ConflictException(
			"Un envío recibido o cancelado ya no cambia de etapa.",
		);
	}
	if (!to || to.archivedAt) {
		throw new BadRequestException("Esa etapa no está disponible.");
	}

	const occurredAt = taskDueDay(input.occurredOn);
	if (occurredAt >= taskDayBoundaries(now).startOfTomorrow) {
		throw new BadRequestException("La fecha no puede ser posterior a hoy.");
	}
	if (last && occurredAt < last.occurredAt) {
		throw new BadRequestException(
			`La fecha no puede ser anterior al ${serializeTaskDueDay(last.occurredAt)}, la del cambio anterior.`,
		);
	}

	await tx.shipmentStageEvent.create({
		data: {
			shipmentId: shipment.id,
			stageKey: to.key,
			occurredAt,
			actorId: input.actorId,
		},
	});
	await tx.shipment.update({
		where: { id: shipment.id },
		data: { stageKey: to.key, stageChangedAt: occurredAt },
	});

	return {
		shipmentId: shipment.id,
		from,
		to: { key: to.key, kind: to.kind },
		occurredAt,
	};
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts`
Expected: PASS, 8 tests. If it fails with `relation "public.import_stage" does not exist`, the owner has not run `db:test`. Stop and report it.

- [ ] **Step 5: Format**

Run: `bunx biome format --write apps/api/src/imports/shipment-moves.ts apps/api/test/shipment-moves.integration.spec.ts && bunx biome check apps/api/src/imports/shipment-moves.ts apps/api/test/shipment-moves.integration.spec.ts`
Expected: no findings.

- [ ] **Step 6: Commit (only with the owner's OK)**

```bash
git add apps/api/src/imports/shipment-moves.ts apps/api/test/shipment-moves.integration.spec.ts
git commit -m "feat: move a shipment between import stages with a date" -- apps/api/src/imports/shipment-moves.ts apps/api/test/shipment-moves.integration.spec.ts
```

---

### Task 4: Import stage contracts and service

**Files:**
- Create: `apps/api/src/imports/import-stages.contracts.ts`
- Create: `apps/api/src/imports/import-stages.service.ts`
- Create: `apps/api/test/import-stages.integration.spec.ts`

- [ ] **Step 1: Write the contracts**

Create `apps/api/src/imports/import-stages.contracts.ts`:

```ts
import { ImportStageKind, PipelineStageTone } from "@crm/db/enums";
import { IMPORT_STAGE } from "@crm/db/import-stage";
import { z } from "zod";
import { taskDueDayInput } from "../activities/task-due-date";

const stageName = z
	.string()
	.trim()
	.min(1, "La etapa necesita un nombre.")
	.max(
		IMPORT_STAGE.nameMaxLength,
		`Máximo ${IMPORT_STAGE.nameMaxLength} caracteres.`,
	);

const stageKeyInput = z.string().trim().min(1);

export const importStageCreateInput = z.object({
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
});

export const importStageUpdateInput = z.object({
	key: stageKeyInput,
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
});

export const importStageReorderInput = z.object({
	keys: z.array(stageKeyInput),
});

export const importStageArchiveInput = z.object({
	key: stageKeyInput,
	targetKey: stageKeyInput.optional(),
	occurredAt: taskDueDayInput.optional(),
});

export const importStageKeyInput = z.object({ key: stageKeyInput });

export const importStageRowOutput = z.object({
	key: z.string(),
	name: z.string(),
	kind: z.enum(ImportStageKind),
	tone: z.enum(PipelineStageTone),
	position: z.number(),
	isEntry: z.boolean(),
	archived: z.boolean(),
	shipmentCount: z.number(),
});

export const importStageSettingsOutput = z.object({
	stages: z.array(importStageRowOutput),
	canManage: z.boolean(),
});

export type ImportStageCreateInput = z.infer<typeof importStageCreateInput>;
export type ImportStageUpdateInput = z.infer<typeof importStageUpdateInput>;
export type ImportStageReorderInput = z.infer<typeof importStageReorderInput>;
export type ImportStageArchiveInput = z.infer<typeof importStageArchiveInput>;
export type ImportStageKeyInput = z.infer<typeof importStageKeyInput>;
export type ImportStageSettings = z.infer<typeof importStageSettingsOutput>;
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/test/import-stages.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_STAGE, isFixedImportStage } from "@crm/db/import-stage";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
} from "@nestjs/common";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
	taskDueDay,
} from "../src/activities/task-due-date";
import {
	type ImportStageArchiveInput,
	type ImportStageCreateInput,
	type ImportStageReorderInput,
	type ImportStageSettings,
	type ImportStageUpdateInput,
	importStageCreateInput,
	importStageSettingsOutput,
	importStageUpdateInput,
} from "../src/imports/import-stages.contracts";
import { ImportStagesService } from "../src/imports/import-stages.service";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `is-admin-${suffix}`;
const memberId = `is-member-${suffix}`;
const prefix = `IS${token}`;
const START_DAY = "2026-01-10";
const label = (name: string) => `${name} ${suffix}`;

const service = new ImportStagesService(db);
const contract =
	<Args extends unknown[]>(
		call: (...args: Args) => Promise<ImportStageSettings>,
	) =>
	async (...args: Args) =>
		expectOutput(importStageSettingsOutput, await call(...args));
const stages = {
	settings: contract((userId: string) => service.settings(userId)),
	create: contract((userId: string, input: ImportStageCreateInput) =>
		service.create(userId, input),
	),
	update: contract((userId: string, input: ImportStageUpdateInput) =>
		service.update(userId, input),
	),
	reorder: contract((userId: string, input: ImportStageReorderInput) =>
		service.reorder(userId, input),
	),
	archive: contract((userId: string, input: ImportStageArchiveInput) =>
		service.archive(userId, input),
	),
	restore: contract((userId: string, key: string) =>
		service.restore(userId, key),
	),
};

let orderId: string;
const createdKeys: string[] = [];

async function make(name: string) {
	const result = await stages.create(
		adminId,
		importStageCreateInput.parse({ name: label(name) }),
	);
	const found = result.stages.find((stage) => stage.name === label(name));
	if (!found) throw new Error(`No stage called ${name}.`);
	createdKeys.push(found.key);
	return found;
}

async function row(key: string) {
	const { stages: list } = await stages.settings(adminId);
	const found = list.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

async function fixedStage(pick: "entry" | "received" | "cancelled") {
	const { stages: list } = await stages.settings(adminId);
	const found = list.find((stage) =>
		pick === "entry"
			? stage.isEntry && !stage.archived
			: !stage.archived &&
				stage.kind ===
					(pick === "received"
						? ImportStageKind.RECEIVED
						: ImportStageKind.CANCELLED),
	);
	if (!found) throw new Error(`No ${pick} stage.`);
	return found;
}

async function activeIntermediateKeys() {
	const { stages: list } = await stages.settings(adminId);
	return list
		.filter((stage) => !stage.archived && !isFixedImportStage(stage))
		.map((stage) => stage.key);
}

async function shipmentIn(
	stageKey: string,
	day: string = START_DAY,
): Promise<string> {
	const shipment = await db.shipment.create({
		data: {
			orderId,
			stageKey,
			stageChangedAt: taskDueDay(day),
			events: {
				create: {
					stageKey,
					occurredAt: taskDueDay(day),
					actorId: adminId,
				},
			},
		},
		select: { id: true },
	});
	return shipment.id;
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{
				id: adminId,
				name: "Import Stage Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Stage Member",
				email: `${memberId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `m-${adminId}`,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: `m-${memberId}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-1`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(START_DAY),
		},
		select: { id: true },
	});
	orderId = order.id;
});

afterAll(async () => {
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await db.importStage.deleteMany({ where: { key: { in: createdKeys } } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("creating an import stage", () => {
	it("generates the key from the name and puts the stage at the end", async () => {
		const before = await activeIntermediateKeys();
		const created = await make("Depósito fiscal");

		expect(created.key).toBe(`DEPOSITO_FISCAL_${token}`);
		expect(created.kind).toBe(ImportStageKind.IN_PROGRESS);
		expect(created.tone).toBe(IMPORT_STAGE.defaultTone);
		expect(created.isEntry).toBe(false);
		expect(await activeIntermediateKeys()).toEqual([...before, created.key]);
		expect(created.position).toBeLessThan(IMPORT_STAGE.fixedEndPosition);
	});

	it("never reuses a key, even from an archived stage", async () => {
		const first = await make("Mi etapa");
		await stages.archive(adminId, { key: first.key });

		const result = await stages.create(
			adminId,
			importStageCreateInput.parse({ name: `Mi-etapa ${suffix}` }),
		);
		const second = result.stages.find(
			(stage) => stage.name === `Mi-etapa ${suffix}`,
		);
		if (second) createdKeys.push(second.key);

		expect(second?.key).toBe(`${first.key}_2`);
	});

	it("refuses a name that exists, ignoring case, archived or not", async () => {
		await make("Repetida");

		await expect(
			stages.create(
				adminId,
				importStageCreateInput.parse({
					name: label("REPETIDA").toLowerCase(),
				}),
			),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses a name with no letters or digits", async () => {
		await expect(
			stages.create(adminId, importStageCreateInput.parse({ name: "!!!" })),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("validates the name and the tone at the boundary", () => {
		expect(importStageCreateInput.safeParse({ name: "  " }).success).toBe(
			false,
		);
		expect(
			importStageCreateInput.safeParse({
				name: "x".repeat(IMPORT_STAGE.nameMaxLength + 1),
			}).success,
		).toBe(false);
		expect(
			importStageCreateInput.safeParse({ name: "Ok", tone: "PINK" }).success,
		).toBe(false);
	});
});

describe("editing an import stage", () => {
	it("renames and recolours an intermediate stage and keeps its key", async () => {
		const created = await make("Para renombrar");

		const result = await stages.update(
			adminId,
			importStageUpdateInput.parse({
				key: created.key,
				name: label("Renombrada"),
				tone: "WARNING",
			}),
		);
		const renamed = result.stages.find((stage) => stage.key === created.key);

		expect(renamed?.name).toBe(label("Renombrada"));
		expect(renamed?.tone).toBe("WARNING");
	});

	it("renames a fixed stage", async () => {
		const received = await fixedStage("received");

		try {
			await stages.update(adminId, {
				key: received.key,
				name: label("Entregado"),
			});
			expect((await row(received.key)).name).toBe(label("Entregado"));
		} finally {
			await db.importStage.update({
				where: { key: received.key },
				data: { name: received.name },
			});
		}
	});

	it("refuses to rename onto a name that exists", async () => {
		const taken = await make("Ocupada");
		const created = await make("Otra para renombrar");

		await expect(
			stages.update(adminId, { key: created.key, name: taken.name }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("reordering import stages", () => {
	it("reorders the intermediate stages and refuses a stale list", async () => {
		await make("Orden A");
		await make("Orden B");
		const before = await activeIntermediateKeys();
		const reversed = [...before].reverse();

		try {
			await stages.reorder(adminId, { keys: reversed });
			expect(await activeIntermediateKeys()).toEqual(reversed);
		} finally {
			await stages.reorder(adminId, { keys: before });
		}

		await expect(
			stages.reorder(adminId, { keys: before.slice(1) }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("archiving an import stage", () => {
	it("archives a stage with no shipments", async () => {
		const created = await make("Vacía");

		const result = await stages.archive(adminId, { key: created.key });

		expect(
			result.stages.find((stage) => stage.key === created.key)?.archived,
		).toBe(true);
		expect(await activeIntermediateKeys()).not.toContain(created.key);
	});

	it("refuses to archive a fixed stage", async () => {
		for (const pick of ["entry", "received", "cancelled"] as const) {
			const stage = await fixedStage(pick);
			await expect(
				stages.archive(adminId, { key: stage.key }),
			).rejects.toBeInstanceOf(BadRequestException);
		}
	});

	it("refuses to archive a stage with shipments and no target", async () => {
		const full = await make("Con envíos");
		await shipmentIn(full.key);

		await expect(
			stages.archive(adminId, { key: full.key }),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await row(full.key)).archived).toBe(false);
	});

	it("refuses a closed or archived target", async () => {
		const source = await make("Origen cerrado");
		await shipmentIn(source.key);
		const gone = await make("Destino archivado");
		await stages.archive(adminId, { key: gone.key });
		const received = await fixedStage("received");

		await expect(
			stages.archive(adminId, { key: source.key, targetKey: received.key }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			stages.archive(adminId, { key: source.key, targetKey: gone.key }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect((await row(source.key)).archived).toBe(false);
	});

	it("moves every shipment to the target with an event dated today", async () => {
		const source = await make("Origen");
		const target = await make("Destino");
		const first = await shipmentIn(source.key);
		const second = await shipmentIn(source.key);

		const result = await stages.archive(adminId, {
			key: source.key,
			targetKey: target.key,
		});

		const moved = await db.shipment.findMany({
			where: { id: { in: [first, second] } },
			select: { stageKey: true },
		});
		expect(moved.every((shipment) => shipment.stageKey === target.key)).toBe(
			true,
		);
		const events = await db.shipmentStageEvent.findMany({
			where: { shipmentId: { in: [first, second] }, stageKey: target.key },
			select: { occurredAt: true, actorId: true },
		});
		const today = taskDayBoundaries(new Date()).startOfToday;
		expect(events.length).toBe(2);
		expect(events.every((event) => event.actorId === adminId)).toBe(true);
		expect(
			events.every(
				(event) => event.occurredAt.getTime() === today.getTime(),
			),
		).toBe(true);
		expect(
			result.stages.find((stage) => stage.key === source.key)?.archived,
		).toBe(true);
		expect(
			result.stages.find((stage) => stage.key === target.key)?.shipmentCount,
		).toBe(2);
	});

	it("dates every move on the chosen day", async () => {
		const source = await make("Origen con fecha");
		const target = await make("Destino con fecha");
		const first = await shipmentIn(source.key);
		const second = await shipmentIn(source.key);

		await stages.archive(adminId, {
			key: source.key,
			targetKey: target.key,
			occurredAt: "2026-02-01",
		});

		const chosen = taskDueDay("2026-02-01");
		const events = await db.shipmentStageEvent.findMany({
			where: { shipmentId: { in: [first, second] }, stageKey: target.key },
			select: { occurredAt: true, actorId: true },
		});
		expect(events.length).toBe(2);
		expect(events.every((event) => event.actorId === adminId)).toBe(true);
		expect(
			events.every((event) => event.occurredAt.getTime() === chosen.getTime()),
		).toBe(true);
		const moved = await db.shipment.findMany({
			where: { id: { in: [first, second] } },
			select: { stageKey: true, stageChangedAt: true },
		});
		expect(
			moved.every(
				(shipment) =>
					shipment.stageKey === target.key &&
					shipment.stageChangedAt.getTime() === chosen.getTime(),
			),
		).toBe(true);
	});

	it("dates the moves on today when no day is given", async () => {
		const source = await make("Origen sin fecha");
		const target = await make("Destino sin fecha");
		const id = await shipmentIn(source.key);

		await stages.archive(adminId, { key: source.key, targetKey: target.key });

		const today = taskDayBoundaries(new Date()).startOfToday;
		const shipment = await db.shipment.findUniqueOrThrow({
			where: { id },
			select: { stageKey: true, stageChangedAt: true },
		});
		const event = await db.shipmentStageEvent.findFirstOrThrow({
			where: { shipmentId: id, stageKey: target.key },
			select: { occurredAt: true },
		});
		expect(shipment.stageKey).toBe(target.key);
		expect(shipment.stageChangedAt.getTime()).toBe(today.getTime());
		expect(event.occurredAt.getTime()).toBe(today.getTime());
	});

	it("refuses a day before a shipment's last event and moves nothing", async () => {
		const source = await make("Origen con fecha temprana");
		const target = await make("Destino con fecha temprana");
		const early = await shipmentIn(source.key);
		const late = await shipmentIn(source.key, "2026-03-01");

		expect.assertions(7);
		try {
			await stages.archive(adminId, {
				key: source.key,
				targetKey: target.key,
				occurredAt: "2026-02-01",
			});
		} catch (error) {
			expect(error).toBeInstanceOf(BadRequestException);
			expect(error).toMatchObject({
				message: expect.stringContaining("2026-03-01"),
			});
		}
		expect((await row(source.key)).archived).toBe(false);
		for (const id of [early, late]) {
			const shipment = await db.shipment.findUniqueOrThrow({
				where: { id },
				select: { stageKey: true },
			});
			expect(shipment.stageKey).toBe(source.key);
			expect(
				await db.shipmentStageEvent.count({ where: { shipmentId: id } }),
			).toBe(1);
		}
	});

	it("refuses a day after today and moves nothing", async () => {
		const source = await make("Origen con fecha futura");
		const target = await make("Destino con fecha futura");
		const id = await shipmentIn(source.key);
		const tomorrow = serializeTaskDueDay(
			taskDayBoundaries(new Date()).startOfTomorrow,
		);

		await expect(
			stages.archive(adminId, {
				key: source.key,
				targetKey: target.key,
				occurredAt: tomorrow ?? "",
			}),
		).rejects.toBeInstanceOf(BadRequestException);

		expect((await row(source.key)).archived).toBe(false);
		expect(
			(
				await db.shipment.findUniqueOrThrow({
					where: { id },
					select: { stageKey: true },
				})
			).stageKey,
		).toBe(source.key);
		expect(
			await db.shipmentStageEvent.count({ where: { shipmentId: id } }),
		).toBe(1);
	});
});

describe("restoring an import stage", () => {
	it("puts the stage back at the end of the intermediate stages", async () => {
		const created = await make("Para restaurar");
		await stages.archive(adminId, { key: created.key });

		await stages.restore(adminId, created.key);

		const keys = await activeIntermediateKeys();
		expect(keys.at(-1)).toBe(created.key);
	});

	it("refuses to restore a stage that is not archived", async () => {
		const created = await make("Activa");

		await expect(
			stages.restore(adminId, created.key),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const settings = await stages.settings(memberId);
		expect(settings.canManage).toBe(false);
		expect((await stages.settings(adminId)).canManage).toBe(true);

		const target = await make("Solo admin");
		const writes = [
			() => service.create(memberId, { name: label("Prohibida") }),
			() => service.update(memberId, { key: target.key, name: target.name }),
			() => service.reorder(memberId, { keys: [] }),
			() => service.archive(memberId, { key: target.key }),
			() => service.restore(memberId, target.key),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stages.integration.spec.ts`
Expected: FAIL with `Cannot find module '../src/imports/import-stages.service'`.

- [ ] **Step 4: Write the service**

Create `apps/api/src/imports/import-stages.service.ts`:

```ts
import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_STAGE, isFixedImportStage } from "@crm/db/import-stage";
import { sameKeySet, uniqueStageKey } from "@crm/db/pipeline-stage";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
} from "../activities/task-due-date";
import { InjectDatabase } from "../database/database.constants";
import type {
	ImportStageArchiveInput,
	ImportStageCreateInput,
	ImportStageReorderInput,
	ImportStageSettings,
	ImportStageUpdateInput,
} from "./import-stages.contracts";
import { moveShipmentInTx } from "./shipment-moves";

type StageRecord = Prisma.ImportStageGetPayload<object>;

type PositionedStage = {
	position: number;
	isEntry: boolean;
	kind: ImportStageKind;
};

function nextIntermediatePosition(rows: PositionedStage[]): number {
	const last = rows
		.filter((row) => !isFixedImportStage(row))
		.reduce(
			(max, row) => Math.max(max, row.position),
			IMPORT_STAGE.firstIntermediatePosition - 1,
		);
	return last + 1;
}

@Injectable()
export class ImportStagesService {
	private readonly logger = new Logger(ImportStagesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async settings(actingUserId: string): Promise<ImportStageSettings> {
		const [rows, counts, role] = await Promise.all([
			this.db.importStage.findMany({ orderBy: { position: "asc" } }),
			this.db.shipment.groupBy({ by: ["stageKey"], _count: { _all: true } }),
			workspaceRoleOf(actingUserId),
		]);
		const perStage = new Map(
			counts.map((row) => [row.stageKey, row._count._all]),
		);

		return {
			stages: rows.map((row) => ({
				key: row.key,
				name: row.name,
				kind: row.kind,
				tone: row.tone,
				position: row.position,
				isEntry: row.isEntry,
				archived: row.archivedAt !== null,
				shipmentCount: perStage.get(row.key) ?? 0,
			})),
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ImportStageCreateInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.assertNameFree(tx, input.name);
			const all = await tx.importStage.findMany({
				select: { key: true, position: true, isEntry: true, kind: true },
			});
			const key = uniqueStageKey(
				input.name,
				new Set(all.map((row) => row.key)),
			);
			if (!key) {
				throw new BadRequestException(
					"El nombre necesita al menos una letra o un número.",
				);
			}
			await tx.importStage.create({
				data: {
					key,
					name: input.name,
					kind: ImportStageKind.IN_PROGRESS,
					tone: input.tone ?? IMPORT_STAGE.defaultTone,
					position: nextIntermediatePosition(all),
				},
			});
		});

		return this.settings(actingUserId);
	}

	async update(
		actingUserId: string,
		input: ImportStageUpdateInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			await this.assertNameFree(tx, input.name, stage.key);
			await tx.importStage.update({
				where: { key: stage.key },
				data: { name: input.name, tone: input.tone },
			});
		});

		return this.settings(actingUserId);
	}

	async reorder(
		actingUserId: string,
		input: ImportStageReorderInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT 1 FROM import_stage FOR UPDATE`;
			const active = await tx.importStage.findMany({
				where: { archivedAt: null },
			});
			const current = active
				.filter((row) => !isFixedImportStage(row))
				.map((row) => row.key);

			if (!sameKeySet(input.keys, current)) {
				throw new ConflictException(
					"Las etapas cambiaron mientras las ordenabas. Recarga e intenta de nuevo.",
				);
			}

			for (const [index, key] of input.keys.entries()) {
				await tx.importStage.update({
					where: { key },
					data: { position: IMPORT_STAGE.firstIntermediatePosition + index },
				});
			}
		});

		return this.settings(actingUserId);
	}

	async archive(
		actingUserId: string,
		input: ImportStageArchiveInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);
		const today = serializeTaskDueDay(
			taskDayBoundaries(new Date()).startOfToday,
		);
		const occurredOn = input.occurredAt ?? today;

		const moved = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			if (isFixedImportStage(stage)) {
				throw new BadRequestException("Una etapa fija no se puede archivar.");
			}
			if (stage.archivedAt) {
				throw new ConflictException("Esa etapa ya está archivada.");
			}

			const shipments = await tx.shipment.findMany({
				where: { stageKey: stage.key },
				orderBy: { createdAt: "asc" },
				select: { id: true },
			});

			if (shipments.length > 0) {
				if (!input.targetKey || !occurredOn) {
					throw new ConflictException(
						`Hay ${shipments.length} envíos en esta etapa. Elige a qué etapa pasan antes de archivarla.`,
					);
				}
				await this.assertTarget(tx, input.targetKey, stage.key);
				for (const shipment of shipments) {
					await moveShipmentInTx(tx, {
						shipmentId: shipment.id,
						targetKey: input.targetKey,
						occurredOn,
						actorId: actingUserId,
					});
				}
			}

			await tx.importStage.update({
				where: { key: stage.key },
				data: { archivedAt: new Date() },
			});

			return shipments.length;
		});

		this.logger.log({
			message: "Import stage archived",
			stage: input.key,
			shipmentsMoved: moved,
		});

		return this.settings(actingUserId);
	}

	async restore(
		actingUserId: string,
		key: string,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, key);
			if (!stage.archivedAt) {
				throw new ConflictException("Esa etapa no está archivada.");
			}
			const all = await tx.importStage.findMany({
				select: { position: true, isEntry: true, kind: true },
			});
			await tx.importStage.update({
				where: { key },
				data: { archivedAt: null, position: nextIntermediatePosition(all) },
			});
		});

		return this.settings(actingUserId);
	}

	private async lock(
		tx: Prisma.TransactionClient,
		key: string,
	): Promise<StageRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM import_stage WHERE "key" = ${key} FOR UPDATE
		`;
		const stage = await tx.importStage.findUnique({ where: { key } });
		if (!stage) {
			throw new NotFoundException("No existe una etapa con esa clave.");
		}
		return stage;
	}

	private async assertTarget(
		tx: Prisma.TransactionClient,
		targetKey: string,
		sourceKey: string,
	): Promise<void> {
		if (targetKey === sourceKey) {
			throw new BadRequestException("Elige otra etapa para los envíos.");
		}
		const target = await tx.importStage.findUnique({
			where: { key: targetKey },
		});
		if (
			!target ||
			target.archivedAt ||
			target.kind !== ImportStageKind.IN_PROGRESS
		) {
			throw new BadRequestException(
				"Los envíos solo pueden pasar a una etapa activa en curso.",
			);
		}
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptKey?: string,
	): Promise<void> {
		const existing = await tx.importStage.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				key: exceptKey ? { not: exceptKey } : undefined,
			},
			select: { key: true },
		});
		if (existing) {
			throw new ConflictException(`Ya existe una etapa llamada ${name}.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar las etapas de importación.",
			);
		}
	}
}
```

`serializeTaskDueDay` returns `string | null` for a `Date | null` input, so `today`, and `occurredOn` after the `??`, are typed `string | null`. The `!occurredOn` guard narrows it. It is never `null` at run time.

`archive` adds no date rule of its own. `moveShipmentInTx` applies the rules of a normal move to each shipment: the day cannot be after today (UTC) and cannot be before that shipment's latest event. Its message for the second rule already names the earliest allowed day: `La fecha no puede ser anterior al 2026-01-10, la del cambio anterior.` One refused shipment throws inside the archive transaction, so Prisma rolls back every earlier move and the stage stays active.

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stages.integration.spec.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Format**

Run: `bunx biome format --write apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/test/import-stages.integration.spec.ts && bunx biome check apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/test/import-stages.integration.spec.ts`
Expected: no findings.

- [ ] **Step 7: Commit (only with the owner's OK)**

```bash
git add apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/test/import-stages.integration.spec.ts
git commit -m "feat: add the import stages service" -- apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/test/import-stages.integration.spec.ts
```

---

### Task 5: Router, module and registration

**Files:**
- Create: `apps/api/src/imports/import-stages.router.ts`
- Create: `apps/api/src/imports/imports.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Regenerate: `apps/api/src/generated/server.ts`

- [ ] **Step 1: Write the router**

Create `apps/api/src/imports/import-stages.router.ts`:

```ts
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	type ImportStageArchiveInput,
	type ImportStageCreateInput,
	type ImportStageKeyInput,
	type ImportStageReorderInput,
	type ImportStageUpdateInput,
	importStageArchiveInput,
	importStageCreateInput,
	importStageKeyInput,
	importStageReorderInput,
	importStageSettingsOutput,
	importStageUpdateInput,
} from "./import-stages.contracts";
import { ImportStagesService } from "./import-stages.service";

const TAGS = ["Import stages"];

@Router({ alias: "importStages" })
@UseMiddlewares(AuthMiddleware)
export class ImportStagesRouter {
	constructor(
		@Inject(ImportStagesService) private readonly stages: ImportStagesService,
	) {}

	@Query({
		output: importStageSettingsOutput,
		meta: restMeta("GET", "/import-stages", TAGS),
	})
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.stages.settings(ctx.user.id);
	}

	@Mutation({
		input: importStageCreateInput,
		output: importStageSettingsOutput,
		meta: restMeta("POST", "/import-stages", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageCreateInput,
	) {
		return this.stages.create(ctx.user.id, input);
	}

	@Mutation({
		input: importStageUpdateInput,
		output: importStageSettingsOutput,
		meta: restMeta("PATCH", "/import-stages/{key}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageUpdateInput,
	) {
		return this.stages.update(ctx.user.id, input);
	}

	@Mutation({
		input: importStageReorderInput,
		output: importStageSettingsOutput,
		meta: restMeta("PUT", "/import-stages/order", TAGS),
	})
	async reorder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageReorderInput,
	) {
		return this.stages.reorder(ctx.user.id, input);
	}

	@Mutation({
		input: importStageArchiveInput,
		output: importStageSettingsOutput,
		meta: restMeta("POST", "/import-stages/{key}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageArchiveInput,
	) {
		return this.stages.archive(ctx.user.id, input);
	}

	@Mutation({
		input: importStageKeyInput,
		output: importStageSettingsOutput,
		meta: restMeta("POST", "/import-stages/{key}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageKeyInput,
	) {
		return this.stages.restore(ctx.user.id, input.key);
	}
}
```

- [ ] **Step 2: Write the module**

Create `apps/api/src/imports/imports.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportStagesRouter } from "./import-stages.router";
import { ImportStagesService } from "./import-stages.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportStagesService, ImportStagesRouter],
})
export class ImportsModule {}
```

- [ ] **Step 3: Register the module**

Run: `git diff HEAD -- apps/api/src/app.module.ts`
Expected: no output. If there is output, stop and ask the owner.

In `apps/api/src/app.module.ts`, replace:

```ts
import { HealthModule } from "./health/health.module";
```

with:

```ts
import { HealthModule } from "./health/health.module";
import { ImportsModule } from "./imports/imports.module";
```

Then replace:

```ts
		ProductsModule,
```

with:

```ts
		ProductsModule,
		ImportsModule,
```

- [ ] **Step 4: Regenerate the committed router file**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`
Expected: `src/generated/server.ts` now contains an `importStages: t.router({ settings, create, update, reorder, archive, restore })` block.
Check: `rg -n 'importStages: t.router' apps/api/src/generated/server.ts` prints one line.
If the generator fails on GLIBC, stop and report it. Do not edit the file by hand.

- [ ] **Step 5: Type check the API**

Run: `bun run check-types --filter=api`
Expected: no errors.

- [ ] **Step 6: Format**

Run: `bunx biome format --write apps/api/src/imports/import-stages.router.ts apps/api/src/imports/imports.module.ts apps/api/src/app.module.ts && bunx biome check apps/api/src/imports/import-stages.router.ts apps/api/src/imports/imports.module.ts apps/api/src/app.module.ts`
Expected: no findings. Do not format `generated/server.ts`.

- [ ] **Step 7: Commit (only with the owner's OK)**

`apps/api/src/generated/server.ts` is already staged by another session. Check it first:

Run: `git diff HEAD -- apps/api/src/generated/server.ts`
Expected: only the `importStages` router block and its imports. If any other hunk shows, stop and ask the owner. Do not commit the file.

```bash
git add apps/api/src/imports/import-stages.router.ts apps/api/src/imports/imports.module.ts apps/api/src/app.module.ts apps/api/src/generated/server.ts
git commit -m "feat: expose the import stages router" -- apps/api/src/imports/import-stages.router.ts apps/api/src/imports/imports.module.ts apps/api/src/app.module.ts apps/api/src/generated/server.ts
```

---

### Task 6: Client helpers and cache

**Files:**
- Create: `apps/app/lib/import-stage-settings.ts`
- Create: `apps/app/test/import-stage-settings.spec.ts`
- Modify: `apps/app/lib/trpc/cache.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/test/import-stage-settings.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	applyImportStageOrder,
	type ImportStageRow,
	importArchiveTargets,
	splitImportStages,
	utcDay,
} from "../lib/import-stage-settings";

function row(
	key: string,
	kind: ImportStageRow["kind"],
	position: number,
	extra: Partial<ImportStageRow> = {},
): ImportStageRow {
	return {
		key,
		name: key,
		kind,
		tone: "NEUTRAL",
		position,
		isEntry: false,
		archived: false,
		shipmentCount: 0,
		...extra,
	};
}

const rows = [
	row("CANCELLED", "CANCELLED", 1001),
	row("RECEIVED", "RECEIVED", 1000),
	row("B", "IN_PROGRESS", 2),
	row("ORDERED", "IN_PROGRESS", 0, { isEntry: true }),
	row("A", "IN_PROGRESS", 1),
	row("OLD", "IN_PROGRESS", 3, { archived: true }),
];

describe("splitting the import stages", () => {
	it("separates the fixed rows, the intermediate rows and the archive", () => {
		const split = splitImportStages(rows);

		expect(split.entry?.key).toBe("ORDERED");
		expect(split.intermediate.map((stage) => stage.key)).toEqual(["A", "B"]);
		expect(split.received?.key).toBe("RECEIVED");
		expect(split.cancelled?.key).toBe("CANCELLED");
		expect(split.archived.map((stage) => stage.key)).toEqual(["OLD"]);
	});
});

describe("reordering the import stages", () => {
	it("swaps the positions of the intermediate rows only", () => {
		const next = applyImportStageOrder(rows, ["B", "A"]);

		expect(
			splitImportStages(next).intermediate.map((stage) => stage.key),
		).toEqual(["B", "A"]);
		expect(next.find((stage) => stage.key === "RECEIVED")?.position).toBe(
			1000,
		);
		expect(next.find((stage) => stage.key === "OLD")?.position).toBe(3);
	});
});

describe("archive targets", () => {
	it("offers the active in-progress stages except the one being archived", () => {
		expect(importArchiveTargets(rows, "A").map((stage) => stage.key)).toEqual(
			["ORDERED", "B"],
		);
	});
});

describe("the UTC day", () => {
	it("returns the UTC calendar day of an instant", () => {
		expect(utcDay(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01");
		expect(utcDay(new Date("2026-03-01T23:59:59.999Z"))).toBe("2026-03-01");
	});

	it("is already tomorrow late in the evening in Argentina", () => {
		expect(utcDay(new Date("2026-03-01T22:30:00-03:00"))).toBe("2026-03-02");
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/app && bun test test/import-stage-settings.spec.ts`
Expected: FAIL with `Cannot find module '../lib/import-stage-settings'`.

- [ ] **Step 3: Write the helpers**

Create `apps/app/lib/import-stage-settings.ts`:

```ts
import { ImportStageKind } from "@crm/db/enums";
import { isFixedImportStage } from "@crm/db/import-stage";
import type { RouterOutputs } from "@/lib/trpc/types";

export type ImportStageRow =
	RouterOutputs["importStages"]["settings"]["stages"][number];

const byPosition = (a: ImportStageRow, b: ImportStageRow) =>
	a.position - b.position;

export function splitImportStages(rows: readonly ImportStageRow[]) {
	const sorted = [...rows].sort(byPosition);
	const active = sorted.filter((row) => !row.archived);

	return {
		entry: active.find((row) => row.isEntry),
		intermediate: active.filter((row) => !isFixedImportStage(row)),
		received: active.find((row) => row.kind === ImportStageKind.RECEIVED),
		cancelled: active.find((row) => row.kind === ImportStageKind.CANCELLED),
		archived: sorted.filter((row) => row.archived),
	};
}

export function applyImportStageOrder(
	rows: readonly ImportStageRow[],
	keys: readonly string[],
): ImportStageRow[] {
	const slots = rows
		.filter((row) => !row.archived && !isFixedImportStage(row))
		.map((row) => row.position)
		.sort((a, b) => a - b);
	const position = new Map(keys.map((key, index) => [key, slots[index]]));

	return rows.map((row) => {
		const next = position.get(row.key);
		return next === undefined ? row : { ...row, position: next };
	});
}

export function importArchiveTargets(
	rows: readonly ImportStageRow[],
	key: string,
): ImportStageRow[] {
	return [...rows]
		.sort(byPosition)
		.filter(
			(row) =>
				row.key !== key &&
				!row.archived &&
				row.kind === ImportStageKind.IN_PROGRESS,
		);
}

export function utcDay(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}
```

`utcDay` uses the same rule as `taskDayBoundaries` on the API: the UTC calendar day (`TASKS.day.timeZone` is `"UTC"`).

- [ ] **Step 4: Run the test and see it pass**

Run: `cd apps/app && bun test test/import-stage-settings.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Cache invalidator**

Run: `git diff HEAD -- apps/app/lib/trpc/cache.ts`
Expected: no output. If there is output, stop and ask the owner.

In `apps/app/lib/trpc/cache.ts`, replace:

```ts
	products(options?: Options): Promise<void>;
```

with:

```ts
	products(options?: Options): Promise<void>;
	importStages(options?: Options): Promise<void>;
```

Then replace:

```ts
		products: (options) => run([trpc.products.list.queryKey()], [], options),
```

with:

```ts
		products: (options) => run([trpc.products.list.queryKey()], [], options),

		importStages: (options) =>
			run([trpc.importStages.settings.queryKey()], [], options),
```

- [ ] **Step 6: Format**

Run: `bunx biome format --write apps/app/lib/import-stage-settings.ts apps/app/test/import-stage-settings.spec.ts apps/app/lib/trpc/cache.ts && bunx biome check apps/app/lib/import-stage-settings.ts apps/app/test/import-stage-settings.spec.ts apps/app/lib/trpc/cache.ts`
Expected: no findings.

- [ ] **Step 7: Commit (only with the owner's OK)**

```bash
git add apps/app/lib/import-stage-settings.ts apps/app/test/import-stage-settings.spec.ts apps/app/lib/trpc/cache.ts
git commit -m "feat: add the import stage settings helpers" -- apps/app/lib/import-stage-settings.ts apps/app/test/import-stage-settings.spec.ts apps/app/lib/trpc/cache.ts
```

---

### Task 7: The settings screen

**Files:**
- Create: `apps/app/app/(app)/[slug]/settings/import-stages/page.tsx`
- Create: `apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx`
- Modify: `apps/app/components/workspace-nav.tsx`
- Modify: `apps/app/components/crm/quick-switcher.tsx`

- [ ] **Step 1: Server page**

Create `apps/app/app/(app)/[slug]/settings/import-stages/page.tsx`:

```tsx
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ImportStagesSettings } from "./import-stages-settings";

export const metadata: Metadata = {
	title: "Etapas de importación",
};

export default function ImportStagesSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etapas de importación</PageShellTitle>
					<PageShellDescription>
						Las etapas por las que pasa un envío. Cambia nombres, orden y
						color, o agrega etapas intermedias. Pedido, Recibido y Cancelado
						son fijas y solo se renombran.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Stages />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Stages() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.importStages.settings.queryOptions());

	return (
		<HydrateClient>
			<ImportStagesSettings />
		</HydrateClient>
	);
}
```

- [ ] **Step 2: The screen**

Create `apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx`:

```tsx
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

export function ImportStagesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [editing, setEditing] = useState<ImportStageRow | "new" | null>(null);
	const [archiving, setArchiving] = useState<ImportStageRow | null>(null);

	const list = useQuery(trpc.importStages.settings.queryOptions());
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
			await reorder.mutateAsync({ keys }).catch(() => undefined);
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
			<SettingsCard
				title="Etapas de importación"
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
							? create.mutate(values)
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
```

- [ ] **Step 3: Settings nav entry**

Run: `git diff HEAD -- apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no output. If there is output, stop and ask the owner.

In `apps/app/components/workspace-nav.tsx`, replace:

```tsx
	{ title: "Etapas", href: "/settings/stages" },
```

with:

```tsx
	{ title: "Etapas", href: "/settings/stages" },
	{ title: "Etapas de importación", href: "/settings/import-stages" },
```

- [ ] **Step 4: Command palette entry**

In `apps/app/components/crm/quick-switcher.tsx`, replace:

```tsx
		keywords: ["funnel", "embudo", "pipeline", "estados", "oportunidades"],
	},
```

with:

```tsx
		keywords: ["funnel", "embudo", "pipeline", "estados", "oportunidades"],
	},
	{
		id: "settings-import-stages",
		label: "Etapas de importación",
		href: "/settings/import-stages",
		keywords: ["importaciones", "envíos", "aduana", "embarque", "estados"],
	},
```

- [ ] **Step 5: Type check the app**

Run: `bun run check-types --filter=app`
Expected: no errors. The page uses no `PageProps`, so `typegen` is not needed.

- [ ] **Step 6: Format**

Run: `bunx biome format --write 'apps/app/app/(app)/[slug]/settings/import-stages/page.tsx' 'apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx' apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx && bunx biome check 'apps/app/app/(app)/[slug]/settings/import-stages/page.tsx' 'apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx' apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx`
Expected: no findings.

- [ ] **Step 7: Commit (only with the owner's OK)**

```bash
git add -- ':(literal)apps/app/app/(app)/[slug]/settings/import-stages/page.tsx' ':(literal)apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx' apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx
git commit -m "feat: add the import stages settings screen" -- ':(literal)apps/app/app/(app)/[slug]/settings/import-stages/page.tsx' ':(literal)apps/app/app/(app)/[slug]/settings/import-stages/import-stages-settings.tsx' apps/app/components/workspace-nav.tsx apps/app/components/crm/quick-switcher.tsx
```

---

### Task 8: Verification

- [ ] **Step 1: Type check**

Run: `bun run check-types --filter=api && bun run check-types --filter=app && bun run check-types --filter=@crm/db`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `bun run lint && bun run lint:slop`
Expected: no finding in a file this plan touched. A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 3: Run the tests of this plan**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-stage.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stages.integration.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/app && bun test test/import-stage-settings.spec.ts`

Expected: 4, 8, 21 and 5 tests pass.

- [ ] **Step 4: Run the neighbour tests**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/pipeline-stages.integration.spec.ts test/products.integration.spec.ts`
Expected: all green. The migration added back-relations to `Deal`, `Product` and `User`.

- [ ] **Step 5: Browser checklist for the owner**

Give the owner this list. Do not mark the plan closed without it.

1. Sign in as owner. Open *Configuración*. The settings menu shows *Etapas de importación*. Open it.
2. The card shows *Pedido* first, then *Embarcado*, *Guía*, *Aduana*, then *Recibido* and *Cancelado*. Each row says *0 envíos*.
3. *Agregar etapa* with an empty name. The form says *Escribe un nombre.*
4. Add *Depósito fiscal* with colour *Amarillo*. It appears last among the intermediate stages.
5. Add *depósito FISCAL* again. A toast says the stage already exists.
6. Drag *Depósito fiscal* above *Embarcado*. Reload. The order stays.
7. *Editar* *Recibido*, rename it, save. Rename it back.
8. *Archivar* *Depósito fiscal*. It moves to *Etapas archivadas*. *Restaurar* puts it back last.
9. Open the command palette and type *aduana*. *Etapas de importación* appears.
10. Sign in as a member. The page shows. Every button is disabled, and the hint says only an owner or an admin can change the stages.
11. Resize to 390 px. The page does not scroll sideways.
12. Switch to dark mode. The page keeps contrast.

13. Archive a stage that holds a shipment. No screen creates a shipment yet, so the owner first inserts one in the stage, with one event dated 2026-01-10 in that stage. Open *Archivar* on the stage. The dialog shows *Mover a* and *Fecha del cambio*. *Fecha del cambio* shows today's UTC day and does not accept a later day. Confirm with that default date. The stage moves to *Etapas archivadas*. The shipment is in the target stage. Its new event has today's UTC day.
14. Restore the stage and put a shipment in it again. Archive it and choose a past date that is on or after the last event of the shipment, for example 2026-02-01. The new event has that date.
15. Restore the stage and put a shipment in it again. Archive it and choose a date before the last event of the shipment, for example 2026-01-09. A toast says *La fecha no puede ser anterior al 2026-01-10, la del cambio anterior.* The stage is still in the active list. The shipment is still in its stage and has no new event.
16. Open *Archivar* on a stage that holds a shipment. Clear *Fecha del cambio* and confirm. The field says *Elige una fecha.* and nothing is sent.
17. *Archivar* a stage with no shipments. No dialog opens. The stage is archived at once.

Plan 2a-2 adds the same archive steps with a shipment created from the *Importaciones* screen.

---

## Self-review

**Phase 2a coverage.**

| Requirement | Where |
| --- | --- |
| `ImportStage` table, fixed entry/received/cancelled, seeded intermediates | Task 1 |
| Key immutable, generated from the name, never reused (archived keys counted) | Task 4 `create`, test "never reuses a key" |
| Code reads `kind`, never `name` | Tasks 2, 3, 4 (`isFixedImportStage`, `isClosedImportKind`, `kind` filters) |
| Rename, recolour, reorder by drag and drop, archive with move, restore | Task 4 service, Task 7 screen |
| Settings screen *Etapas de importación* at `/settings/import-stages` | Task 7 |
| Nav `SETTINGS_PAGES`, quick switcher `SETTINGS`, `useCrmCache` | Task 7 Steps 3 and 4, Task 6 Step 5 |
| `PurchaseOrder`, `PurchaseOrderLine` (deal `SET NULL`, `Decimal(14,2)`) | Task 1 (tables). Service and screen: Plan 2a-2 |
| `Shipment` with `stageKey` FK and `stageChangedAt`, `ShipmentLine` | Task 1. Service and screen: Plan 2a-2 |
| `ShipmentStageEvent` and the move with an editable date | Task 1 table, Task 3 `moveShipmentInTx` |
| Move locks the shipment `FOR UPDATE`, the target `FOR SHARE` | Task 3 Step 3 |
| Move refuses archived target, closed source, same stage, earlier date, future date | Task 3 tests |
| Archive dialog chooses the date of the moves, default today (UTC), required, never after today | Task 4 `occurredAt` input and service, Task 6 `utcDay`, Task 7 `ArchiveDialog` |
| Archive refuses a date before a shipment's last event or after today, and rolls back | Task 4 tests "dates every move on the chosen day", "dates the moves on today when no day is given", "refuses a day before a shipment's last event and moves nothing", "refuses a day after today and moves nothing" |
| Date to timestamp rule | Decisions 4 and 5, Task 3 |
| Current stage equals the latest event | Task 3 writes the event and `stageKey` together; Decision 7 |
| Room for Phase 4 stock inside the move | Decision 14; `moveShipmentInTx` returns `to.kind` |
| Permissions: writes need `canManageInventory`, reads open, `canManage` returned | Task 4 `requireManager`, `settings`, test "permissions"; Task 7 `busy` |
| `expectOutput` on every new procedure | Task 4 `contract` wraps all six service calls |
| Neutral Spanish in UI and API errors | Tasks 3, 4, 7 |
| Quantity rule with a two-writers test | Plan 2a-2 |
| Shipment creation with its first event | Plan 2a-2 |
| Lead times on read, received over ordered | Plan 2a-2 |
| *Importaciones* screen, sheet, deal picker, `/imports` nav entry | Plan 2a-2 |
| `docs/imports.md`, `AGENTS.md` row | Plan 2a-2 (Decision 21) |

**Placeholder scan.** No step says "similar to", "TODO" or "add the rest". Every code step holds the whole file or the exact old and new text.

**Name consistency across tasks.**
- `isFixedImportStage`, `isClosedImportKind`, `IMPORT_STAGE` (Task 2) are the names used in Tasks 3, 4 and 6.
- `moveShipmentInTx` and `ShipmentMoveInput` (Task 3) are the names Task 4 imports.
- `ImportStagesService` methods `settings`, `create`, `update`, `reorder`, `archive`, `restore` (Task 4) match the router procedures (Task 5) and the screen calls `trpc.importStages.<name>` (Task 7).
- `importStageSettingsOutput` row fields `key`, `name`, `kind`, `tone`, `position`, `isEntry`, `archived`, `shipmentCount` (Task 4) match the test fixture in Task 6.
- `cache.importStages` is declared in the type and in the implementation (Task 6) and called in Task 7.
- `splitImportStages`, `applyImportStageOrder`, `importArchiveTargets`, `utcDay` (Task 6) are the names Task 7 imports.
- The archive date field is `occurredAt` (a `"YYYY-MM-DD"` string) in `importStageArchiveInput` (Task 4), in the service (Task 4), in the dialog `onConfirm` and in the `archive.mutate` call (Task 7). The service passes it to `moveShipmentInTx` as `occurredOn`, the field `ShipmentMoveInput` already has (Task 3). `occurredAt` is also the `Date` column of `ShipmentStageEvent`. The input is a day string and the column is a `Date`.

**Known risks.**
- `SettingsCard`, `SortableList`, `Dialog`, `Select` and `useFormSheetValidation` props were copied from `settings/stages/stages-settings.tsx` as it is today. `check-types` shows any mismatch.
- The `ROW` class string is copied from the deal stages screen. It is a layout string at the call site, as there.
- An archive with many shipments runs every move in one interactive transaction with Prisma's default timeout of 5 seconds.
- An archive with a chosen date is refused when that date is earlier than the last event of any shipment in the stage. The whole archive rolls back. The stage stays active and no shipment moves. The message names the date of that shipment's last event, and another shipment can have a later one.
- A user move into a stage while an archive of that stage runs can deadlock. Postgres detects it and fails one of the two requests. The deal stages have the same shape.
- The `@@unique(..., where: ...)` partial index needs the `partialIndexes` preview feature. The schema enables it today.
