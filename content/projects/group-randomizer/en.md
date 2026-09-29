## What it does

- Paste names from Excel or a chat (numbering and duplicates are removed)
- Split by **number of groups** or **people per group** — sizes never differ by more than one
- **Keep pairs apart**
- **Shuffle code**: same code + same names = same result every time, so a teacher can prove the draw wasn't rigged
- **Pick one person** without repeats, with history
- Copy the result straight into a chat

## Technical details

- Fisher–Yates shuffle driven by a seedable mulberry32 PRNG (Math.random can't be seeded)
- Names are dealt round-robin for even sizes, then the search keeps the shuffle with the fewest broken rules — and says so if a rule can't be met
- The picker animation respects "reduce motion" and the result is announced to screen readers
