## Why

A car loan advertised at "2.49%" looks far cheaper than a "6%" home loan — but they're calculated differently:

- **Flat rate** charges interest on the full amount for the whole term, even as you pay it back
- **Reducing balance** charges interest only on what's still owed

This converts a flat rate into the **real annual rate** (a 2.5% flat 5-year loan ≈ 4.7% a year) so offers can be compared directly.

## Features

- Monthly payment, total interest, total paid
- Principal vs interest by year, and a full payment schedule (CSV download)
- Presets: car, phone/laptop, home loan

## Technical details

- Reducing balance uses the annuity formula; the last payment absorbs rounding so the balance ends at exactly 0
- Flat-rate schedules allocate interest with the Rule of 78 (front-loaded), as Thai finance companies do
- The real rate is solved by bisection, tested to round-trip with the annuity formula
