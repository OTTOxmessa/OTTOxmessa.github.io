## The problem

Cafés, small restaurants and shops often find out something has run out the moment they need it. They reorder from memory, don't know the real cost of what they used this month, and never find out how much went missing because stock is never counted against the records.

## What it does

- **Products & materials** — SKU, category, unit, reorder point, pack size, main supplier and opening stock
- **Stock in / out** — with a reason (sold, used, damaged, returned) and a guard against issuing more than you have
- **Reorder now** — lists items at their reorder point *counting what's already on order* (so nothing is ordered twice), then drafts **one purchase order per supplier** in one click, with a needed-by date from each supplier's lead time
- **Purchase orders** — editable as drafts, printable/PDF for the supplier, **partial receiving** (never more than ordered), and closing out what a supplier couldn't deliver
- **Stock counts** — enter what you counted; differences are saved as adjustments with the value gained or lost
- **Stock cards** — every movement of an item with its running balance

## Details I cared about

- **Balances are never stored** — they're computed from the full movement history every time, so everything is auditable and you can see stock as of any date
- **Moving-average cost** on every receipt, so stock value and cost of goods used match how most small businesses keep their books
- **Days of cover** from the average usage of the last 30 days
- All logic is pure functions separate from the UI, with tests for averaging, reorder suggestions, partial receiving and counts

## Data

Stored in this browser, no server — export stock as CSV and back up/restore as a file.
