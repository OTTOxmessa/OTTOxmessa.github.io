## The problem

Small shops like cafés or bakeries often log sales in a notebook, count cash at closing, and never know which hour is busiest or what's about to run out. Most POS software wants a monthly subscription.

## What it does

- **Sell** — search products (press `/`), filter by category, tap to add, adjust quantities, apply a baht or % discount
- **Take payment** — cash with quick-note buttons (100 / 500 / 1000) and automatic change, or a **PromptPay QR for the exact bill** for the customer to scan
- **Receipts** — print instantly (80 mm thermal width) or reopen and reprint from history
- **Products & stock** — choose which items track stock, set a low-stock alert, and get warned before overselling
- **Void a bill** — stock goes back automatically and the bill is excluded from reports
- **Reports** — sales, bill count, average bill, cash vs PromptPay, hourly and 7-day charts, best sellers, CSV export

## Details I cared about

- All money is computed in **satang (integers)**, so percentage discounts never drift by 0.01
- Selling, voiding and reporting are pure functions separate from the UI, with tests
- Fully keyboard-usable; the checkout is a `<dialog>` that traps focus and closes with Esc
- Big touch targets for tablets; the current tab lives in the URL so Back works

## Data

Stored in this browser (localStorage), no server — back up and restore as a JSON file.
