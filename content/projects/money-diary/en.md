## What it does

- **Fast entry:** type an amount, pick a category, press Enter — the amount field is ready for the next one
- **Monthly summary:** income, spending, balance, and a breakdown by category
- **Projection:** "at this pace you'll spend about …"
- **Budgets:** per-category limits with warnings at 80% and when you go over
- **Export / import:** CSV that opens in Excel with Thai text intact, plus a backup file for moving devices
- Deleted by mistake? Press Undo

## Technical details

- Hand-written CSV parser that handles quotes, commas and line breaks in notes, with a round-trip test proving export → import returns identical data
- Malformed lines are skipped and reported by line number
- Budget bars use `role="progressbar"` so screen readers can read them

## Privacy

Money data stays in that browser. Nothing is sent anywhere.
