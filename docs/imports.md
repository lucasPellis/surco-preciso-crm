# Imports — read when touching import stages, purchase orders or shipments

The spec is `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`. This page
holds the rules the code depends on.

## Shape

- `PurchaseOrder` has `PurchaseOrderLine`s: a product, a quantity, a unit cost in USD
  (`Decimal(14,2)`, `unitCostCents` on the wire) and an optional deal.
- A `Shipment` carries part of one order. `ShipmentLine` says how many units of each
  order line it carries. One order of 10 can ship as 4, 4 and 2.
- `ShipmentStageEvent` is one stage change with a calendar day. `Shipment.stageKey`
  and `stageChangedAt` always equal the latest event.
- `ImportStage` keys never change. Code reads `kind` (`IN_PROGRESS`, `RECEIVED`,
  `CANCELLED`), never `name`.

## Modules

- `apps/api/src/imports`: the stage list (`importStages`) and `moveShipmentInTx`.
- `apps/api/src/import-orders`: orders, shipments and moves (`importOrders`).
- `packages/db/src/import-stage.ts` and `packages/db/src/import-order.ts`: limits
  (`IMPORT_STAGE`, `IMPORT_ORDER`) and pure rules. The app imports these subpaths.
  They import only generated enums, so a client component may use them.

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
- Every mutation returns the full order and calls `cache.importOrders()`, which also
  refreshes the stage counts in settings.
