# Import Processes A1 (part 1 of 2: database and API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An import process is a named template of stages. Every stage belongs to one process. Every order picks one process. A shipment moves only between the stages of its own process. `createShipment` starts the shipment in the entry stage of the order's process. One migration creates the process "Importación estándar" and assigns every existing stage and order to it. Owner and admin write. Members read.

**Architecture:** One hand-written migration adds `import_process`, `processId` on `import_stage` and on `purchase_order`, and changes the entry index from one active entry in the table to one active entry per process. `ImportStage.key` stays unique in the whole table and immutable, so no foreign key to it changes. The pure rule that gives new stages their keys lives in `@crm/db/import-process`, beside `@crm/db/import-stage`. A new Nest module `import-processes` owns the router `importProcesses` (`docs/api.md`: one router per module). The stage service and `moveShipmentInTx` stay in `apps/api/src/imports` and get a process scope. The order service reads the process of the order under the order lock.

**Tech Stack:** Prisma 7 (`partialIndexes` preview), NestJS with `nestjs-trpc`, Zod, bun test.

Spec: `docs/superpowers/specs/2026-11-15-import-processes-design.md` (approved). It extends `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`. Executed plans: `docs/superpowers/plans/2026-11-14-import-stages.md`, `docs/superpowers/plans/2026-11-15-import-orders-shipments.md`.

**This is part 1 of 2.** Part 2 is `docs/superpowers/plans/2026-11-15-import-processes-a1-screens.md`: client helpers, `cache.importProcesses`, the settings screen *Procesos de importación*, the step editor of one process, the process field of the order form, nav and command palette entries, `docs/imports.md`, the `AGENTS.md` row and the browser checklist. Run part 1 completely before part 2. Part 2 reads the routers that this part generates. Between the end of part 1 and the end of part 2, `bun run check-types --filter=app` fails. That is expected.

**Not in A1:** decision stages, `rejectKey`, `outcome`, rejections, splitting, `unitsPerShipment` (plan A2). The horizontal path and the board (plan A3). Documents (plan B). Payments (plan C).

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server error messages. No voseo: "Elige", never "Elegí".
- Do not run `migrate dev`, `migrate reset` or `db push`. The migration is written by hand in Task 1. The owner applies it.
- Do not read `.env`. Use `--env-file`.
- Do not build.
- Edit existing files with exact old/new text replacements (the `Edit` tool). Do not use `sd`: it exited 0 twice without changing a file.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument. If `biome check` reports only import order, run `bunx biome check --write <paths>`. Never run the repo-wide `bun run format`.
- **Do not commit.** The owner approves commits. No `git add`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app`, `apps/api/src/enrichment`, `apps/agent` and docs. Before you edit a shared file (`app.module.ts`, `generated/server.ts`, `schema.prisma`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk this plan did not write, stop and ask the owner.
- Never call `Promise.all` on a transaction client (`tx`) inside `$transaction`. Reads on the plain `db` may use `Promise.all`.
- `lint:slop` rejects `.catch((x: unknown) => x)`, parameters typed `unknown` or `object`, `Record<string, unknown>` and `...(condition ? {...} : {})`. Use `try/catch` with `expect.assertions(n)`, or `await expect(...).rejects`.
- `noUncheckedIndexedAccess` is on. Guard `rows[0]` and `list[index]`.
- **Integration specs share `crm_test`.** A spec that fails in `afterAll` leaves rows behind, and the `@crm/auth` specs then fail. Every spec in this plan cleans up in foreign key order: shipments, then orders, then stages, then processes, then products, members and users. `apps/api/test/import-process-fixture.ts` (Task 3) owns that order. After any failed run, run the leftover check in Task 7 Step 5 before the next run.

## Decisions recorded in this plan

Each line is one decision that the spec and the brief do not make. The owner can veto any of them.

1. **`ImportStage.key` stays global and immutable** (owner decision). New keys come from `uniqueStageKey(name, taken)` in `@crm/db/pipeline-stage`, the function the stage service uses today. `taken` is every key in the whole `import_stage` table, archived or not, in every process. Two processes can have a stage called *Pedido*: the first key is `PEDIDO`, the next is `PEDIDO_2`. One pure function, `keyedStages`, gives keys to a list of new stages and adds each new key to `taken`, so two equal names in one batch get two keys. A name with no letter or digit falls back to the key of *Etapa*.
2. **The process name is unique in the database and unique ignoring case in the service.** `import_process.name` has a plain unique index. `assertNameFree` checks `mode: "insensitive"` against every process, archived or not, as the stage service does for stage names. Two writers that create *Courier* and *courier* at the same moment can both pass the service check. The table then holds both. Listed under Known risks.
3. **Stage names are unique inside one process, not in the whole table.** A duplicate copies the names, so a global rule would refuse every duplicate.
4. **The entry index covers `("processId", "isEntry")`, not `("processId")`.** The partial condition stays `isEntry = true AND archivedAt IS NULL`. A unique index on the foreign key alone can make Prisma read the relation as one-to-one. The extra column changes nothing, because the condition fixes `isEntry` to `true`.
5. **A new process starts with three stages:** *Pedido* (entry, `IN_PROGRESS`, `NEUTRAL`, position 0), *Recibido* (`RECEIVED`, `SUCCESS`, 1000), *Cancelado* (`CANCELLED`, `ERROR`, 1001). Positions come from `IMPORT_STAGE` (`entryPosition`, `fixedEndPosition`, `cancelledPosition`). These are the values of the shipped seed.
6. **Duplicate copies the active stages of the source** with their name, kind, tone, position and entry flag, and new keys. It copies the country. It does not copy archived stages, orders or shipments. The user types the name of the copy. The screen proposes "<name> (copia)". The three fixed stages are copied like the others, so the copy also has exactly one entry, one received and one cancelled stage.
7. **The default process has the id `import_process_standard`** and no country. Code never reads this id. Only the migration and the leftover check name it.
8. **An archived process** cannot be picked by a new order, cannot be the new process of an edited order and refuses `createShipment`. An order that already has it keeps it, and its other edits still work. Its stages stay readable and editable in settings. `restore` brings it back. The spec lists no restore. Without it an archive cannot be undone, so this plan adds it.
9. **Process archive and new shipments are serialized.** `archive` locks the `import_process` row `FOR UPDATE`. `createShipment`, order `create` and order `update` lock it `FOR SHARE` (`assertProcessOpen`). An archive therefore never commits while a new shipment of that process is in flight.
10. **The process of an order changes only while the order has no shipment** (spec rule 2). The check runs under the order lock (`lockOpenOrder`), so it cannot race with `createShipment`, which takes the same lock.
11. **A cancelled or received shipment does not block an archive.** Spec rule 4 names only shipments in an in-progress stage.
12. **`moveShipmentInTx` reads the order's process in the same locked row read** (`JOIN purchase_order ... FOR UPDATE OF s`). A target stage of another process is `BadRequest`, "Esa etapa es de otro proceso." The shipment row lock stays the only write lock of a move.
13. **The stage archive dialog offers only active `IN_PROGRESS` stages of the same process, other than the stage itself.** The server enforces the same process in `assertTarget`. The client gets it for free, because `importStages.settings` now returns one process.
14. **`importStages.settings` takes `{ processId }`** and returns `process` beside `stages`. The row shape of `stages` does not change, so `apps/app/lib/import-stage-settings.ts` and its test keep working.
15. **The detail of an order returns `process: { id, name, archived }`, and `stages` are the active stages of that process.** The move dialog reads `order.stages`, so it offers only stages of the order's process with no client change.
16. **`importOrders.options` returns `processes`**: the active processes by name, with `id`, `name`, `countryCode`.
17. **The country is a label only** (owner decision). Enum `ImportCountry` with `AR`, `PY`, `BR`. No code branches on it.
18. **Test fixture.** `apps/api/test/import-process-fixture.ts` creates a process with its three fixed stages through `keyedStages`, and removes processes in foreign key order. Every spec that needs stages creates its own process. No spec reads the default process. This removes the old assumption of one global stage list from the specs.

## Open questions for the owner

The plan implements the recommendation of each question. The change for the other option is named.

1. **Settings route.** The screen *Etapas de importación* lives at `/settings/import-stages`.
   - Option A (recommended): rename it to `/settings/import-processes` and `/settings/import-processes/[processId]`, with no redirect. The repo did the same for `/pipeline` to `/funnel` (commit `7a53b2a`): it renamed the folder, the nav and the switcher entry and kept no redirect. The old page has no outside links.
   - Option B: also keep `/settings/import-stages/page.tsx` as a server page that calls `redirect` from `next/navigation` to `/${slug}/settings/import-processes`. Part 2 Task 2 then keeps that one file instead of deleting it.
2. **How the order form shows the process when only one active process exists.**
   - Option A (recommended): the *Proceso* field shows, with the only process already chosen. The user sees that processes exist, and the form never sends an empty process.
   - Option B: hide the field when exactly one active process exists and send its id. To pick B, wrap the field in `processes.length > 1 ?` in part 2 Task 4. The user then does not learn that processes exist until there are two.
3. **Two writers that create the same stage key at the same moment.** Today `ImportStagesService.create` has the same race. Under this plan, a process create, a duplicate and a stage create can each pick the same new key, and the second insert fails with a unique violation (`P2002`). The user sees a generic error and retries.
   - Option A (recommended): accept it for A1. The settings screen has one or two users.
   - Option B: take `pg_advisory_xact_lock` with one fixed number at the start of each of the three transactions. Every key writer then runs one after the other.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `ImportCountry`, `ImportProcess`, `processId` on `ImportStage` and `PurchaseOrder`, the entry index |
| `packages/db/prisma/migrations/20261115120000_import_processes/migration.sql` | Hand-written migration with the default process |
| `packages/db/src/import-stage.ts` | `IMPORT_STAGE.entryPosition`, `IMPORT_STAGE.cancelledPosition` |
| `packages/db/src/import-process.ts` | `IMPORT_PROCESS`, `keyedStages` |
| `packages/db/test/import-process.spec.ts` | Unit test of `keyedStages` |
| `packages/db/package.json` | `./import-process` export |
| `apps/api/test/import-process-fixture.ts` | Test process and cleanup in foreign key order |
| `apps/api/src/imports/shipment-moves.ts` | A move stays inside the process |
| `apps/api/test/shipment-moves.integration.spec.ts` | Own process, new test |
| `apps/api/src/imports/import-stages.contracts.ts` | `processId` on settings, create and reorder; `process` in the output |
| `apps/api/src/imports/import-stages.service.ts` | Every rule scoped to one process |
| `apps/api/src/imports/import-stages.router.ts` | `settings` takes `{ processId }` |
| `apps/api/test/import-stages.integration.spec.ts` | Own process, new tests |
| `apps/api/src/import-processes/import-processes.contracts.ts` | Zod inputs and outputs |
| `apps/api/src/import-processes/import-processes.service.ts` | Process rules and permission |
| `apps/api/src/import-processes/import-processes.router.ts` | tRPC procedures |
| `apps/api/src/import-processes/import-processes.module.ts` | Nest module |
| `apps/api/test/import-processes.integration.spec.ts` | Service and contract tests |
| `apps/api/src/app.module.ts` | Registers the module |
| `apps/api/src/import-orders/import-orders.contracts.ts` | `processId` on the order, `process` in the detail, `processes` in the options |
| `apps/api/src/import-orders/import-orders.service.ts` | The process of an order, the entry stage per process |
| `apps/api/test/import-orders.integration.spec.ts` | Own processes, new tests |
| `apps/api/src/generated/server.ts` | Regenerated |

---

### Task 1: Schema and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261115120000_import_processes/migration.sql`

- [ ] **Step 1: Check the starting point**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- packages/db/prisma/schema.prisma && fd -t d . packages/db/prisma/migrations | tail -1`
Expected: no diff output, then `packages/db/prisma/migrations/20261114220000_imports/`. If the diff shows a hunk or a newer migration folder exists, stop and ask the owner.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rg -n 'import_stage_entry_key' packages/db/prisma/migrations/20261114220000_imports/migration.sql packages/db/prisma/schema.prisma`
Expected: one `CREATE UNIQUE INDEX "import_stage_entry_key" ON "import_stage"("isEntry") WHERE ...` line and one `@@unique([isEntry], map: "import_stage_entry_key", ...)` line.

- [ ] **Step 2: Add the enum and the model**

In `packages/db/prisma/schema.prisma`, replace:

```prisma
enum ImportStageKind {
  IN_PROGRESS
  RECEIVED
  CANCELLED
}
```

with:

```prisma
enum ImportStageKind {
  IN_PROGRESS
  RECEIVED
  CANCELLED
}

enum ImportCountry {
  AR
  PY
  BR
}

model ImportProcess {
  id          String         @id @default(cuid())
  name        String         @unique
  countryCode ImportCountry?
  archivedAt  DateTime?

  stages    ImportStage[]
  orders    PurchaseOrder[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@index([archivedAt])
  @@map("import_process")
}
```

- [ ] **Step 3: Give each stage a process**

Replace:

```prisma
  isEntry    Boolean           @default(false)
  archivedAt DateTime?

  shipments Shipment[]
  events    ShipmentStageEvent[]
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  @@unique([isEntry], map: "import_stage_entry_key", where: { isEntry: true, archivedAt: null })
  @@index([archivedAt])
  @@map("import_stage")
```

with:

```prisma
  isEntry    Boolean           @default(false)
  archivedAt DateTime?
  processId  String
  process    ImportProcess     @relation(fields: [processId], references: [id])

  shipments Shipment[]
  events    ShipmentStageEvent[]
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  @@unique([processId, isEntry], map: "import_stage_entry_key", where: { isEntry: true, archivedAt: null })
  @@index([archivedAt])
  @@index([processId, position])
  @@map("import_stage")
```

- [ ] **Step 4: Give each order a process**

Replace:

```prisma
  notes        String?
  archivedAt   DateTime?

  lines     PurchaseOrderLine[]
  shipments Shipment[]
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  @@index([archivedAt])
  @@map("purchase_order")
```

with:

```prisma
  notes        String?
  archivedAt   DateTime?
  processId    String
  process      ImportProcess @relation(fields: [processId], references: [id])

  lines     PurchaseOrderLine[]
  shipments Shipment[]
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  @@index([archivedAt])
  @@index([processId])
  @@map("purchase_order")
```

- [ ] **Step 5: Write the migration by hand**

Create `packages/db/prisma/migrations/20261115120000_import_processes/migration.sql`. The order matters: the table and the default process first, then a nullable column, then the backfill, then `NOT NULL`, then the index swap and the foreign keys.

```sql
-- CreateEnum
CREATE TYPE "ImportCountry" AS ENUM ('AR', 'PY', 'BR');

-- CreateTable
CREATE TABLE "import_process" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" "ImportCountry",
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_process_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_process_name_key" ON "import_process"("name");

-- CreateIndex
CREATE INDEX "import_process_archivedAt_idx" ON "import_process"("archivedAt");

INSERT INTO "import_process" ("id", "name", "updatedAt") VALUES
  ('import_process_standard', 'Importación estándar', CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "import_stage" ADD COLUMN "processId" TEXT;

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN "processId" TEXT;

UPDATE "import_stage" SET "processId" = 'import_process_standard';

UPDATE "purchase_order" SET "processId" = 'import_process_standard';

ALTER TABLE "import_stage" ALTER COLUMN "processId" SET NOT NULL;

ALTER TABLE "purchase_order" ALTER COLUMN "processId" SET NOT NULL;

DROP INDEX "import_stage_entry_key";

CREATE UNIQUE INDEX "import_stage_entry_key" ON "import_stage"("processId", "isEntry") WHERE ("isEntry" = true AND "archivedAt" IS NULL);

-- CreateIndex
CREATE INDEX "import_stage_processId_position_idx" ON "import_stage"("processId", "position");

-- CreateIndex
CREATE INDEX "purchase_order_processId_idx" ON "purchase_order"("processId");

-- AddForeignKey
ALTER TABLE "import_stage" ADD CONSTRAINT "import_stage_processId_fkey" FOREIGN KEY ("processId") REFERENCES "import_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_processId_fkey" FOREIGN KEY ("processId") REFERENCES "import_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 6: Generate the client (no database needed)**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run db:generate`
Expected: Prisma Client generated, no validation error. If Prisma refuses `@@unique([processId, isEntry], ..., where: ...)`, stop and report the message to the owner. Do not change the index on your own.
Check: `rg -n 'ImportCountry' packages/db/src/generated/prisma/enums.ts` prints at least one line.

- [ ] **Step 7: Stop and ask the owner to apply the migration**

Tell the owner to run both commands from the repo root:
1. `bun --env-file=.env run --filter=@crm/db db:deploy` applies the migration to the `crm` database.
2. `bun --env-file=.env run db:test` applies it to the throwaway `crm_test` database.

Under `bun test`, `packages/db/src/client.ts` uses `TEST_DATABASE_URL` and never `DATABASE_URL`. Without command 2 every integration test in this plan fails with `column "processId" does not exist`.
Wait for the owner to confirm. Do not run either command yourself.

Do not commit; the owner approves commits.

---

### Task 2: Stage keys for a new process in `@crm/db`

**Files:**
- Modify: `packages/db/src/import-stage.ts`
- Create: `packages/db/src/import-process.ts`
- Create: `packages/db/test/import-process.spec.ts`
- Modify: `packages/db/package.json` (exports map)

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/import-process.spec.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	ImportStageKind,
	PipelineStageTone,
} from "../src/generated/prisma/enums";
import { IMPORT_PROCESS, keyedStages } from "../src/import-process";
import { IMPORT_STAGE } from "../src/import-stage";

const template = (name: string, position: number) => ({
	name,
	kind: ImportStageKind.IN_PROGRESS,
	tone: PipelineStageTone.INFO,
	position,
	isEntry: false,
});

describe("the fixed stages of a new process", () => {
	it("are the entry, received and cancelled stages at their positions", () => {
		expect(
			IMPORT_PROCESS.fixedStages.map((stage) => [
				stage.name,
				stage.kind,
				stage.position,
				stage.isEntry,
			]),
		).toEqual([
			["Pedido", ImportStageKind.IN_PROGRESS, IMPORT_STAGE.entryPosition, true],
			[
				"Recibido",
				ImportStageKind.RECEIVED,
				IMPORT_STAGE.fixedEndPosition,
				false,
			],
			[
				"Cancelado",
				ImportStageKind.CANCELLED,
				IMPORT_STAGE.cancelledPosition,
				false,
			],
		]);
	});
});

describe("keyed stages", () => {
	it("derives each key from the name", () => {
		expect(
			keyedStages(IMPORT_PROCESS.fixedStages, new Set()).map(
				(stage) => stage.key,
			),
		).toEqual(["PEDIDO", "RECIBIDO", "CANCELADO"]);
	});

	it("never reuses a taken key", () => {
		const [stage] = keyedStages(
			[template("Pedido", 0)],
			new Set(["PEDIDO", "PEDIDO_2"]),
		);

		expect(stage?.key).toBe("PEDIDO_3");
	});

	it("keeps two equal names of one batch apart", () => {
		expect(
			keyedStages(
				[template("Aduana", 1), template("Aduana", 2)],
				new Set(),
			).map((stage) => stage.key),
		).toEqual(["ADUANA", "ADUANA_2"]);
	});

	it("falls back to a fixed name when the name has no letter or digit", () => {
		const [stage] = keyedStages([template("!!!", 1)], new Set(["ETAPA"]));

		expect(stage?.key).toBe("ETAPA_2");
	});

	it("keeps every other field and the order", () => {
		const [first, second] = keyedStages(
			[template("Con DHL", 2), template("Costos", 3)],
			new Set(),
		);

		expect(first).toEqual({ ...template("Con DHL", 2), key: "CON_DHL" });
		expect(second).toEqual({ ...template("Costos", 3), key: "COSTOS" });
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-process.spec.ts`
Expected: FAIL with `Cannot find module '../src/import-process'`.

- [ ] **Step 3: Add the two fixed positions**

In `packages/db/src/import-stage.ts`, replace:

```ts
export const IMPORT_STAGE = {
	nameMaxLength: 40,
	firstIntermediatePosition: 1,
	fixedEndPosition: 1000,
	defaultTone: PipelineStageTone.NEUTRAL,
} as const;
```

with:

```ts
export const IMPORT_STAGE = {
	nameMaxLength: 40,
	entryPosition: 0,
	firstIntermediatePosition: 1,
	fixedEndPosition: 1000,
	cancelledPosition: 1001,
	defaultTone: PipelineStageTone.NEUTRAL,
} as const;
```

- [ ] **Step 4: Write the module**

Create `packages/db/src/import-process.ts`:

```ts
import { ImportStageKind, PipelineStageTone } from "./generated/prisma/enums";
import { IMPORT_STAGE } from "./import-stage";
import { uniqueStageKey } from "./pipeline-stage";

export type ImportStageTemplate = {
	name: string;
	kind: ImportStageKind;
	tone: PipelineStageTone;
	position: number;
	isEntry: boolean;
};

export type KeyedImportStage = ImportStageTemplate & { key: string };

export const IMPORT_PROCESS = {
	nameMaxLength: 60,
	fallbackStageName: "Etapa",
	fixedStages: [
		{
			name: "Pedido",
			kind: ImportStageKind.IN_PROGRESS,
			tone: PipelineStageTone.NEUTRAL,
			position: IMPORT_STAGE.entryPosition,
			isEntry: true,
		},
		{
			name: "Recibido",
			kind: ImportStageKind.RECEIVED,
			tone: PipelineStageTone.SUCCESS,
			position: IMPORT_STAGE.fixedEndPosition,
			isEntry: false,
		},
		{
			name: "Cancelado",
			kind: ImportStageKind.CANCELLED,
			tone: PipelineStageTone.ERROR,
			position: IMPORT_STAGE.cancelledPosition,
			isEntry: false,
		},
	],
} as const;

export function keyedStages(
	templates: readonly ImportStageTemplate[],
	taken: ReadonlySet<string>,
): KeyedImportStage[] {
	const used = new Set(taken);
	return templates.map((template) => {
		const key =
			uniqueStageKey(template.name, used) ||
			uniqueStageKey(IMPORT_PROCESS.fallbackStageName, used);
		used.add(key);
		return { ...template, key };
	});
}
```

- [ ] **Step 5: Export it**

In `packages/db/package.json`, replace:

```json
		"./import-order": "./src/import-order.ts",
```

with:

```json
		"./import-order": "./src/import-order.ts",
		"./import-process": "./src/import-process.ts",
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-process.spec.ts test/import-stage.spec.ts`
Expected: 6 and 4 tests pass.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write packages/db/src/import-stage.ts packages/db/src/import-process.ts packages/db/test/import-process.spec.ts packages/db/package.json && bunx biome check packages/db/src/import-stage.ts packages/db/src/import-process.ts packages/db/test/import-process.spec.ts packages/db/package.json`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 3: Test fixture and moves inside one process

**Files:**
- Create: `apps/api/test/import-process-fixture.ts`
- Modify: `apps/api/test/shipment-moves.integration.spec.ts`
- Modify: `apps/api/src/imports/shipment-moves.ts`

- [ ] **Step 1: Write the fixture**

Create `apps/api/test/import-process-fixture.ts`:

```ts
import { db } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_PROCESS, keyedStages } from "@crm/db/import-process";

export type TestProcess = {
	id: string;
	name: string;
	entryKey: string;
	receivedKey: string;
	cancelledKey: string;
};

type StageRef = { key: string; kind: ImportStageKind; isEntry: boolean };

function keyOf(
	stages: readonly StageRef[],
	match: (stage: StageRef) => boolean,
): string {
	const found = stages.find(match);
	if (!found) throw new Error("The test process has no such stage.");
	return found.key;
}

export async function createTestProcess(name: string): Promise<TestProcess> {
	const taken = await db.importStage.findMany({ select: { key: true } });
	const created = await db.importProcess.create({
		data: {
			name,
			stages: {
				create: keyedStages(
					IMPORT_PROCESS.fixedStages,
					new Set(taken.map((row) => row.key)),
				),
			},
		},
		select: {
			id: true,
			stages: { select: { key: true, kind: true, isEntry: true } },
		},
	});

	return {
		id: created.id,
		name,
		entryKey: keyOf(created.stages, (stage) => stage.isEntry),
		receivedKey: keyOf(
			created.stages,
			(stage) => stage.kind === ImportStageKind.RECEIVED,
		),
		cancelledKey: keyOf(
			created.stages,
			(stage) => stage.kind === ImportStageKind.CANCELLED,
		),
	};
}

export async function removeTestProcesses(
	ids: readonly string[],
): Promise<void> {
	const processIds = [...ids];
	await db.shipment.deleteMany({
		where: { order: { processId: { in: processIds } } },
	});
	await db.purchaseOrder.deleteMany({
		where: { processId: { in: processIds } },
	});
	await db.importStage.deleteMany({
		where: { processId: { in: processIds } },
	});
	await db.importProcess.deleteMany({ where: { id: { in: processIds } } });
}
```

- [ ] **Step 2: Give the moves spec its own process**

In `apps/api/test/shipment-moves.integration.spec.ts`, make these replacements.

Replace:

```ts
import { taskDueDay } from "../src/activities/task-due-date";
import {
	moveShipmentInTx,
	type ShipmentMoveInput,
} from "../src/imports/shipment-moves";
```

with:

```ts
import { IMPORT_STAGE } from "@crm/db/import-stage";
import { taskDueDay } from "../src/activities/task-due-date";
import {
	moveShipmentInTx,
	type ShipmentMoveInput,
} from "../src/imports/shipment-moves";
import { removeTestProcesses } from "./import-process-fixture";
```

Replace:

```ts
const stageKeys = {
	first: `SM_FIRST_${suffix}`,
	second: `SM_SECOND_${suffix}`,
	archived: `SM_ARCHIVED_${suffix}`,
};

let orderId: string;
let entryKey: string;
let receivedKey: string;
```

with:

```ts
const stageKeys = {
	entry: `SM_ENTRY_${suffix}`,
	first: `SM_FIRST_${suffix}`,
	second: `SM_SECOND_${suffix}`,
	archived: `SM_ARCHIVED_${suffix}`,
	received: `SM_RECEIVED_${suffix}`,
	foreign: `SM_FOREIGN_${suffix}`,
};
const entryKey = stageKeys.entry;
const receivedKey = stageKeys.received;
const processIds: string[] = [];

let orderId: string;
```

Replace (inside `beforeAll`):

```ts
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
```

with:

```ts
	const own = await db.importProcess.create({
		data: {
			name: `Movimientos ${suffix}`,
			stages: {
				create: [
					{
						key: stageKeys.entry,
						name: `Entrada ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						isEntry: true,
						position: IMPORT_STAGE.entryPosition,
					},
					{
						key: stageKeys.first,
						name: `Primera ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						position: 1,
					},
					{
						key: stageKeys.second,
						name: `Segunda ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						position: 2,
					},
					{
						key: stageKeys.archived,
						name: `Archivada ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						position: 3,
						archivedAt: new Date(),
					},
					{
						key: stageKeys.received,
						name: `Recibida ${suffix}`,
						kind: ImportStageKind.RECEIVED,
						position: IMPORT_STAGE.fixedEndPosition,
					},
				],
			},
		},
		select: { id: true },
	});
	const foreign = await db.importProcess.create({
		data: {
			name: `Movimientos ajenos ${suffix}`,
			stages: {
				create: {
					key: stageKeys.foreign,
					name: `Ajena ${suffix}`,
					kind: ImportStageKind.IN_PROGRESS,
					position: 1,
				},
			},
		},
		select: { id: true },
	});
	processIds.push(own.id, foreign.id);
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-1`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(START_DAY),
			processId: own.id,
		},
		select: { id: true },
	});
	orderId = order.id;
```

Replace:

```ts
afterAll(async () => {
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await db.importStage.deleteMany({
		where: { key: { in: Object.values(stageKeys) } },
	});
	await db.user.deleteMany({ where: { id: actorId } });
});
```

with:

```ts
afterAll(async () => {
	await removeTestProcesses(processIds);
	await db.user.deleteMany({ where: { id: actorId } });
});
```

Replace:

```ts
	it("refuses every move once the shipment is received", async () => {
```

with:

```ts
	it("refuses a stage of another process and writes nothing", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.foreign,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);

		expect((await eventsOf(id)).length).toBe(1);
		expect((await stageOf(id)).stageKey).toBe(entryKey);
	});

	it("refuses every move once the shipment is received", async () => {
```

- [ ] **Step 3: Run it and see the new test fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts`
Expected: 8 pass, 1 fail: "refuses a stage of another process and writes nothing" (the move succeeds).

- [ ] **Step 4: Keep a move inside its process**

In `apps/api/src/imports/shipment-moves.ts`, replace:

```ts
	const [shipment] = await tx.$queryRaw<
		Array<{ id: string; stageKey: string }>
	>`
		SELECT id, "stageKey"
		FROM shipment
		WHERE id = ${input.shipmentId}
		FOR UPDATE
	`;
```

with:

```ts
	const [shipment] = await tx.$queryRaw<
		Array<{ id: string; stageKey: string; processId: string }>
	>`
		SELECT s.id, s."stageKey", o."processId"
		FROM shipment s
		JOIN purchase_order o ON o.id = s."orderId"
		WHERE s.id = ${input.shipmentId}
		FOR UPDATE OF s
	`;
```

Replace:

```ts
		select: { key: true, kind: true, archivedAt: true },
```

with:

```ts
		select: { key: true, kind: true, archivedAt: true, processId: true },
```

Replace:

```ts
	if (!to || to.archivedAt) {
		throw new BadRequestException("Esa etapa no está disponible.");
	}
```

with:

```ts
	if (!to || to.archivedAt) {
		throw new BadRequestException("Esa etapa no está disponible.");
	}
	if (to.processId !== shipment.processId) {
		throw new BadRequestException("Esa etapa es de otro proceso.");
	}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts`
Expected: 9 tests pass.

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/test/import-process-fixture.ts apps/api/test/shipment-moves.integration.spec.ts apps/api/src/imports/shipment-moves.ts && bunx biome check apps/api/test/import-process-fixture.ts apps/api/test/shipment-moves.integration.spec.ts apps/api/src/imports/shipment-moves.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 4: Stages scoped to one process

**Files:**
- Modify: `apps/api/src/imports/import-stages.contracts.ts`
- Modify: `apps/api/src/imports/import-stages.service.ts` (whole file)
- Modify: `apps/api/src/imports/import-stages.router.ts`
- Modify: `apps/api/test/import-stages.integration.spec.ts`

These are the places that assume one global stage list today, and what each becomes:

| Place | Today | After |
| --- | --- | --- |
| `settings` | every stage, every shipment count | stages and counts of one process, plus `process` |
| `create` | position after every intermediate stage, name unique in the table | position and name inside the process; the key stays unique in the table |
| `update` | name unique in the table | name unique in the stage's process |
| `reorder` | locks and compares every active stage | locks and compares the stages of one process |
| `archive` | any active `IN_PROGRESS` target | an active `IN_PROGRESS` target of the same process |
| `restore` | position after every intermediate stage | position inside the stage's process |

- [ ] **Step 1: Write the contracts**

Replace the whole content of `apps/api/src/imports/import-stages.contracts.ts` with:

```ts
import {
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
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

const processIdInput = z.string().min(1);

export const importStageProcessInput = z.object({ processId: processIdInput });

export const importStageCreateInput = z.object({
	processId: processIdInput,
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
});

export const importStageUpdateInput = z.object({
	key: stageKeyInput,
	name: stageName,
	tone: z.enum(PipelineStageTone).optional(),
});

export const importStageReorderInput = z.object({
	processId: processIdInput,
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
	process: z.object({
		id: z.string(),
		name: z.string(),
		countryCode: z.enum(ImportCountry).nullable(),
		archived: z.boolean(),
	}),
	stages: z.array(importStageRowOutput),
	canManage: z.boolean(),
});

export type ImportStageProcessInput = z.infer<typeof importStageProcessInput>;
export type ImportStageCreateInput = z.infer<typeof importStageCreateInput>;
export type ImportStageUpdateInput = z.infer<typeof importStageUpdateInput>;
export type ImportStageReorderInput = z.infer<typeof importStageReorderInput>;
export type ImportStageArchiveInput = z.infer<typeof importStageArchiveInput>;
export type ImportStageKeyInput = z.infer<typeof importStageKeyInput>;
export type ImportStageSettings = z.infer<typeof importStageSettingsOutput>;
```

- [ ] **Step 2: Change the stage spec**

In `apps/api/test/import-stages.integration.spec.ts`, make these replacements.

Replace:

```ts
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
} from "@nestjs/common";
```

with:

```ts
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
```

Replace:

```ts
import { expectOutput } from "./expect-output";
```

with:

```ts
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";
```

Replace:

```ts
	settings: contract((userId: string) => service.settings(userId)),
```

with:

```ts
	settings: contract((userId: string) =>
		service.settings(userId, mainProcess.id),
	),
```

Replace:

```ts
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
```

with:

```ts
let orderId: string;
let mainProcess: TestProcess;
let otherProcess: TestProcess;

async function make(name: string, processId?: string) {
	const result = await stages.create(
		adminId,
		importStageCreateInput.parse({
			processId: processId ?? mainProcess.id,
			name: label(name),
		}),
	);
	const found = result.stages.find((stage) => stage.name === label(name));
	if (!found) throw new Error(`No stage called ${name}.`);
	return found;
}
```

Replace:

```ts
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
```

with:

```ts
	mainProcess = await createTestProcess(`Etapas ${suffix}`);
	otherProcess = await createTestProcess(`Etapas ajenas ${suffix}`);
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-1`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(START_DAY),
			processId: mainProcess.id,
		},
		select: { id: true },
	});
	orderId = order.id;
});

afterAll(async () => {
	await removeTestProcesses([mainProcess.id, otherProcess.id]);
	await db.member.deleteMany({
```

Replace:

```ts
		const result = await stages.create(
			adminId,
			importStageCreateInput.parse({ name: `Mi-etapa ${suffix}` }),
		);
		const second = result.stages.find(
			(stage) => stage.name === `Mi-etapa ${suffix}`,
		);
		if (second) createdKeys.push(second.key);
```

with:

```ts
		const result = await stages.create(
			adminId,
			importStageCreateInput.parse({
				processId: mainProcess.id,
				name: `Mi-etapa ${suffix}`,
			}),
		);
		const second = result.stages.find(
			(stage) => stage.name === `Mi-etapa ${suffix}`,
		);
```

Replace:

```ts
				importStageCreateInput.parse({
					name: label("REPETIDA").toLowerCase(),
				}),
```

with:

```ts
				importStageCreateInput.parse({
					processId: mainProcess.id,
					name: label("REPETIDA").toLowerCase(),
				}),
```

Replace:

```ts
			stages.create(adminId, importStageCreateInput.parse({ name: "!!!" })),
```

with:

```ts
			stages.create(
				adminId,
				importStageCreateInput.parse({
					processId: mainProcess.id,
					name: "!!!",
				}),
			),
```

Replace:

```ts
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
```

with:

```ts
		expect(
			importStageCreateInput.safeParse({ processId: "p", name: "  " })
				.success,
		).toBe(false);
		expect(
			importStageCreateInput.safeParse({
				processId: "p",
				name: "x".repeat(IMPORT_STAGE.nameMaxLength + 1),
			}).success,
		).toBe(false);
		expect(
			importStageCreateInput.safeParse({
				processId: "p",
				name: "Ok",
				tone: "PINK",
			}).success,
		).toBe(false);
		expect(importStageCreateInput.safeParse({ name: "Ok" }).success).toBe(
			false,
		);
```

Replace:

```ts
		try {
			await stages.reorder(adminId, { keys: reversed });
			expect(await activeIntermediateKeys()).toEqual(reversed);
		} finally {
			await stages.reorder(adminId, { keys: before });
		}

		await expect(
			stages.reorder(adminId, { keys: before.slice(1) }),
		).rejects.toBeInstanceOf(ConflictException);
```

with:

```ts
		try {
			await stages.reorder(adminId, {
				processId: mainProcess.id,
				keys: reversed,
			});
			expect(await activeIntermediateKeys()).toEqual(reversed);
		} finally {
			await stages.reorder(adminId, {
				processId: mainProcess.id,
				keys: before,
			});
		}

		await expect(
			stages.reorder(adminId, {
				processId: mainProcess.id,
				keys: before.slice(1),
			}),
		).rejects.toBeInstanceOf(ConflictException);
```

Replace:

```ts
			() => service.create(memberId, { name: label("Prohibida") }),
			() => service.update(memberId, { key: target.key, name: target.name }),
			() => service.reorder(memberId, { keys: [] }),
```

with:

```ts
			() =>
				service.create(memberId, {
					processId: mainProcess.id,
					name: label("Prohibida"),
				}),
			() => service.update(memberId, { key: target.key, name: target.name }),
			() => service.reorder(memberId, { processId: mainProcess.id, keys: [] }),
```

Replace:

```ts
describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const settings = await stages.settings(memberId);
```

with:

```ts
describe("stages of one process", () => {
	it("lists only the stages of the process", async () => {
		const mine = await make("Solo aquí");
		const theirs = await make("Solo allá", otherProcess.id);

		const { process: owner, stages: list } = await stages.settings(adminId);

		expect(owner).toEqual({
			id: mainProcess.id,
			name: mainProcess.name,
			countryCode: null,
			archived: false,
		});
		const keys = list.map((stage) => stage.key);
		expect(keys).toContain(mine.key);
		expect(keys).not.toContain(theirs.key);
	});

	it("accepts a name that another process uses", async () => {
		const mine = await make("Compartida");
		const theirs = await make("Compartida", otherProcess.id);

		expect(theirs.key).not.toBe(mine.key);
	});

	it("refuses an archive target of another process", async () => {
		const source = await make("Origen propio");
		await shipmentIn(source.key);
		const foreign = await make("Destino ajeno", otherProcess.id);

		await expect(
			stages.archive(adminId, { key: source.key, targetKey: foreign.key }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect((await row(source.key)).archived).toBe(false);
	});

	it("reports a missing process as not found", async () => {
		await expect(
			service.settings(adminId, `no-such-process-${suffix}`),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		const settings = await stages.settings(memberId);
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stages.integration.spec.ts`
Expected: FAIL. The spec sends `processId`, and the old service neither scopes by process nor returns `process`.

- [ ] **Step 4: Write the service**

Replace the whole content of `apps/api/src/imports/import-stages.service.ts` with:

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

	async settings(
		actingUserId: string,
		processId: string,
	): Promise<ImportStageSettings> {
		const [owner, rows, counts, role] = await Promise.all([
			this.db.importProcess.findUnique({
				where: { id: processId },
				select: { id: true, name: true, countryCode: true, archivedAt: true },
			}),
			this.db.importStage.findMany({
				where: { processId },
				orderBy: { position: "asc" },
			}),
			this.db.shipment.groupBy({
				by: ["stageKey"],
				where: { stage: { processId } },
				_count: { _all: true },
			}),
			workspaceRoleOf(actingUserId),
		]);
		if (!owner) {
			throw new NotFoundException("No existe un proceso con ese id.");
		}
		const perStage = new Map(
			counts.map((row) => [row.stageKey, row._count._all]),
		);

		return {
			process: {
				id: owner.id,
				name: owner.name,
				countryCode: owner.countryCode,
				archived: owner.archivedAt !== null,
			},
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
			const owner = await tx.importProcess.findUnique({
				where: { id: input.processId },
				select: { id: true },
			});
			if (!owner) {
				throw new NotFoundException("No existe un proceso con ese id.");
			}
			await this.assertNameFree(tx, input.processId, input.name);
			const taken = await tx.importStage.findMany({ select: { key: true } });
			const siblings = await tx.importStage.findMany({
				where: { processId: input.processId },
				select: { position: true, isEntry: true, kind: true },
			});
			const key = uniqueStageKey(
				input.name,
				new Set(taken.map((row) => row.key)),
			);
			if (!key) {
				throw new BadRequestException(
					"El nombre necesita al menos una letra o un número.",
				);
			}
			await tx.importStage.create({
				data: {
					key,
					processId: input.processId,
					name: input.name,
					kind: ImportStageKind.IN_PROGRESS,
					tone: input.tone ?? IMPORT_STAGE.defaultTone,
					position: nextIntermediatePosition(siblings),
				},
			});
		});

		return this.settings(actingUserId, input.processId);
	}

	async update(
		actingUserId: string,
		input: ImportStageUpdateInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		const processId = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			await this.assertNameFree(tx, stage.processId, input.name, stage.key);
			await tx.importStage.update({
				where: { key: stage.key },
				data: { name: input.name, tone: input.tone },
			});
			return stage.processId;
		});

		return this.settings(actingUserId, processId);
	}

	async reorder(
		actingUserId: string,
		input: ImportStageReorderInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`
				SELECT 1 FROM import_stage WHERE "processId" = ${input.processId} FOR UPDATE
			`;
			const active = await tx.importStage.findMany({
				where: { processId: input.processId, archivedAt: null },
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

		return this.settings(actingUserId, input.processId);
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

		const result = await this.db.$transaction(async (tx) => {
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
				await this.assertTarget(tx, input.targetKey, stage);
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

			return { processId: stage.processId, moved: shipments.length };
		});

		this.logger.log({
			message: "Import stage archived",
			stage: input.key,
			shipmentsMoved: result.moved,
		});

		return this.settings(actingUserId, result.processId);
	}

	async restore(
		actingUserId: string,
		key: string,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		const processId = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, key);
			if (!stage.archivedAt) {
				throw new ConflictException("Esa etapa no está archivada.");
			}
			const siblings = await tx.importStage.findMany({
				where: { processId: stage.processId },
				select: { position: true, isEntry: true, kind: true },
			});
			await tx.importStage.update({
				where: { key },
				data: {
					archivedAt: null,
					position: nextIntermediatePosition(siblings),
				},
			});
			return stage.processId;
		});

		return this.settings(actingUserId, processId);
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
		source: StageRecord,
	): Promise<void> {
		if (targetKey === source.key) {
			throw new BadRequestException("Elige otra etapa para los envíos.");
		}
		const target = await tx.importStage.findUnique({
			where: { key: targetKey },
		});
		if (
			!target ||
			target.processId !== source.processId ||
			target.archivedAt ||
			target.kind !== ImportStageKind.IN_PROGRESS
		) {
			throw new BadRequestException(
				"Los envíos solo pueden pasar a una etapa activa en curso del mismo proceso.",
			);
		}
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		processId: string,
		name: string,
		exceptKey?: string,
	): Promise<void> {
		const existing = await tx.importStage.findFirst({
			where: {
				processId,
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

- [ ] **Step 5: Give the settings query its input**

In `apps/api/src/imports/import-stages.router.ts`, replace:

```ts
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
```

with:

```ts
import {
	type ImportStageArchiveInput,
	type ImportStageCreateInput,
	type ImportStageKeyInput,
	type ImportStageProcessInput,
	type ImportStageReorderInput,
	type ImportStageUpdateInput,
	importStageArchiveInput,
	importStageCreateInput,
	importStageKeyInput,
	importStageProcessInput,
	importStageReorderInput,
	importStageSettingsOutput,
	importStageUpdateInput,
} from "./import-stages.contracts";
```

Replace:

```ts
	@Query({
		output: importStageSettingsOutput,
		meta: restMeta("GET", "/import-stages", TAGS),
	})
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.stages.settings(ctx.user.id);
	}
```

with:

```ts
	@Query({
		input: importStageProcessInput,
		output: importStageSettingsOutput,
		meta: restMeta("GET", "/import-stages", TAGS),
	})
	async settings(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageProcessInput,
	) {
		return this.stages.settings(ctx.user.id, input.processId);
	}
```

- [ ] **Step 6: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stages.integration.spec.ts test/shipment-moves.integration.spec.ts`
Expected: 25 and 9 tests pass.

- [ ] **Step 7: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/src/imports/import-stages.router.ts apps/api/test/import-stages.integration.spec.ts && bunx biome check apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/src/imports/import-stages.router.ts apps/api/test/import-stages.integration.spec.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 5: The process module

**Files:**
- Create: `apps/api/src/import-processes/import-processes.contracts.ts`
- Create: `apps/api/test/import-processes.integration.spec.ts`
- Create: `apps/api/src/import-processes/import-processes.service.ts`
- Create: `apps/api/src/import-processes/import-processes.router.ts`
- Create: `apps/api/src/import-processes/import-processes.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the contracts**

Create `apps/api/src/import-processes/import-processes.contracts.ts`:

```ts
import { ImportCountry } from "@crm/db/enums";
import { IMPORT_PROCESS } from "@crm/db/import-process";
import { z } from "zod";

const processName = z
	.string()
	.trim()
	.min(1, "El proceso necesita un nombre.")
	.max(
		IMPORT_PROCESS.nameMaxLength,
		`Máximo ${IMPORT_PROCESS.nameMaxLength} caracteres.`,
	);

const recordId = z.string().min(1);

const countryCode = z.enum(ImportCountry).nullable();

export const importProcessCreateInput = z.object({
	name: processName,
	countryCode,
});

export const importProcessUpdateInput = z.object({
	id: recordId,
	name: processName,
	countryCode,
});

export const importProcessDuplicateInput = z.object({
	id: recordId,
	name: processName,
});

export const importProcessIdInput = z.object({ id: recordId });

export const importProcessRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	countryCode,
	archived: z.boolean(),
	stageCount: z.number(),
	orderCount: z.number(),
	activeShipmentCount: z.number(),
});

export const importProcessListOutput = z.object({
	processes: z.array(importProcessRowOutput),
	canManage: z.boolean(),
});

export type ImportProcessCreateInput = z.infer<
	typeof importProcessCreateInput
>;
export type ImportProcessUpdateInput = z.infer<
	typeof importProcessUpdateInput
>;
export type ImportProcessDuplicateInput = z.infer<
	typeof importProcessDuplicateInput
>;
export type ImportProcessIdInput = z.infer<typeof importProcessIdInput>;
export type ImportProcessList = z.infer<typeof importProcessListOutput>;
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/test/import-processes.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import {
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
import { IMPORT_PROCESS } from "@crm/db/import-process";
import { IMPORT_STAGE } from "@crm/db/import-stage";
import { workspaceSlug } from "@crm/db/workspace";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { taskDueDay } from "../src/activities/task-due-date";
import {
	type ImportProcessCreateInput,
	type ImportProcessDuplicateInput,
	type ImportProcessList,
	type ImportProcessUpdateInput,
	importProcessCreateInput,
	importProcessListOutput,
} from "../src/import-processes/import-processes.contracts";
import { ImportProcessesService } from "../src/import-processes/import-processes.service";
import { expectOutput } from "./expect-output";
import { removeTestProcesses } from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8);
const adminId = `ip-admin-${suffix}`;
const memberId = `ip-member-${suffix}`;
const prefix = `IP${suffix.toUpperCase()}`;
const DAY = "2026-01-10";
const label = (name: string) => `${name} ${suffix}`;

const service = new ImportProcessesService(db);
const contract =
	<Args extends unknown[]>(
		call: (...args: Args) => Promise<ImportProcessList>,
	) =>
	async (...args: Args) =>
		expectOutput(importProcessListOutput, await call(...args));
const processes = {
	list: contract((userId: string) => service.list(userId)),
	create: contract((userId: string, input: ImportProcessCreateInput) =>
		service.create(userId, input),
	),
	update: contract((userId: string, input: ImportProcessUpdateInput) =>
		service.update(userId, input),
	),
	duplicate: contract((userId: string, input: ImportProcessDuplicateInput) =>
		service.duplicate(userId, input),
	),
	archive: contract((userId: string, id: string) =>
		service.archive(userId, id),
	),
	restore: contract((userId: string, id: string) =>
		service.restore(userId, id),
	),
};

const createdIds: string[] = [];
let nextNumber = 0;

function rowOf(list: ImportProcessList, name: string) {
	const found = list.processes.find((row) => row.name === name);
	if (!found) throw new Error(`No process called ${name}.`);
	return found;
}

async function make(name: string, countryCode: ImportCountry | null = null) {
	const result = await processes.create(
		adminId,
		importProcessCreateInput.parse({ name: label(name), countryCode }),
	);
	const found = rowOf(result, label(name));
	createdIds.push(found.id);
	return found;
}

function stagesOf(processId: string) {
	return db.importStage.findMany({
		where: { processId },
		orderBy: { position: "asc" },
		select: {
			key: true,
			name: true,
			kind: true,
			tone: true,
			position: true,
			isEntry: true,
			archivedAt: true,
		},
	});
}

async function orderIn(processId: string): Promise<string> {
	nextNumber += 1;
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-${nextNumber}`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(DAY),
			processId,
		},
		select: { id: true },
	});
	return order.id;
}

async function shipmentIn(orderId: string, stageKey: string): Promise<void> {
	await db.shipment.create({
		data: {
			orderId,
			stageKey,
			stageChangedAt: taskDueDay(DAY),
			events: {
				create: { stageKey, occurredAt: taskDueDay(DAY), actorId: adminId },
			},
		},
	});
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
				name: "Import Process Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Process Member",
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
});

afterAll(async () => {
	await removeTestProcesses(createdIds);
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("creating a process", () => {
	it("starts with the three fixed stages and fresh keys", async () => {
		const created = await make("Courier", ImportCountry.AR);

		expect(created).toMatchObject({
			countryCode: ImportCountry.AR,
			archived: false,
			stageCount: 3,
			orderCount: 0,
			activeShipmentCount: 0,
		});
		const stages = await stagesOf(created.id);
		expect(
			stages.map((stage) => [
				stage.name,
				stage.kind,
				stage.position,
				stage.isEntry,
			]),
		).toEqual([
			["Pedido", ImportStageKind.IN_PROGRESS, IMPORT_STAGE.entryPosition, true],
			[
				"Recibido",
				ImportStageKind.RECEIVED,
				IMPORT_STAGE.fixedEndPosition,
				false,
			],
			[
				"Cancelado",
				ImportStageKind.CANCELLED,
				IMPORT_STAGE.cancelledPosition,
				false,
			],
		]);
		expect(stages[0]?.key).toMatch(/^PEDIDO(_\d+)?$/);
	});

	it("refuses a name that exists, ignoring case", async () => {
		await make("Repetido");

		await expect(
			processes.create(adminId, {
				name: label("Repetido").toUpperCase(),
				countryCode: null,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("validates the name and the country at the boundary", () => {
		expect(
			importProcessCreateInput.safeParse({ name: "Ok", countryCode: null })
				.success,
		).toBe(true);
		expect(
			importProcessCreateInput.safeParse({ name: "  ", countryCode: null })
				.success,
		).toBe(false);
		expect(
			importProcessCreateInput.safeParse({
				name: "x".repeat(IMPORT_PROCESS.nameMaxLength + 1),
				countryCode: null,
			}).success,
		).toBe(false);
		expect(
			importProcessCreateInput.safeParse({ name: "Ok", countryCode: "CL" })
				.success,
		).toBe(false);
	});
});

describe("the entry stage", () => {
	it("allows one active entry in each process", async () => {
		const first = await make("Entrada A");
		const second = await make("Entrada B");

		expect.assertions(2);
		try {
			await db.importStage.create({
				data: {
					processId: first.id,
					key: `ENTRY_${prefix}`,
					name: label("Otra entrada"),
					kind: ImportStageKind.IN_PROGRESS,
					isEntry: true,
					position: IMPORT_STAGE.entryPosition,
				},
			});
		} catch (error) {
			expect(error).toMatchObject({ code: "P2002" });
		}
		expect(
			(await stagesOf(second.id)).filter((stage) => stage.isEntry).length,
		).toBe(1);
	});
});

describe("renaming a process", () => {
	it("renames it and changes its country", async () => {
		const created = await make("Para renombrar");

		const result = await processes.update(adminId, {
			id: created.id,
			name: label("Renombrado"),
			countryCode: ImportCountry.PY,
		});

		expect(rowOf(result, label("Renombrado"))).toMatchObject({
			id: created.id,
			countryCode: ImportCountry.PY,
		});
	});

	it("refuses the name of another process", async () => {
		const taken = await make("Ocupado");
		const created = await make("Otro para renombrar");

		await expect(
			processes.update(adminId, {
				id: created.id,
				name: taken.name,
				countryCode: null,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("duplicating a process", () => {
	it("copies the active stages with new keys and no order", async () => {
		const source = await make("Origen", ImportCountry.BR);
		await db.importStage.createMany({
			data: [
				{
					processId: source.id,
					key: `MEDIO_${prefix}`,
					name: "Con DHL",
					kind: ImportStageKind.IN_PROGRESS,
					tone: PipelineStageTone.INFO,
					position: 1,
				},
				{
					processId: source.id,
					key: `VIEJA_${prefix}`,
					name: "Vieja",
					kind: ImportStageKind.IN_PROGRESS,
					position: 2,
					archivedAt: new Date(),
				},
			],
		});
		await orderIn(source.id);

		const result = await processes.duplicate(adminId, {
			id: source.id,
			name: label("Copia"),
		});
		const copy = rowOf(result, label("Copia"));
		createdIds.push(copy.id);

		expect(copy).toMatchObject({
			countryCode: ImportCountry.BR,
			stageCount: 4,
			orderCount: 0,
		});
		const shape = (rows: Awaited<ReturnType<typeof stagesOf>>) =>
			rows.map((row) => ({
				name: row.name,
				kind: row.kind,
				tone: row.tone,
				position: row.position,
				isEntry: row.isEntry,
			}));
		const from = (await stagesOf(source.id)).filter(
			(row) => row.archivedAt === null,
		);
		const to = await stagesOf(copy.id);
		expect(shape(to)).toEqual(shape(from));
		const sourceKeys = new Set(from.map((row) => row.key));
		expect(to.some((row) => sourceKeys.has(row.key))).toBe(false);
	});

	it("refuses a name that exists", async () => {
		const source = await make("Origen repetido");

		await expect(
			processes.duplicate(adminId, { id: source.id, name: source.name }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("archiving a process", () => {
	it("refuses while a shipment is in progress and archives once it is closed", async () => {
		const created = await make("Con envío");
		const stages = await stagesOf(created.id);
		const entry = stages.find((stage) => stage.isEntry);
		const received = stages.find(
			(stage) => stage.kind === ImportStageKind.RECEIVED,
		);
		if (!entry || !received) throw new Error("Missing fixed stage.");
		const orderId = await orderIn(created.id);
		await shipmentIn(orderId, entry.key);

		expect(
			rowOf(await processes.list(adminId), created.name).activeShipmentCount,
		).toBe(1);
		await expect(
			processes.archive(adminId, created.id),
		).rejects.toBeInstanceOf(ConflictException);

		await db.shipment.updateMany({
			where: { orderId },
			data: { stageKey: received.key },
		});
		const result = await processes.archive(adminId, created.id);

		expect(rowOf(result, created.name).archived).toBe(true);
	});

	it("restores an archived process and refuses a repeated action", async () => {
		const created = await make("Para archivar");

		await processes.archive(adminId, created.id);
		await expect(
			processes.archive(adminId, created.id),
		).rejects.toBeInstanceOf(ConflictException);

		const result = await processes.restore(adminId, created.id);
		expect(rowOf(result, created.name).archived).toBe(false);
		await expect(
			processes.restore(adminId, created.id),
		).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses every write", async () => {
		expect((await processes.list(memberId)).canManage).toBe(false);
		expect((await processes.list(adminId)).canManage).toBe(true);

		const target = await make("Solo admin");
		const writes = [
			() =>
				service.create(memberId, {
					name: label("Prohibido"),
					countryCode: null,
				}),
			() =>
				service.update(memberId, {
					id: target.id,
					name: target.name,
					countryCode: null,
				}),
			() =>
				service.duplicate(memberId, {
					id: target.id,
					name: label("Copia prohibida"),
				}),
			() => service.archive(memberId, target.id),
			() => service.restore(memberId, target.id),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
	});
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-processes.integration.spec.ts`
Expected: FAIL with `Cannot find module '../src/import-processes/import-processes.service'`.

- [ ] **Step 4: Write the service**

Create `apps/api/src/import-processes/import-processes.service.ts`:

```ts
import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_PROCESS, keyedStages } from "@crm/db/import-process";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	ImportProcessCreateInput,
	ImportProcessDuplicateInput,
	ImportProcessList,
	ImportProcessUpdateInput,
} from "./import-processes.contracts";

type ProcessRecord = Prisma.ImportProcessGetPayload<object>;

@Injectable()
export class ImportProcessesService {
	private readonly logger = new Logger(ImportProcessesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(actingUserId: string): Promise<ImportProcessList> {
		const [rows, inProgress, role] = await Promise.all([
			this.db.importProcess.findMany({
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					countryCode: true,
					archivedAt: true,
					_count: {
						select: {
							orders: true,
							stages: { where: { archivedAt: null } },
						},
					},
				},
			}),
			this.db.importStage.findMany({
				where: { kind: ImportStageKind.IN_PROGRESS },
				select: { processId: true, _count: { select: { shipments: true } } },
			}),
			workspaceRoleOf(actingUserId),
		]);
		const active = new Map<string, number>();
		for (const stage of inProgress) {
			active.set(
				stage.processId,
				(active.get(stage.processId) ?? 0) + stage._count.shipments,
			);
		}

		return {
			processes: rows.map((row) => ({
				id: row.id,
				name: row.name,
				countryCode: row.countryCode,
				archived: row.archivedAt !== null,
				stageCount: row._count.stages,
				orderCount: row._count.orders,
				activeShipmentCount: active.get(row.id) ?? 0,
			})),
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ImportProcessCreateInput,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.assertNameFree(tx, input.name);
			const taken = await this.takenKeys(tx);
			await tx.importProcess.create({
				data: {
					name: input.name,
					countryCode: input.countryCode,
					stages: { create: keyedStages(IMPORT_PROCESS.fixedStages, taken) },
				},
			});
		});

		return this.list(actingUserId);
	}

	async update(
		actingUserId: string,
		input: ImportProcessUpdateInput,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await this.lock(tx, input.id);
			await this.assertNameFree(tx, input.name, input.id);
			await tx.importProcess.update({
				where: { id: input.id },
				data: { name: input.name, countryCode: input.countryCode },
			});
		});

		return this.list(actingUserId);
	}

	async duplicate(
		actingUserId: string,
		input: ImportProcessDuplicateInput,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const source = await this.lock(tx, input.id);
			await this.assertNameFree(tx, input.name);
			const steps = await tx.importStage.findMany({
				where: { processId: source.id, archivedAt: null },
				orderBy: { position: "asc" },
				select: {
					name: true,
					kind: true,
					tone: true,
					position: true,
					isEntry: true,
				},
			});
			const taken = await this.takenKeys(tx);
			await tx.importProcess.create({
				data: {
					name: input.name,
					countryCode: source.countryCode,
					stages: { create: keyedStages(steps, taken) },
				},
			});
		});

		return this.list(actingUserId);
	}

	async archive(
		actingUserId: string,
		id: string,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (found.archivedAt) {
				throw new ConflictException("Ese proceso ya está archivado.");
			}
			const active = await tx.shipment.count({
				where: {
					stage: { processId: id, kind: ImportStageKind.IN_PROGRESS },
				},
			});
			if (active > 0) {
				throw new ConflictException(
					`Hay ${active} envíos en curso en este proceso. Pásalos a una etapa de recepción o de cancelación antes de archivarlo.`,
				);
			}
			await tx.importProcess.update({
				where: { id },
				data: { archivedAt: new Date() },
			});
		});

		this.logger.log({ message: "Import process archived", process: id });

		return this.list(actingUserId);
	}

	async restore(
		actingUserId: string,
		id: string,
	): Promise<ImportProcessList> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const found = await this.lock(tx, id);
			if (!found.archivedAt) {
				throw new ConflictException("Ese proceso no está archivado.");
			}
			await tx.importProcess.update({
				where: { id },
				data: { archivedAt: null },
			});
		});

		return this.list(actingUserId);
	}

	private async lock(
		tx: Prisma.TransactionClient,
		id: string,
	): Promise<ProcessRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM import_process WHERE id = ${id} FOR UPDATE
		`;
		const found = await tx.importProcess.findUnique({ where: { id } });
		if (!found) {
			throw new NotFoundException("No existe un proceso con ese id.");
		}
		return found;
	}

	private async takenKeys(tx: Prisma.TransactionClient): Promise<Set<string>> {
		const rows = await tx.importStage.findMany({ select: { key: true } });
		return new Set(rows.map((row) => row.key));
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptId?: string,
	): Promise<void> {
		const existing = await tx.importProcess.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				id: exceptId ? { not: exceptId } : undefined,
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`Ya existe un proceso llamado ${name}.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar los procesos de importación.",
			);
		}
	}
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-processes.integration.spec.ts`
Expected: 11 tests pass.

- [ ] **Step 6: Write the router**

Create `apps/api/src/import-processes/import-processes.router.ts`:

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
	type ImportProcessCreateInput,
	type ImportProcessDuplicateInput,
	type ImportProcessIdInput,
	type ImportProcessUpdateInput,
	importProcessCreateInput,
	importProcessDuplicateInput,
	importProcessIdInput,
	importProcessListOutput,
	importProcessUpdateInput,
} from "./import-processes.contracts";
import { ImportProcessesService } from "./import-processes.service";

const TAGS = ["Import processes"];

@Router({ alias: "importProcesses" })
@UseMiddlewares(AuthMiddleware)
export class ImportProcessesRouter {
	constructor(
		@Inject(ImportProcessesService)
		private readonly processes: ImportProcessesService,
	) {}

	@Query({
		output: importProcessListOutput,
		meta: restMeta("GET", "/import-processes", TAGS),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.processes.list(ctx.user.id);
	}

	@Mutation({
		input: importProcessCreateInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessCreateInput,
	) {
		return this.processes.create(ctx.user.id, input);
	}

	@Mutation({
		input: importProcessUpdateInput,
		output: importProcessListOutput,
		meta: restMeta("PATCH", "/import-processes/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessUpdateInput,
	) {
		return this.processes.update(ctx.user.id, input);
	}

	@Mutation({
		input: importProcessDuplicateInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes/{id}/duplicate", TAGS),
	})
	async duplicate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessDuplicateInput,
	) {
		return this.processes.duplicate(ctx.user.id, input);
	}

	@Mutation({
		input: importProcessIdInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessIdInput,
	) {
		return this.processes.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: importProcessIdInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessIdInput,
	) {
		return this.processes.restore(ctx.user.id, input.id);
	}
}
```

- [ ] **Step 7: Write the module**

Create `apps/api/src/import-processes/import-processes.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportProcessesRouter } from "./import-processes.router";
import { ImportProcessesService } from "./import-processes.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportProcessesService, ImportProcessesRouter],
})
export class ImportProcessesModule {}
```

- [ ] **Step 8: Register the module**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/app.module.ts`
Expected: no output. If there is output, stop and ask the owner.

In `apps/api/src/app.module.ts`, replace:

```ts
import { ImportOrdersModule } from "./import-orders/import-orders.module";
```

with:

```ts
import { ImportOrdersModule } from "./import-orders/import-orders.module";
import { ImportProcessesModule } from "./import-processes/import-processes.module";
```

Replace:

```ts
		ImportsModule,
		ImportOrdersModule,
```

with:

```ts
		ImportsModule,
		ImportOrdersModule,
		ImportProcessesModule,
```

- [ ] **Step 9: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/src/import-processes/import-processes.contracts.ts apps/api/src/import-processes/import-processes.service.ts apps/api/src/import-processes/import-processes.router.ts apps/api/src/import-processes/import-processes.module.ts apps/api/src/app.module.ts apps/api/test/import-processes.integration.spec.ts && bunx biome check apps/api/src/import-processes/import-processes.contracts.ts apps/api/src/import-processes/import-processes.service.ts apps/api/src/import-processes/import-processes.router.ts apps/api/src/import-processes/import-processes.module.ts apps/api/src/app.module.ts apps/api/test/import-processes.integration.spec.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 6: The process of an order

**Files:**
- Modify: `apps/api/src/import-orders/import-orders.contracts.ts`
- Modify: `apps/api/test/import-orders.integration.spec.ts`
- Modify: `apps/api/src/import-orders/import-orders.service.ts`

- [ ] **Step 1: Change the contracts**

In `apps/api/src/import-orders/import-orders.contracts.ts`, replace:

```ts
import { ImportStageKind, PipelineStageTone } from "@crm/db/enums";
```

with:

```ts
import {
	ImportCountry,
	ImportStageKind,
	PipelineStageTone,
} from "@crm/db/enums";
```

Replace:

```ts
	orderedAt: taskDueDayInput,
	notes: text(IMPORT_ORDER.notesMaxLength),
	lines: z
		.array(importOrderLineInput)
```

with:

```ts
	orderedAt: taskDueDayInput,
	notes: text(IMPORT_ORDER.notesMaxLength),
	processId: recordId,
	lines: z
		.array(importOrderLineInput)
```

Replace:

```ts
	notes: z.string().nullable(),
	archivedAt: z.string().nullable(),
	lines: z.array(orderLineOutput),
```

with:

```ts
	notes: z.string().nullable(),
	archivedAt: z.string().nullable(),
	process: z.object({
		id: z.string(),
		name: z.string(),
		archived: z.boolean(),
	}),
	lines: z.array(orderLineOutput),
```

Replace:

```ts
	deals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			companyName: z.string(),
		}),
	),
});
```

with:

```ts
	deals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			companyName: z.string(),
		}),
	),
	processes: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			countryCode: z.enum(ImportCountry).nullable(),
		}),
	),
});
```

- [ ] **Step 2: Change the order spec**

In `apps/api/test/import-orders.integration.spec.ts`, make these replacements.

Replace:

```ts
import { expectOutput } from "./expect-output";
```

with:

```ts
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";
```

Replace:

```ts
let entryKey: string;
let receivedKey: string;
let cancelledKey: string;
```

with:

```ts
let mainProcess: TestProcess;
let otherProcess: TestProcess;
let closedProcess: TestProcess;
let entryKey: string;
let receivedKey: string;
let cancelledKey: string;
```

Replace:

```ts
		orderedAt: ORDER_DAY,
		notes: "",
		lines: lines.map((line) => ({
```

with:

```ts
		orderedAt: ORDER_DAY,
		notes: "",
		processId: mainProcess.id,
		lines: lines.map((line) => ({
```

Replace:

```ts
function headerOf(order: ImportOrderDetail) {
	return {
		id: order.id,
		number: order.number,
		supplierName: order.supplierName,
		orderedAt: order.orderedAt,
		notes: "",
	};
}
```

with:

```ts
function headerOf(order: ImportOrderDetail) {
	return {
		id: order.id,
		number: order.number,
		supplierName: order.supplierName,
		orderedAt: order.orderedAt,
		notes: "",
		processId: order.process.id,
	};
}

function sameLines(order: ImportOrderDetail) {
	return order.lines.map((line) => ({
		id: line.id,
		productId: line.productId,
		quantity: line.quantity,
		unitCostCents: line.unitCostCents,
		dealId: line.dealId,
	}));
}

async function setArchived(id: string, archived: boolean) {
	await db.importProcess.update({
		where: { id },
		data: { archivedAt: archived ? new Date() : null },
	});
}
```

Replace:

```ts
	const [entry, received, cancelled, openStage, wonStage] = await Promise.all([
		db.importStage.findFirstOrThrow({
			where: { isEntry: true, archivedAt: null },
			select: { key: true },
		}),
		db.importStage.findFirstOrThrow({
			where: { kind: ImportStageKind.RECEIVED, archivedAt: null },
			select: { key: true },
		}),
		db.importStage.findFirstOrThrow({
			where: { kind: ImportStageKind.CANCELLED, archivedAt: null },
			select: { key: true },
		}),
		db.pipelineStage.findFirstOrThrow({
```

with:

```ts
	mainProcess = await createTestProcess(`Pedidos ${suffix}`);
	otherProcess = await createTestProcess(`Pedidos ajenos ${suffix}`);
	closedProcess = await createTestProcess(`Pedidos cerrados ${suffix}`);
	entryKey = mainProcess.entryKey;
	receivedKey = mainProcess.receivedKey;
	cancelledKey = mainProcess.cancelledKey;
	const [openStage, wonStage] = await Promise.all([
		db.pipelineStage.findFirstOrThrow({
```

Replace:

```ts
	entryKey = entry.key;
	receivedKey = received.key;
	cancelledKey = cancelled.key;
	openStageKey = openStage.key;
```

with:

```ts
	openStageKey = openStage.key;
```

Replace:

```ts
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
```

with:

```ts
	await db.purchaseOrder.deleteMany({
		where: { number: { startsWith: prefix } },
	});
	await removeTestProcesses([
		mainProcess.id,
		otherProcess.id,
		closedProcess.id,
	]);
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
```

Replace:

```ts
describe("picker options", () => {
	it("offers active products and open deals only", async () => {
```

with:

```ts
describe("the process of an order", () => {
	it("shows the process and only its active stages", async () => {
		const order = await orderWith(1);
		const own = await db.importStage.findMany({
			where: { processId: mainProcess.id, archivedAt: null },
			orderBy: { position: "asc" },
			select: { key: true },
		});

		expect(order.process).toEqual({
			id: mainProcess.id,
			name: mainProcess.name,
			archived: false,
		});
		expect(order.stages.map((stage) => stage.key)).toEqual(
			own.map((stage) => stage.key),
		);
	});

	it("starts a shipment in the entry stage of the order's process", async () => {
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 2 }], { processId: otherProcess.id }),
		);

		const shipment = lastShipment(await ship(order, 1));

		expect(shipment.stage.key).toBe(otherProcess.entryKey);
	});

	it("changes the process until the first shipment", async () => {
		const order = await orderWith(2);

		const moved = await orders.update(adminId, {
			...headerOf(order),
			processId: otherProcess.id,
			lines: sameLines(order),
		});
		expect(moved.process.id).toBe(otherProcess.id);
		await ship(moved, 1);

		await expect(
			orders.update(adminId, {
				...headerOf(moved),
				processId: mainProcess.id,
				lines: sameLines(moved),
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await orders.detail(adminId, order.id)).process.id).toBe(
			otherProcess.id,
		);
	});

	it("refuses a move to a stage of another process", async () => {
		const order = await orderWith(1);
		const shipment = lastShipment(await ship(order, 1));

		await expect(
			orders.moveShipment(adminId, {
				shipmentId: shipment.id,
				targetKey: otherProcess.receivedKey,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived process for a new order and a new shipment", async () => {
		const order = await orders.create(
			adminId,
			orderInput([{ quantity: 2 }], { processId: closedProcess.id }),
		);
		await setArchived(closedProcess.id, true);
		try {
			await expect(
				orders.create(
					adminId,
					orderInput([{ quantity: 1 }], { processId: closedProcess.id }),
				),
			).rejects.toBeInstanceOf(ConflictException);
			await expect(ship(order, 1)).rejects.toBeInstanceOf(ConflictException);
			const kept = await orders.update(adminId, {
				...headerOf(order),
				notes: "Sigue en su proceso",
				lines: sameLines(order),
			});
			expect(kept.process).toEqual({
				id: closedProcess.id,
				name: closedProcess.name,
				archived: true,
			});
		} finally {
			await setArchived(closedProcess.id, false);
		}
	});

	it("refuses a process that does not exist", async () => {
		await expect(
			orders.create(
				adminId,
				orderInput([{ quantity: 1 }], {
					processId: `no-such-process-${suffix}`,
				}),
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});

describe("picker options", () => {
	it("offers active processes only", async () => {
		await setArchived(closedProcess.id, true);
		try {
			const options = await orders.options();

			expect(options.processes).toContainEqual({
				id: mainProcess.id,
				name: mainProcess.name,
				countryCode: null,
			});
			expect(options.processes.map((item) => item.id)).not.toContain(
				closedProcess.id,
			);
		} finally {
			await setArchived(closedProcess.id, false);
		}
	});

	it("offers active products and open deals only", async () => {
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: FAIL. The old service writes no `processId`, and the detail has no `process`.

- [ ] **Step 4: Change the service**

In `apps/api/src/import-orders/import-orders.service.ts`, make these replacements.

Replace:

```ts
	notes: true,
	archivedAt: true,
	lines: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
```

with:

```ts
	notes: true,
	archivedAt: true,
	process: {
		select: {
			id: true,
			name: true,
			archivedAt: true,
			stages: {
				where: { archivedAt: null },
				orderBy: { position: "asc" },
				select: STAGE_SELECT,
			},
		},
	},
	lines: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
```

Replace:

```ts
type LockedOrder = { id: string; orderedAt: Date; archivedAt: Date | null };
```

with:

```ts
type LockedOrder = {
	id: string;
	orderedAt: Date;
	archivedAt: Date | null;
	processId: string;
};
```

Replace:

```ts
		const [products, deals] = await Promise.all([
```

with:

```ts
		const [products, deals, processes] = await Promise.all([
```

Replace:

```ts
				select: { id: true, name: true, company: { select: { name: true } } },
			}),
		]);
```

with:

```ts
				select: { id: true, name: true, company: { select: { name: true } } },
			}),
			this.db.importProcess.findMany({
				where: { archivedAt: null },
				orderBy: { name: "asc" },
				select: { id: true, name: true, countryCode: true },
			}),
		]);
```

Replace:

```ts
				companyName: deal.company.name,
			})),
		};
	}
```

with:

```ts
				companyName: deal.company.name,
			})),
			processes,
		};
	}
```

Replace:

```ts
		const [order, stages, role] = await Promise.all([
			this.db.purchaseOrder.findUnique({
				where: { id },
				select: DETAIL_SELECT,
			}),
			this.db.importStage.findMany({
				where: { archivedAt: null },
				orderBy: { position: "asc" },
				select: STAGE_SELECT,
			}),
			workspaceRoleOf(actingUserId),
		]);
```

with:

```ts
		const [order, role] = await Promise.all([
			this.db.purchaseOrder.findUnique({
				where: { id },
				select: DETAIL_SELECT,
			}),
			workspaceRoleOf(actingUserId),
		]);
```

Replace:

```ts
			notes: order.notes,
			archivedAt: order.archivedAt?.toISOString() ?? null,
			lines: order.lines.map((line) => {
```

with:

```ts
			notes: order.notes,
			archivedAt: order.archivedAt?.toISOString() ?? null,
			process: {
				id: order.process.id,
				name: order.process.name,
				archived: order.process.archivedAt !== null,
			},
			lines: order.lines.map((line) => {
```

Replace:

```ts
			stages,
			canManage: canManageInventory(role),
```

with:

```ts
			stages: order.process.stages,
			canManage: canManageInventory(role),
```

Replace:

```ts
			this.db.$transaction(async (tx) => {
				await this.assertReferences(
					tx,
					input.lines.map((line) => line.productId),
```

with:

```ts
			this.db.$transaction(async (tx) => {
				await this.assertProcessOpen(tx, input.processId);
				await this.assertReferences(
					tx,
					input.lines.map((line) => line.productId),
```

Replace:

```ts
						number: input.number,
						supplierName: input.supplierName,
						orderedAt,
						notes: blankToNull(input.notes),
						lines: { create: input.lines.map(lineData) },
```

with:

```ts
						number: input.number,
						supplierName: input.supplierName,
						orderedAt,
						notes: blankToNull(input.notes),
						processId: input.processId,
						lines: { create: input.lines.map(lineData) },
```

Replace:

```ts
				await this.lockOpenOrder(tx, input.id);
				const existing = await tx.purchaseOrderLine.findMany({
```

with:

```ts
				const order = await this.lockOpenOrder(tx, input.id);
				if (input.processId !== order.processId) {
					const shipments = await tx.shipment.count({
						where: { orderId: input.id },
					});
					if (shipments > 0) {
						throw new ConflictException(
							"La orden ya tiene envíos. No se puede cambiar el proceso.",
						);
					}
					await this.assertProcessOpen(tx, input.processId);
				}
				const existing = await tx.purchaseOrderLine.findMany({
```

Replace:

```ts
						orderedAt,
						notes: blankToNull(input.notes),
					},
				});
```

with:

```ts
						orderedAt,
						notes: blankToNull(input.notes),
						processId: input.processId,
					},
				});
```

Replace:

```ts
			const entry = await tx.importStage.findFirst({
				where: { isEntry: true, archivedAt: null },
				select: { key: true },
			});
```

with:

```ts
			await this.assertProcessOpen(tx, order.processId);
			const entry = await tx.importStage.findFirst({
				where: {
					processId: order.processId,
					isEntry: true,
					archivedAt: null,
				},
				select: { key: true },
			});
```

Replace:

```ts
			SELECT id, "orderedAt", "archivedAt"
			FROM purchase_order
```

with:

```ts
			SELECT id, "orderedAt", "archivedAt", "processId"
			FROM purchase_order
```

Replace:

```ts
	private async assertReferences(
```

with:

```ts
	private async assertProcessOpen(
		tx: Prisma.TransactionClient,
		processId: string,
	): Promise<void> {
		await tx.$queryRaw`
			SELECT 1 FROM import_process WHERE id = ${processId} FOR SHARE
		`;
		const found = await tx.importProcess.findUnique({
			where: { id: processId },
			select: { archivedAt: true },
		});
		if (!found) {
			throw new BadRequestException("El proceso elegido no existe.");
		}
		if (found.archivedAt) {
			throw new ConflictException(
				"El proceso está archivado. Restáuralo o elige otro proceso.",
			);
		}
	}

	private async assertReferences(
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-orders.integration.spec.ts`
Expected: 32 tests pass (25 before, 7 new).

- [ ] **Step 6: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/api/test/import-orders.integration.spec.ts && bunx biome check apps/api/src/import-orders/import-orders.contracts.ts apps/api/src/import-orders/import-orders.service.ts apps/api/test/import-orders.integration.spec.ts`
Expected: no errors.

Do not commit; the owner approves commits.

---

### Task 7: Router file and API verification

- [ ] **Step 1: Regenerate the router file**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected: no output. If there is output, stop and ask the owner.

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`
Check: `rg -n 'importProcesses' apps/api/src/generated/server.ts` (from the repo root) prints at least one line.

- [ ] **Step 2: Type check the API and the database package**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=@crm/db`
Expected: no errors. `bun run check-types --filter=app` fails until part 2 is done. Do not fix the app in this part.

- [ ] **Step 3: Lint**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run lint:slop`
Expected: no finding in a file this part touched. A finding in a file of the other session is reported to the owner, not fixed. Do not use `--no-verify`.

- [ ] **Step 4: Run every test of this part**

Run each:
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun test test/import-process.spec.ts test/import-stage.spec.ts test/import-order.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/shipment-moves.integration.spec.ts test/import-stages.integration.spec.ts test/import-processes.integration.spec.ts test/import-orders.integration.spec.ts`
- `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/products.integration.spec.ts test/pipeline-stages.integration.spec.ts`

Expected: all green. API counts: 9, 25, 11 and 32.

- [ ] **Step 5: Check for leftover rows in `crm_test`**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/packages/db && bun --env-file=../../.env -e 'import pg from "pg"; const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect(); const processes = await client.query("SELECT id, name FROM import_process WHERE id <> $1", ["import_process_standard"]); const stages = await client.query("SELECT key FROM import_stage WHERE \"processId\" <> $1", ["import_process_standard"]); const orders = await client.query("SELECT number FROM purchase_order"); console.log(processes.rows, stages.rows, orders.rows); await client.end();'`
Expected: `[] [] []`. Any row means a spec did not clean up. Report it to the owner with the row names. Do not delete rows by hand without the owner's OK. Run this step after every failed run too.

- [ ] **Step 6: Hand over to part 2**

Tell the owner: part 1 is done, these tests pass, and part 2 (`docs/superpowers/plans/2026-11-15-import-processes-a1-screens.md`) is next. The app does not type check until part 2 is done.

Do not commit; the owner approves commits.

---

## Self-review

**A1 coverage (part 1).**

| Requirement | Where |
| --- | --- |
| `ImportProcess` entity: unique name, optional country `AR`/`PY`/`BR`, `archivedAt` | Task 1 Steps 2 and 5 |
| `processId` on `ImportStage` and `PurchaseOrder`, required | Task 1 Steps 3, 4 and 5 |
| Migration with the default process "Importación estándar", nothing deleted | Task 1 Step 5 |
| Entry index: one active entry per process | Task 1 Steps 3 and 5, Task 5 test "allows one active entry in each process" |
| `key` global and immutable, no foreign key change | Decision 1, Task 2 `keyedStages`, Task 4 `create` |
| A new process starts with the three fixed stages | Task 2 `IMPORT_PROCESS.fixedStages`, Task 5 `create`, test "starts with the three fixed stages" |
| Duplicate copies stages with new keys, no orders | Task 5 `duplicate`, test "copies the active stages" |
| Rename, archive (refused with an in-progress shipment), restore | Task 5 service and tests |
| Step editor scoped to one process | Task 4 service, router and tests |
| Archive target of a stage inside the same process | Task 4 `assertTarget`, test "refuses an archive target of another process" |
| A shipment moves only inside its process | Task 3 `moveShipmentInTx`, Task 3 and Task 6 tests |
| The order picks a process, required, locked after the first shipment | Task 6 contracts and `update`, test "changes the process until the first shipment" |
| `createShipment` uses the entry stage of the order's process | Task 6 `createShipment`, test "starts a shipment in the entry stage" |
| An archived process cannot be picked for a new order | Task 6 `assertProcessOpen`, options, tests |
| Permissions: `canManageInventory` on every write | Task 5 `requireManager`, test "permissions" |
| `expectOutput` on every new procedure | Task 5 `contract` wraps all six calls; Task 6 `orders` wraps `options` and `detail` |
| Owner runs `db:deploy` and `db:test` | Task 1 Step 7 |
| Settings screen, order form, nav, docs, browser checklist | Part 2 |

**Existing tests this part edits.**
- `apps/api/test/shipment-moves.integration.spec.ts`: own processes instead of the global entry and received stages; one new test.
- `apps/api/test/import-stages.integration.spec.ts`: own processes; `processId` on create and reorder; cleanup through the fixture; four new tests.
- `apps/api/test/import-orders.integration.spec.ts`: own processes; `processId` in `orderInput` and `headerOf`; cleanup through the fixture; seven new tests.
- `packages/db/test/import-stage.spec.ts` is not edited. It still passes with the two new `IMPORT_STAGE` fields.

**Placeholder scan.** No step says "similar to", "TODO" or "add the rest". Every code step holds the whole file or the exact old and new text.

**Name consistency across tasks.**
- `IMPORT_PROCESS`, `keyedStages`, `ImportStageTemplate` (Task 2) are the names Tasks 3 and 5 import.
- `IMPORT_STAGE.entryPosition` and `IMPORT_STAGE.cancelledPosition` (Task 2) are the names Tasks 3 and 5 read.
- `createTestProcess`, `removeTestProcesses`, `TestProcess` (Task 3) are the names Tasks 4, 5 and 6 import.
- `ImportProcessesService` methods `list`, `create`, `update`, `duplicate`, `archive`, `restore` (Task 5) match the router procedures and part 2's `trpc.importProcesses.<name>` calls.
- `importStages.settings` takes `{ processId }`; `importStages.create` and `importStages.reorder` take `processId` (Task 4). Part 2 sends these.
- The order detail field is `process` with `id`, `name`, `archived` (Task 6). The options field is `processes` with `id`, `name`, `countryCode` (Task 6). Part 2 reads these names.

**Known risks.**
- Two writers that create a process named *Courier* and one named *courier* at the same moment both pass the case-insensitive check. The plain unique index allows both.
- Two key writers at the same moment can pick the same new key. The second insert fails with `P2002` and the user sees a generic error. Open question 3.
- The migration was written by hand. No step compares it with the schema. A name mismatch shows up as drift on the next `prisma migrate dev` of the owner.
- `trpc:generate` writes the whole `generated/server.ts`. A procedure that the other session added in its working tree also lands in this file.
- The leftover check in Task 7 Step 5 counts every `purchase_order` row in `crm_test`. A spec of another session that leaves an order fails that check too.
