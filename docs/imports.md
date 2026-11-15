# Imports — read when touching import processes, stages, purchase orders or shipments

The specs are `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md` and
`docs/superpowers/specs/2026-11-15-import-processes-design.md`. This page holds the rules
the code depends on.

## Shape

- `PurchaseOrder` has `PurchaseOrderLine`s: a product, a quantity, a unit cost in USD
  (`Decimal(14,2)`, `unitCostCents` on the wire) and an optional deal.
- The server writes `PurchaseOrder.number` as `OC-<year>-<seq>` (`formatOrderNumber`).
  The year is the UTC year of the creation day. The sequence restarts each year and
  has four digits at least. No input carries it and an update never changes it.
  `create` takes `pg_advisory_xact_lock` first, so two creates never read the same
  last number.
- A `Shipment` carries part of one order. `ShipmentLine` says how many units of each
  order line it carries. One order of 10 can ship as 4, 4 and 2.
- `ShipmentStageEvent` is one stage change with a calendar day. `Shipment.stageKey`
  and `stageChangedAt` always equal the latest event.
- `ImportStage` keys never change. Code reads `kind` (`IN_PROGRESS`, `RECEIVED`,
  `CANCELLED`), never `name`.
- `ImportProcess` is a named list of stages, with an optional country (`AR`, `PY`, `BR`)
  that is only a label. Every stage and every order has one `processId`.

## Processes

- A stage `key` is unique in the whole table, not per process. `keyedStages` in
  `packages/db/src/import-process.ts` gives new keys: it reads every key in the table
  and adds a suffix (`PEDIDO_2`). A key never changes, so `Shipment.stageKey` and
  `ShipmentStageEvent.stageKey` need no process column.
- A stage name is unique in its process, ignoring case. A process name is unique,
  ignoring case.
- Each process has one active entry stage (`import_stage_entry_key` on
  `("processId", "isEntry")`), one received and one cancelled stage. A new process
  starts with *Pedido*, *Recibido* and *Cancelado* (`IMPORT_PROCESS.fixedStages`).
- Duplicate copies the active stages with new keys and the country. It copies no
  order.
- A shipment moves only between the stages of its order's process
  (`moveShipmentInTx`). A stage archive moves its shipments only inside the process.
- An order changes its process only while it has no shipment.
- An archived process cannot be picked by an order and refuses new shipments. It
  cannot be archived while a shipment is in an `IN_PROGRESS` stage. `archive` locks the
  `import_process` row `FOR UPDATE`; order writes and `createShipment` lock it
  `FOR SHARE` (`assertProcessOpen`).
- The migration created "Importación estándar" (`import_process_standard`) and gave it
  every stage and order that existed.

## Modules

- `apps/api/src/import-processes`: the process list (`importProcesses`).
- `apps/api/src/imports`: the stages of one process (`importStages`) and
  `moveShipmentInTx`.
- `apps/api/src/import-orders`: orders, shipments and moves (`importOrders`).
- `packages/db/src/import-stage.ts`, `packages/db/src/import-process.ts` and
  `packages/db/src/import-order.ts`: limits (`IMPORT_STAGE`, `IMPORT_PROCESS`,
  `IMPORT_ORDER`) and pure rules. The app imports these subpaths. They import only
  generated enums and each other, so a client component may use them.
- Integration specs create their own process with
  `apps/api/test/import-process-fixture.ts` and remove it in foreign key order. No spec
  reads the default process.

## Days

- A stage day is `"YYYY-MM-DD"` on the wire and `00:00 UTC` in the database.
- "Today" is the UTC day (`TASKS.day.timeZone`).
- A day is never after today. A move is never before the previous event.
- A new shipment never starts before the order day. An order edit never moves the
  order day after the first event.
- A closed shipment (`RECEIVED` or `CANCELLED`) never moves again.
- A move to the current stage or to an archived stage is refused.
- Lead times are computed on read by `withLeadTimes` and `receivedAfterDays`. Nothing
  is stored. The open stage counts until today. A closed stage has no count.

## Quantities

- For each order line, the sum of its shipment lines never passes the ordered
  quantity. `lineProgress` computes shipped, received and remaining.
- A cancelled shipment does not count toward shipped (`countsTowardOrdered`). The
  ordered quantity does not change. The cancelled units can ship again.
- Nothing is stored for received quantity. "Recibido" means the whole shipment arrived.
- Received is the sum of shipment lines in a `RECEIVED` stage. The screen shows it over
  the ordered quantity ("4 de 10"). A short or extra delivery is not stored. Phase 4
  corrects it with an `ADJUST` movement.
- **Every writer of shipment lines or of existing order lines locks the
  `purchase_order` row `FOR UPDATE` first** (`lockOpenOrder`). Two writers on one
  order run one after the other, and the second reads what the first committed. A new
  writer must take the same lock before it reads a quantity. The two-writers test in
  `apps/api/test/import-orders.integration.spec.ts` fails without it.
- A stage move locks the `shipment` row, not the order row. It writes no line.
- Never call `Promise.all` on the transaction client.

## Lines and deals

- A line with any shipment line keeps its product and cannot be removed. Its quantity
  never goes below what shipped.
- A new or changed deal link needs an active deal in an `OPEN` stage
  (`OPEN_STAGE_FILTER`). A link that exists survives the deal closing.
- A new or changed product needs an active product.

## Archive and permissions

- Archiving an order is a bare `archivedAt` update. An archived order refuses edits
  and new shipments. Its shipments still move.
- Writes need `canManageInventory(role)` (owner and admin). Members read. The list and
  the detail output carry `canManage` so the screen disables its controls.

## Screen

- `/imports`: `orders-table.tsx`, `order-detail-sheet.tsx`, `order-form-sheet.tsx`,
  `shipment-dialogs.tsx`. Parsing and labels are in `apps/app/lib/import-orders.ts`.
- `/settings/import-processes`: the process list. `/settings/import-processes/[processId]`:
  the stage editor of one process. Helpers are in
  `apps/app/lib/import-process-settings.ts` and `apps/app/lib/import-stage-settings.ts`.
- The order form has a required *Proceso* field. With one active process it is already
  chosen. It is locked after the first shipment.
- Every mutation returns the full order and calls `cache.importOrders()`, which also
  refreshes the stage and process counts in settings. Process writes call
  `cache.importProcesses()`.
