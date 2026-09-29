"use client";

import { addFocus, DEFAULT_SETTINGS, formatMs, lastDays, next, pause, phaseMs, remaining, start, streak, type Log, type Phase, type Settings, type TimerState } from "@portfolio/tools/focus";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { num, todayIso, uid, useStoredState } from "./common";

type Task = { id: string; title: string; done: boolean; pomos: number };
type Store = { settings: Settings; tasks: Task[]; activeId: string | null; log: Log; sound: boolean };

const initial = (): Store => ({ settings: DEFAULT_SETTINGS, tasks: [], activeId: null, log: {}, sound: true });

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {
    /* no audio */
  }
}

export function FocusApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [store, setStore] = useStoredState<Store>("tool-focus-v1", initial);
  const [timer, setTimer] = useState<TimerState>({ status: "idle", phase: "focus", round: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState("");
  const [newTask, setNewTask] = useState("");
  const [notifyState, setNotifyState] = useState<string>("default");
  // วันที่ของเครื่องผู้ใช้ — คำนวณหลังโหลด เพื่อไม่ให้ต่างจาก HTML ที่ build ไว้ล่วงหน้า
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => setTodayKey(todayIso()), []);
  const baseTitle = useRef("");
  const s = store.settings;

  const PHASE: Record<Phase, string> = { focus: T("โฟกัส", "Focus"), short: T("พักสั้น", "Short break"), long: T("พักยาว", "Long break") };

  useEffect(() => {
    baseTitle.current = document.title;
    if ("Notification" in window) setNotifyState(Notification.permission);
    return () => {
      document.title = baseTitle.current;
    };
  }, []);

  const complete = useCallback((skipped = false) => {
    const { state, completedFocus } = next(timer, s, Date.now());
    if (skipped) {
      setTimer({ status: "idle", phase: state.phase, round: state.round });
      setAnnounce(T(`ข้ามไป${PHASE[state.phase]}`, `Skipped to ${PHASE[state.phase].toLowerCase()}`));
      return;
    }
    if (completedFocus) {
      setStore((st) => ({
        ...st,
        log: addFocus(st.log, todayIso(), s.focus),
        tasks: st.tasks.map((t) => (t.id === st.activeId ? { ...t, pomos: t.pomos + 1 } : t)),
      }));
    }
    const msg = completedFocus ? T(`ครบรอบโฟกัสแล้ว — ถึงเวลา${PHASE[state.phase]}`, `Focus done — time for a ${PHASE[state.phase].toLowerCase()}`) : T("หมดเวลาพัก — กลับมาโฟกัสกัน", "Break's over — back to focus");
    setAnnounce(msg);
    if (store.sound) beep();
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(msg);
    setTimer(state);
    // PHASE/T ขึ้นกับภาษาเท่านั้น
  }, [timer, s, store.sound, setStore, lang]);

  useEffect(() => {
    if (timer.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer.status]);

  const left = remaining(timer, s, now);
  useEffect(() => {
    if (timer.status === "running" && left <= 0) complete();
  }, [left, timer.status, complete]);

  useEffect(() => {
    document.title = timer.status === "idle" ? baseTitle.current : `${formatMs(left)} · ${PHASE[timer.phase]}`;
  }, [left, timer.status, timer.phase, lang]);

  const toggle = useCallback(() => {
    const n = Date.now();
    setNow(n);
    setTimer((t) => (t.status === "running" ? pause(t, n) : start(t, s, n)));
  }, [s]);

  // Space = เริ่ม/หยุด (เมื่อไม่ได้พิมพ์อยู่)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === "Space" && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const total = phaseMs(timer.phase, s);
  const progress = total ? 1 - left / total : 0;
  const R = 108;
  const C = 2 * Math.PI * R;
  const days = todayKey ? lastDays(store.log, todayKey) : [];
  const maxDay = Math.max(25, ...days.map((d) => d.minutes));
  const today = days.at(-1)?.minutes ?? 0;
  const active = store.tasks.find((t) => t.id === store.activeId);

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    const t: Task = { id: uid(), title: newTask.trim(), done: false, pomos: 0 };
    setStore((st) => ({ ...st, tasks: [...st.tasks, t], activeId: st.activeId ?? t.id }));
    setNewTask("");
  }

  return (
    <div className="tool focus">
      <div className="tool-main">
        <section className="panel focus-panel" data-phase={timer.phase} aria-labelledby={`${fid}-t`}>
          <h2 className="sr-only" id={`${fid}-t`}>{T("ตัวจับเวลา", "Timer")}</h2>
          <div className="phase-tabs seg seg--wide" role="group" aria-label={T("เลือกช่วง", "Choose a phase")}>
            {(["focus", "short", "long"] as Phase[]).map((p) => (
              <button key={p} type="button" aria-pressed={timer.phase === p} onClick={() => setTimer({ status: "idle", phase: p, round: timer.round })}>
                {PHASE[p]}
              </button>
            ))}
          </div>
          <div className="ring">
            <svg viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r={R} className="ring-bg" />
              <circle cx="120" cy="120" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 120 120)" />
            </svg>
            <div className="ring-text">
              <span className="ring-time" role="timer" aria-label={`${PHASE[timer.phase]} ${formatMs(left)}`}>{formatMs(left)}</span>
              <span className="ring-phase">{PHASE[timer.phase]} · {T("รอบที่", "round")} {timer.round + (timer.phase === "focus" ? 1 : 0)}</span>
              {active && timer.phase === "focus" && <span className="ring-task">{active.title}</span>}
            </div>
          </div>
          <div className="timer-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={toggle}>
              {timer.status === "running" ? T("หยุดชั่วคราว", "Pause") : timer.status === "paused" ? T("ทำต่อ", "Resume") : T("เริ่ม", "Start")}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => complete(true)}>{T("ข้าม", "Skip")}</button>
            <button type="button" className="btn btn-outline" disabled={timer.status === "idle"} onClick={() => setTimer({ status: "idle", phase: timer.phase, round: timer.round })}>{T("เริ่มใหม่", "Reset")}</button>
          </div>
          <p className="hint center">{T("กด Space เพื่อเริ่ม/หยุด", "Press Space to start or pause")}</p>
          <p className="sr-only" role="status" aria-live="assertive">{announce}</p>
        </section>

        <section className="panel" aria-labelledby={`${fid}-tk`}>
          <h2 className="panel-title" id={`${fid}-tk`}>{T("งานที่จะทำ", "Tasks")}</h2>
          <form className="inline-form" onSubmit={addTask}>
            <label htmlFor={`${fid}-nt`} className="sr-only">{T("งานใหม่", "New task")}</label>
            <input id={`${fid}-nt`} value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder={T("เช่น อ่านบทที่ 3 OS", "e.g. Read OS chapter 3")} />
            <button type="submit" className="btn btn-primary btn-sm">{T("เพิ่ม", "Add")}</button>
          </form>
          {store.tasks.length === 0 ? (
            <p className="hint">{T("เพิ่มงาน แล้วเลือกงานที่กำลังทำ — ทุกรอบโฟกัสที่ครบจะนับให้งานนั้น", "Add tasks and pick the one you're on — each finished focus round counts toward it.")}</p>
          ) : (
            <ul className="tasks">
              {store.tasks.map((t) => (
                <li key={t.id} className={t.done ? "is-done" : ""}>
                  <input type="checkbox" checked={t.done} aria-label={`${T("เสร็จแล้ว", "Done")}: ${t.title}`} onChange={(e) => setStore((st) => ({ ...st, tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x)) }))} />
                  <label className="task-pick">
                    <input type="radio" name={`${fid}-active`} checked={store.activeId === t.id} onChange={() => setStore((st) => ({ ...st, activeId: t.id }))} />
                    <span className="task-title">{t.title}</span>
                  </label>
                  <span className="task-pomos">
                    <span aria-hidden="true">{"●".repeat(Math.min(t.pomos, 8))}{t.pomos > 8 ? `+${t.pomos - 8}` : ""}</span>
                    <span className="sr-only">{T(`${t.pomos} รอบ`, `${t.pomos} rounds`)}</span>
                  </span>
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={`${T("ลบ", "Delete")} ${t.title}`} onClick={() => setStore((st) => ({ ...st, tasks: st.tasks.filter((x) => x.id !== t.id), activeId: st.activeId === t.id ? null : st.activeId }))}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="tool-side">
        <div className="panel panel--sticky">
          <h2 className="panel-title">{T("สถิติของคุณ", "Your stats")}</h2>
          <dl className="money-kpis">
            <div><dt>{T("วันนี้", "Today")}</dt><dd>{today} {T("นาที", "min")}</dd></div>
            <div><dt>{T("7 วัน", "7 days")}</dt><dd>{Math.round(days.reduce((a, d) => a + d.minutes, 0) / 6) / 10} {T("ชม.", "h")}</dd></div>
            <div><dt>{T("ต่อเนื่อง", "Streak")}</dt><dd>{todayKey ? streak(store.log, todayKey) : 0} {T("วัน", "d")}</dd></div>
          </dl>
          <ul className="week-bars" aria-label={T("นาทีโฟกัส 7 วันล่าสุด", "Focus minutes, last 7 days")}>
            {days.map((d) => (
              <li key={d.date}>
                <span className="wb-bar" aria-hidden="true"><i style={{ height: `${(d.minutes / maxDay) * 100}%` }} /></span>
                <span className="wb-day">{new Date(`${d.date}T00:00:00`).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "short" })}</span>
                <span className="sr-only">{d.minutes} {T("นาที", "minutes")}</span>
              </li>
            ))}
          </ul>

          <details className="settings">
            <summary>{T("ตั้งค่า", "Settings")}</summary>
            <div className="grid-2">
              {(["focus", "short", "long"] as const).map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`${fid}-${k}`}>{PHASE[k]} ({T("นาที", "min")})</label>
                  <input id={`${fid}-${k}`} type="number" inputMode="numeric" min={1} max={180} value={s[k]} onChange={(e) => setStore((st) => ({ ...st, settings: { ...st.settings, [k]: Math.min(180, Math.max(1, num(e.target.value) || 1)) } }))} />
                </div>
              ))}
              <div className="field">
                <label htmlFor={`${fid}-le`}>{T("พักยาวทุกกี่รอบ", "Long break every")}</label>
                <input id={`${fid}-le`} type="number" inputMode="numeric" min={2} max={10} value={s.longEvery} onChange={(e) => setStore((st) => ({ ...st, settings: { ...st.settings, longEvery: Math.min(10, Math.max(2, num(e.target.value) || 4)) } }))} />
              </div>
            </div>
            <label className="check"><input type="checkbox" checked={s.autoStart} onChange={(e) => setStore((st) => ({ ...st, settings: { ...st.settings, autoStart: e.target.checked } }))} />{T("เริ่มช่วงถัดไปอัตโนมัติ", "Auto-start the next phase")}</label>
            <label className="check"><input type="checkbox" checked={store.sound} onChange={(e) => setStore((st) => ({ ...st, sound: e.target.checked }))} />{T("เสียงเตือนเมื่อหมดเวลา", "Sound when time's up")}</label>
            {notifyState === "default" && (
              <button type="button" className="text-link" onClick={() => Notification.requestPermission().then(setNotifyState)}>{T("เปิดการแจ้งเตือน (เมื่ออยู่แท็บอื่น)", "Enable notifications (when on another tab)")}</button>
            )}
            {notifyState === "granted" && <p className="hint">{T("เปิดการแจ้งเตือนแล้ว", "Notifications on")}</p>}
          </details>
          <p className="privacy">{T("งานและสถิติเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น", "Tasks and stats stay in this browser.")}</p>
        </div>
      </aside>
    </div>
  );
}
