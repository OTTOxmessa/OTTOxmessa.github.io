## What it does

- Enter course, day, time and room → your **weekly grid** appears instantly
- **Clashes** are highlighted and flagged (handy at registration time)
- A **"next class"** card shows what's next, where, and how long until it starts
- **Export .ics** → open it in Google Calendar or iPhone Calendar and every class repeats weekly until the semester ends
- Printable

## Technical details

- The .ics file follows RFC 5545: an Asia/Bangkok `VTIMEZONE`, weekly `RRULE`, escaped `, ;`, and **lines folded at 75 bytes without splitting multi-byte Thai characters** — tested
- Each course's first date is computed from the semester start (start on a Wednesday → Monday classes begin the next week)
- The visual grid is hidden from screen readers; a **per-day list** carries the same information
