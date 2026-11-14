# Product lifecycle — design

Date: 2026-11-14. Status: approved by the user, not built.

Replaces the *Importación* track of Step 4 in `docs/plan/surco-preciso-flow.md`.

## Goal

Track a product from the catalog, through import, into stock, to the sale. Record the
time between import stages, the documents of each stage, every payment in the currency
paid, and the real cost per unit in USD.

## Out of scope

- Sale price and quotes. They belong to Phase 2.
- Serial numbers. The lifecycle is tracked by movements with a quantity.
- A Supplier entity. The supplier is free text on the order.
- Required documents per stage. Documents are free.
- Automatic stock exit when a deal reaches *Ganado*. The deal has no products yet.
- Custom fields on products.

## Build order

| Phase | Delivers |
| --- | --- |
| 1. Catalog | `Product`, its screen, archive |
| 2. Orders and shipments | Import stages, order, lines, shipments, stage events with date, documents with labels, lead-time view |
| 3. Payments and real cost | `Payment`, payment concepts, editable rate, exchange factor, cost per unit |
| 4. Stock | Movements, balance, reservation, exits with deal and sales invoice |

Payments come before stock. A stock exit stores a snapshot of the unit cost.

Each phase has its own plan and its own migration. The user applies migrations with
`bun --env-file=.env run --filter=@crm/db db:deploy`.

## Data model

All names are tables unless marked as a list. Money columns follow `docs/currency.md`.

**Catalog**

- `Product`: `sku` (unique), `name`, `brand`, `category`, `description`, `imageUrl`
  (optional), `referenceCostUsd`, `archivedAt`.

**Import**

- `ImportStage` (list): `key` (immutable), `name`, `kind` (`IN_PROGRESS`, `RECEIVED`,
  `CANCELLED`), `position`, `archivedAt`. Same rules as `PipelineStage`.
- `PurchaseOrder`: `number`, `supplierName`, `orderedAt`, `notes`.
- `PurchaseOrderLine`: `orderId`, `productId`, `quantity`, `unitCostUsd` (list price),
  `dealId` (optional).
- `Shipment`: `orderId`, `reference`, `trackingNumber`, `stageId` (current stage).
- `ShipmentLine`: `shipmentId`, `orderLineId`, `quantity`.
- `ShipmentStageEvent`: `shipmentId`, `stageId`, `occurredAt` (editable), `actorId`.
- `DocumentLabel` (list): `name`, `archivedAt`.
- `Attachment`: `pathname`, `filename`, `contentType`, `size`, `labelId` (optional),
  `uploadedById`, and exactly one of `shipmentStageEventId` or `stockMovementId`.

**Payments**

- `PaymentConcept` (list): `name`, `archivedAt`.
- `Payment`: `conceptId`, exactly one of `orderId` or `shipmentId`, `paidAt`, `amount`,
  `currency`, `rate`, `usdPaid`, `usdCredited`, `rateEdited`, `actorId`.

**Stock**

- `StockMovement`: `productId`, `type` (`IN`, `OUT`, `ADJUST`), `quantity` (signed),
  `dealId` (optional), `shipmentLineId` (for `IN`), `reason`, `unitCostUsd`
  (snapshot), `occurredAt`, `actorId`.

## Rules

### Stages and dates

1. A shipment changes stage with a stage and a date. The date defaults to today.
2. The date cannot be earlier than the date of the previous event.
3. Each change writes one `ShipmentStageEvent`. Documents attach to that event.
4. Lead time between two stages is the difference of two consecutive event dates. It is
   computed on read and never stored.
5. Code reads `kind`, never `name`.
6. A shipment in a `RECEIVED` or `CANCELLED` stage cannot change stage. A mistake is
   corrected with an `ADJUST` movement.

### Quantities

7. For each order line, the sum of its `ShipmentLine.quantity` cannot exceed
   `PurchaseOrderLine.quantity`.
8. The order shows received over ordered, for example 4 of 10.

### Stock

9. When a shipment reaches a `RECEIVED` stage, one `IN` movement is created for each
   shipment line. This happens once.
10. Stock has no stored balance. The balance is the sum of movements.
11. *Reserved* is the `IN` quantity with a deal, minus the `OUT` quantity of that deal.
    *Free* is the total minus the reserved. An exit without a deal cannot take reserved
    stock.
12. An exit cannot make the free or the deal reserved quantity negative.
13. The sales invoice is an `Attachment` with a label on the `OUT` movement that has a
    deal. It is not on the shipment, because one shipment can go to many customers.

### Payments

14. The CRM proposes the current rate. The user can edit it. The final rate is stored.
15. `usdPaid` is what the payment cost. `usdCredited` is the debt it settled with the
    supplier. `usdCredited` copies `usdPaid` until the user changes it.
16. `ExchangeRate` keeps one rate per pair and source, with no history. A payment never
    reads a past rate. It stores its own rate when it is created.
17. Every payment keeps the currency paid, the original amount, the rate and both USD
    figures. None of them is recomputed later.
18. Currencies come from `CURRENCIES` in `@crm/db/currency`. PYG has no minor unit.

### Real cost per unit

```
exchangeFactor(order)  = sum(usdPaid of order payments) / sum(usdCredited of order payments)
                         1 when the order has no payments
supplierCost(line)     = line.unitCostUsd * exchangeFactor(order)
shipmentShare(shipment) = sum(usdPaid of shipment payments) / units of the shipment
unitCost(shipmentLine) = supplierCost(orderLine) + shipmentShare(shipment)
```

- The factor spreads the exchange difference by value, not by unit.
- The shipment share spreads by unit. This is a known limit.
- The cost is computed live on the shipment.
- An `OUT` movement stores `unitCostUsd` at the moment of the exit. A payment added
  later does not change a past sale.
- The order shows the factor. A factor outside the tolerance shows a warning. The
  tolerance lives in the imports config module.

### Permissions

- Owner and admin do everything: catalog, orders, shipments, payments, stock, and
  every list (stages, labels, concepts).
- One new function, `canManageInventory(role)` in `packages/auth/src/organization.ts`.
  It returns `isWorkspaceAdmin(role)`.
- The service enforces it. The UI uses the same function to disable controls.
- Members can read. Opening the operation to members is a later change of one function.

## Documents and storage

- Files go to Vercel Blob with a client upload. A serverless request body is limited to
  4.5 MB.
- `BLOB_READ_WRITE_TOKEN` is optional. Without it, the upload control is disabled and
  the screen says why. Nothing throws.
- Admin and owner create labels. The file is always free. The label is a tag.

## Code rules that apply

- No code comments.
- Every new screen is in neutral Spanish. UI comes only from `packages/ui`.
- Constants live in one config module per area, for example `imports-config.ts`, and
  derive units from one base.
- Untyped data is parsed with Zod at the boundary. Shared shapes go in
  `packages/validation/src`.
- A tRPC procedure is tested with `expectOutput`.
- A client component imports no server package. The server page computes.
- Docs: add `docs/imports.md` and one row in the `AGENTS.md` index.

## Testing

- Pure functions, with unit tests first: exchange factor, shipment share, unit cost,
  lead time, balance, reserved and free.
- Rules: receive once, quantity sum per line, date order, no exit from reserved stock,
  no stage change after `RECEIVED`.
- Contract: `expectOutput` on every new procedure.
- Each phase ends with a browser checklist. No phase is closed without it.

## Open items for the plans

1. The Blob client-upload handshake route needs the token. The Next.js app does not have
   it. The plan for Phase 2 decides where the route lives. It is probably the API.
2. The tolerance for the exchange factor needs a first value. Phase 3 decides it.
3. Whether the shipment share should spread by value is open.
4. Whether members can operate is open. The answer today is no.
