## What it does

- **Amounts in Thai words**: 15,999.95 → หนึ่งหมื่นห้าพันเก้าร้อยเก้าสิบเก้าบาทเก้าสิบห้าสตางค์ — for receipts, cheques and contracts
- **English for invoices**: "Fifteen thousand nine hundred and ninety-nine baht and ninety-five satang only"
- **Thai date formats**: formal (government letters), long, short, numeric and Thai numerals
- **BE ↔ CE years**, **Thai ↔ Arabic numerals**, **day and age counting** in years, months and days
- One-click copy on every result

## Correctness

- Output matches Excel's BAHTTEXT — 17 test cases including the usual trouble spots: 101, 1,000,001 (หนึ่งล้าน**เอ็ด**), 11,000,000, satang and rounding
- Handles trillions (ล้านล้าน)
- Months are counted on the real calendar (31 Jan + 1 month = 28/29 Feb), leap years included
