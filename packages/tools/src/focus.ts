/**
 * ตัวจับเวลาโฟกัส (Pomodoro) — จับเวลาจาก "เวลาสิ้นสุด" ไม่ใช่นับ setInterval
 * จึงแม่นแม้สลับแท็บหรือเครื่องหน่วง
 */
export type Phase = "focus" | "short" | "long";
export type Settings = { focus: number; short: number; long: number; longEvery: number; autoStart: boolean };
export type TimerState =
  | { status: "idle"; phase: Phase; round: number }
  | { status: "running"; phase: Phase; round: number; endsAt: number }
  | { status: "paused"; phase: Phase; round: number; remainingMs: number };

export const DEFAULT_SETTINGS: Settings = { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false };

export const phaseMs = (phase: Phase, s: Settings) => s[phase] * 60_000;

export function start(state: TimerState, s: Settings, now: number): TimerState {
  if (state.status === "running") return state;
  const ms = state.status === "paused" ? state.remainingMs : phaseMs(state.phase, s);
  return { status: "running", phase: state.phase, round: state.round, endsAt: now + ms };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== "running") return state;
  return { status: "paused", phase: state.phase, round: state.round, remainingMs: Math.max(0, state.endsAt - now) };
}

export function remaining(state: TimerState, s: Settings, now: number): number {
  if (state.status === "running") return Math.max(0, state.endsAt - now);
  if (state.status === "paused") return state.remainingMs;
  return phaseMs(state.phase, s);
}

/** จบช่วงปัจจุบัน → ช่วงถัดไป (โฟกัสครบทุก longEvery รอบ ได้พักยาว) */
export function next(state: TimerState, s: Settings, now: number): { state: TimerState; completedFocus: boolean } {
  const completedFocus = state.phase === "focus";
  const round = completedFocus ? state.round + 1 : state.round;
  const phase: Phase = completedFocus ? (round % s.longEvery === 0 ? "long" : "short") : "focus";
  const idle: TimerState = { status: "idle", phase, round };
  return { state: s.autoStart ? start(idle, s, now) : idle, completedFocus };
}

export function formatMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type Log = Record<string, number>; // "YYYY-MM-DD" → นาทีโฟกัส

export function addFocus(log: Log, date: string, minutes: number): Log {
  return { ...log, [date]: (log[date] ?? 0) + minutes };
}

/** 7 วันล่าสุด (รวมวันนี้) */
export function lastDays(log: Log, today: string, n = 7) {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d - (n - 1 - i)));
    const key = dt.toISOString().slice(0, 10);
    return { date: key, minutes: log[key] ?? 0 };
  });
}

export function streak(log: Log, today: string): number {
  let count = 0;
  for (const day of lastDays(log, today, 366).reverse()) {
    if (day.minutes > 0) count++;
    else if (day.date !== today) break;
  }
  return count;
}
