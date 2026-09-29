## What it does

- 25-minute focus → 5-minute break → a 15-minute long break every 4 rounds (all adjustable)
- Add tasks and pick the current one — every finished round counts toward it
- Stats: minutes today, the last 7 days, and your streak
- Sound and background-tab notifications; the time shows in the tab title
- Press **Space** to start or pause

## Technical details

- The timer stores an end timestamp and computes what's left from the real clock — browsers throttle `setInterval` in background tabs, so counting ticks drifts
- The logic is a state machine (idle / running / paused) that's tested without waiting in real time
- Skipping a round doesn't count as focus time
- Sounds are synthesised with Web Audio — no files to load
