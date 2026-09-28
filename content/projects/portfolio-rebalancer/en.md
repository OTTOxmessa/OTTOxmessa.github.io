## Why

The rebalancing piece of my investment portfolio system (CP353002), pulled out so anyone can use it instantly — no backend needed.

## Logic

- **Buy & sell**: move every holding to target, `target − current`
- **Buy only**: split new cash by each holding's shortfall. The shortfalls always add up to at least the cash, so nothing overshoots its target
- Targets must add up to 100% and values can't be negative — checked before calculating

## Accessibility

- Every input has a label, and results are a real table, not just a chart
- Allocation bars carry numbers, so meaning never depends on colour alone
