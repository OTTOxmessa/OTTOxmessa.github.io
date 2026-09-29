## The problem

Every month a small dorm owner walks around reading meters, works out water and electricity room by room on a calculator, hand-writes bills, and tries to remember who hasn't paid. It's slow and error-prone.

## The monthly flow

1. **Read meters** — one table for every room; usage is computed from last month, and a lower reading is flagged as a likely typo
2. **Generate bills** — one click bills every occupied room: rent + water (with a minimum charge) + electricity + per-room extras (internet, parking)
3. **Print / send** — each invoice shows the amount in Thai words, the due date and a **PromptPay QR for the exact amount**; print all rooms at once, one per page
4. **Collect** — tick paid; unpaid rooms show how many days overdue they are

## Details I cared about

- **Paid bills are never recalculated**, even if you regenerate; unpaid ones can be refreshed after fixing a reading
- Problems are reported before billing (missing reading, no previous reading)
- 6-month income, occupancy and outstanding balance
- Tables work by keyboard, and every input has a screen-reader name (e.g. "Room 203 water this month")

## Data

Stored in this browser, no server — back up to a file.
