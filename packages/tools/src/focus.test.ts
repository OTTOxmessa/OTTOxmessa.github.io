import { describe, expect, it } from "vitest";
import { addFocus, DEFAULT_SETTINGS as S, formatMs, lastDays, next, pause, remaining, start, streak, type TimerState } from "./focus";

const idle: TimerState = { status: "idle", phase: "focus", round: 0 };

describe("timer", () => {
  it("counts down from an end timestamp", () => {
    const run = start(idle, S, 1000);
    expect(remaining(run, S, 1000)).toBe(25 * 60_000);
    expect(remaining(run, S, 1000 + 60_000)).toBe(24 * 60_000);
    expect(remaining(run, S, 1000 + 99 * 60_000)).toBe(0);
  });

  it("pauses and resumes with the same remaining time", () => {
    const run = start(idle, S, 0);
    const paused = pause(run, 10 * 60_000);
    expect(remaining(paused, S, 999_999_999)).toBe(15 * 60_000);
    const resumed = start(paused, S, 50 * 60_000);
    expect(remaining(resumed, S, 50 * 60_000)).toBe(15 * 60_000);
  });

  it("cycles focus → short break, and every 4th focus → long break", () => {
    let st: TimerState = idle;
    const phases: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = next(st, S, 0);
      st = r.state;
      phases.push(st.phase);
    }
    expect(phases).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
    expect(st.round).toBe(4);
  });

  it("auto-starts the next phase when enabled", () => {
    expect(next(idle, { ...S, autoStart: true }, 0).state.status).toBe("running");
    expect(next(idle, S, 0).completedFocus).toBe(true);
  });

  it("formats mm:ss rounding up partial seconds", () => {
    expect(formatMs(25 * 60_000)).toBe("25:00");
    expect(formatMs(61_001)).toBe("01:02");
    expect(formatMs(0)).toBe("00:00");
  });
});

describe("stats", () => {
  it("sums minutes per day and lists the last 7 days", () => {
    let log = addFocus({}, "2026-09-29", 25);
    log = addFocus(log, "2026-09-29", 25);
    log = addFocus(log, "2026-09-27", 25);
    const days = lastDays(log, "2026-09-29");
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual({ date: "2026-09-29", minutes: 50 });
    expect(days[0]!.date).toBe("2026-09-23");
  });
  it("counts streaks, not breaking on an empty today", () => {
    const log = { "2026-09-26": 25, "2026-09-27": 25, "2026-09-28": 50 };
    expect(streak(log, "2026-09-29")).toBe(3);
    expect(streak({ ...log, "2026-09-29": 25 }, "2026-09-29")).toBe(4);
  });
});
