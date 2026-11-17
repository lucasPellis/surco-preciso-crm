# Order pages — design

Date: 2026-11-16. Status: approved by the owner, not built.

Extends `docs/superpowers/specs/2026-11-15-import-processes-design.md`. Plan A1 (processes,
the settings screen, the order picks a process) is built. This design replaces the two side
sheets of `/imports` with two pages, and pulls the horizontal path of plan A3 forward.

## Goal

Creating and following a purchase order is clear and fast. The owner sees the whole order on
one page. The owner sees where each shipment is in its process.

## The problem

The create sheet is narrow and long. It stacks supplier, process, date and notes, then one
line at a time with product, quantity, unit cost and deal. Line entry is slow. The process is
a name in a select, so the owner does not see what it means. The owner calls the sheet "not
intuitive and visually uncomfortable".

## Decisions

| Question | Answer |
| --- | --- |
| Where an order is created | A full page, `/imports/new` |
| Where an order is edited | A full page, `/imports/[orderId]/edit`, with the same form |
| Where an order is followed | A full page, `/imports/[orderId]` |
| How lines are entered | An editable table. Enter in the last row adds a row |
| How a process is explained | Its route shows as a strip of steps when it is chosen |
| How a shipment shows its state | A horizontal path. Done steps show their date. The current step shows its days |
| The order number | The server writes it (`OC-<year>-<seq>`). No page asks for it |
| The shipment dialogs | They stay dialogs: create, move, edit. The order page reuses them |
| The side sheets | `order-form-sheet.tsx` and `order-detail-sheet.tsx` are removed |
| The page model | A server page prefetches with tRPC and hydrates a client component, as `settings/import-processes/[processId]/page.tsx` does |

## Screens

**`/imports`.** The table stays. A row opens `/imports/[orderId]`. *Nueva orden* opens
`/imports/new`. The nav entry *Importaciones* matches by prefix, so it stays active on the new
pages.

**`/imports/new` and `/imports/[orderId]/edit`.** One form component, `OrderForm`, in two
columns. On a narrow screen the columns stack.

- Left, block *Datos*: supplier, order date, process, notes.
- Left, block *Líneas*: a table. Each row has product, quantity, unit cost (USD), subtotal,
  deal and a remove button. Product and deal are searchable comboboxes.
  - Enter in a row moves to the next row. Enter in the last row adds a row and focuses its
    product.
  - A line with shipped units keeps its product and cannot be removed, as today.
- Right, a sticky summary: total in USD, units, lines, the route of the chosen process, the
  submit button (*Crear orden* or *Guardar cambios*) and *Cancelar*.
- *Cancelar* with unsaved changes asks before it leaves (`useDiscardChanges`).
- After a save the app opens `/imports/[orderId]`.

**`/imports/[orderId]`.**

- Header: the order number. Actions: *Editar* (a link to the edit page), *Nuevo envío*,
  *Archivar* or *Restaurar*.
- Below: supplier, process, date, total in USD and units, then the notes.
- No order-level route strip. Each shipment card shows its own path. The header shows the overall state.
  The description gives the overall state: *Sin envíos*, *En camino*, *Pendiente de envío*
  or *Recibida*.
- *Líneas*: product, unit cost, subtotal, then a bar and a count for shipped and for
  received over the ordered quantity, then the deal.
- *Envíos*: one card per shipment. The card has its stage, its own path, reference, tracking
  number, its lines, and two actions:
  - *Avanzar* opens the move dialog with the next step chosen. The owner can pick another
    step there. It is disabled for a closed shipment.
  - *Editar* opens the shipment data dialog.

## The path

`ProcessPath` in `packages/ui/src/components/process-path.tsx`. Its texts live in
`packages/ui/src/lib/process-path-config.ts`.

- An ordered list with a label. Each step is a short bar, a name and an optional detail.
- Three states: `done` (brand bar), `current` (light brand bar, `aria-current="step"`) and
  `pending` (muted bar, muted name).
- Each step carries a screen-reader word for its state. The colour is never the only signal.
- It has no control, so it adds no tab stop. It wraps instead of scrolling sideways. On a
  phone it is vertical.
- It has no motion, so reduced motion changes nothing. In forced colours the bars keep an
  outline.
- The component knows nothing of imports. The app computes the steps.

The app computes three kinds of path in `apps/app/lib/import-orders.ts`:

| Path | Rule |
| --- | --- |
| Preview of a process | Every active step except *Cancelado*, all `pending` |
| One shipment | The current step is `current` with its running days. A step before it, or any step of a closed shipment, is `done` with the day of its last event. A step before it with no event is `pending` with *Omitida*. The rest is `pending` |
| The whole order | A step with a shipment in it is `current` with the count. *Recibido* with shipments is `done`. A step before the first occupied step is `done`. The rest is `pending` |

A cancelled shipment has no current step on its path. Its card names the stage *Cancelado*.

## Data

- `importOrders.byId` already returns everything the order page needs: the active stages of
  the process in order, each shipment with its events, days and `running`, and per line
  shipped, received and remaining.
- `importOrders.options` returns the processes without their steps. The create page needs
  them for the route preview. **Change:** each process gets `stages`, the active stages in
  position order, with `key`, `name` and `kind`. The edit page uses `byId().stages` for the
  saved process, because an archived process is not in `options`.
- No migration.

## Rules

1. Every rule of `docs/imports.md` stays. The pages call the same procedures as the sheets.
2. The server alone writes the order number.
3. A client component imports only `@crm/ui`, the tRPC client, React, Next navigation and
   the enum-only subpaths of `@crm/db`.
4. The path component uses semantic tokens only. It has no app logic.
5. Every write still needs `canManageInventory`. A member sees the pages with disabled
   actions. A member who opens `/imports/new` by URL gets the server refusal as a toast.

## Testing

- Pure functions, unit tests first: the route preview, the shipment path, the order path,
  the next step, the line subtotal, the draft totals, the order totals, the overall state.
- The path component: a server render test of its list, its label, the one current step and
  the screen-reader words.
- Contract: the `options` test asserts the stages of a process with `expectOutput`.
- The plan ends with a browser checklist for the owner.

## Out of scope

| Plan | Delivers |
| --- | --- |
| A2 | Decision step with approve and reject, rejection counts, split into shipments of N, `unitsPerShipment` |
| A3 | The step board on `/imports` (the path moved here) |
| B | Expected documents per step and *Subir papeles* on the shipment card |
| C | Import costs and payments |

## Open items

None for the owner. The plan records two choices it made:

1. Enter in a row that is not the last moves to the next row. It never submits the form.
2. The overall state names are *Sin envíos*, *En camino*, *Pendiente de envío* and
   *Recibida*.
