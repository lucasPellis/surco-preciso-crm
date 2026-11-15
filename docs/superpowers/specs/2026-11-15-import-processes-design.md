# Import processes — design

Date: 2026-11-15. Status: approved by the user, not built.

Extends `docs/superpowers/specs/2026-11-14-product-lifecycle-design.md`. Phase 2a (import
stages, orders, shipments) is built. This design changes its model.

## Goal

Let the user create, save and edit different import processes. A process is a template of
steps. The steps differ by destination (Argentina, Paraguay, Brazil) and by transport.
Each order picks its process. The path of a shipment is visual.

## The case that drives the design

Equipment such as Fatnav is ordered in a group, for example 10 units. The units leave in
separate shipments, so each shipment stays under the customs category limit and pays a
lower tax. Each shipment walks the full process on its own.

The Argentina courier process has these steps:

1. Order created. The CRM creates it, empty.
2. Factory documents. The factory sends the commercial invoice (PI) and the packing list.
   Both are uploaded.
3. Sent to courier. The factory sends the goods to its last-mile courier.
4. With DHL. DHL sends "informe de pedido tomado". The tracking number exists from here.
5. Import costs. About 4 days later DHL sends customs, carrier and other costs.
6. Payment. The user pays and uploads the receipt.
7. Presented to the bank. Packing list, commercial invoice and proof of shipment.
8. Bank decision. Approved or rejected.
9. Received at the warehouse.

If the bank rejects, the user asks DHL or China for more papers and presents again.

These steps are configuration. The user builds them in the settings screen. No code names
a step.

## Decisions taken in the review

| Question | Answer |
| --- | --- |
| Expected documents per step | A checklist that warns and never blocks |
| Bank rejection | A decision step with two exits, and a count of rejections |
| Papers of a split order | Each shipment is independent and has its own papers |
| Views | A step board and a horizontal path inside each shipment |

The checklist reopens one rule of the lifecycle design. That design left required
documents per stage out of scope. A checklist that warns replaces it.

## Build order

| Plan | Delivers | Migration |
| --- | --- | --- |
| A1 | Processes, the settings screen, the order picks a process | Yes |
| A2 | Decision step, rejections, split into shipments, `unitsPerShipment` | Yes |
| A3 | Horizontal path and step board | No |
| B | Expected documents per step, files on Vercel Blob | Yes |
| C | Import costs and payments with the USD equivalent | Yes |

Each plan has its own plan file. The user applies each migration with
`bun --env-file=.env run --filter=@crm/db db:deploy` and rebuilds the test database with
`bun --env-file=.env run db:test`.

## Data model

**New**

- `ImportProcess`: `name` (unique), `countryCode` (optional, one of `AR`, `PY`, `BR`),
  `archivedAt`. The country is a label for now. Phase 3 can use it as a currency default.

**Changed**

- `ImportStage`: adds `processId` (required) and `rejectKey` (optional).
  - `key` stays unique across the table and immutable. `Shipment.stageKey` and
    `ShipmentStageEvent.stageKey` keep their foreign keys to it.
  - The entry index changes from one entry in the whole table to one active entry per
    process.
  - `rejectKey` marks a decision step. It names a step of the same process, in progress,
    active, and not the step itself.
- `PurchaseOrder`: adds `processId` (required).
- `ShipmentStageEvent`: adds `outcome` (optional, `APPROVED` or `REJECTED`).
- `Product`: adds `unitsPerShipment` (optional, a positive integer).

**Migration of existing data.** Create the process "Importación estándar". Assign the six
existing stages and every existing order to it. Nothing is deleted.

## Rules

1. A shipment moves only between the steps of its own process.
2. An order cannot change its process once it has a shipment.
3. A process has one entry, one received and one cancelled step. These three are fixed
   and only rename, as today. A new process starts with these three.
4. A process with a shipment in an in-progress step cannot be archived. An archived
   process stays readable and cannot be picked for a new order.
5. Duplicating a process copies its steps with new keys. The copy remaps `rejectKey`. It
   copies no order.
6. A step with a `rejectKey` is a decision step. A move out of it accepts an outcome:
   - `REJECTED` needs the target to be the `rejectKey` of the current step.
   - `APPROVED` needs the current step to be a decision step. The target is the next
     active step by position. The user can pick another target.
   - The event of the target step stores the outcome.
   - A move from a decision step without an outcome is allowed. It is not counted.
7. Rejections and lost time are computed on read from the events. Nothing is stored.
   A pure function owns the formula, and the plan tests it.
8. A shipment can still skip steps and go back, as today. The decision step adds the two
   shortcuts and the count.
9. Splitting works on one order line. The user gives N units per shipment. The action
   creates `ceil(remaining / N)` shipments. The last one takes the rest.
   - N is prefilled from `Product.unitsPerShipment`.
   - The action creates at most 50 shipments.
   - It runs in one transaction under the order lock. Each shipment writes its entry
     event with the chosen day.
   - A cancelled shipment still frees its units, so `remaining` ignores it.
10. Every rule of Phase 2a stays: the sum of shipment lines per order line never passes
    the ordered quantity, a day is never in the future, and a closed shipment never moves.

## Screens

- **Settings, Import processes.** It replaces *Etapas de importación*. A list of processes
  with create, duplicate, rename and archive. A process opens the step editor that exists
  today, limited to that process. A step has a switch "es decisión" and a field "si
  rechaza, vuelve a".
- **Order form.** A process field. It is required and locked after the first shipment.
- **Order detail.** Each shipment shows a horizontal path. Done steps show their date. The
  current step shows the days it has run. Pending steps are plain. A decision step shows
  its rejection count. The path is a new component in `packages/ui`.
- **Imports.** A switch between *Tabla* and *Tablero*.
  - The board has a process selector, because the steps differ.
  - Columns are the steps of that process. Cards are shipments.
  - Dropping a card opens the move dialog with the day and, from a decision step, the
    outcome.
  - `PipelineBoard` in `packages/ui` is the base. Its texts live in
    `packages/ui/src/lib/pipeline-board-config.ts`. They say "tarjeta" and "etapa", and the
    card name comes from the data, so they fit shipments. The plan A3 confirms this
    against the drag handlers.

## Documents and payments

Plan B and plan C follow this model.

- Expected documents are a list of `DocumentLabel` per step. A shipment shows which labels
  have a file. The checklist never blocks a move.
- Files belong to the shipment step event, as in the lifecycle design. Each shipment has
  its own files.
- DHL costs and payments belong to the shipment, as `Payment` in the lifecycle design.

## Permissions

`canManageInventory(role)` guards every write: owner and admin. Members read.

## Testing

- Pure functions, unit tests first: rejections and lost time, the split quantities, the
  next step by position.
- Rules: entry per process, a move inside the process, the order process lock, archive of
  a process with active shipments, the decision outcome checks, the split under the order
  lock with a two-writers test.
- Contract: `expectOutput` on every new procedure.
- Migration: a step in each plan that stops for the user to run `db:deploy` and `db:test`.
- Each plan ends with a browser checklist. No plan closes without it.

## Open items for the plans

1. The formula of lost time after a rejection. The plan A2 fixes it and tests it.
2. Whether `PipelineBoard` needs a prop to carry the outcome choice on a drop from a
   decision step. The plan A3 decides.
3. Whether the country sets a currency default. Plan C decides.
4. Whether a step should ask for the tracking number. Today the tracking number is a free
   field of the shipment. Plan B can add the hint.
