"use client";

import { LIMITS, SCENARIOS, simulate, type ScenarioId } from "@portfolio/labs/sandbox";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";

const ACTORS = [
  { id: "judge", th: "Judge (แม่)", en: "Judge (parent)" },
  { id: "child", th: "Process ลูก", en: "Child process" },
  { id: "kernel", th: "Kernel", en: "Kernel" },
] as const;

const OUTCOME_ICON = { ok: "✓", info: "•", limit: "!", blocked: "✕" } as const;

export function SandboxApp() {
  const lang = useLang();
  const [scenario, setScenario] = useState<ScenarioId>("tle");
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const run = useMemo(() => simulate(scenario), [scenario]);
  const last = run.steps.length - 1;
  const done = step >= last;
  const current = step >= 0 ? run.steps[step] : undefined;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!playing) return;
    if (done) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1300);
    return () => clearTimeout(t);
  }, [playing, step, done]);

  useEffect(() => {
    listRef.current?.querySelector(".is-current")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);

  function choose(id: ScenarioId) {
    setScenario(id);
    setStep(-1);
    setPlaying(false);
  }

  const t = (x: { th: string; en: string }) => x[lang];
  const sc = SCENARIOS.find((s) => s.id === scenario)!;

  return (
    <div className="sandbox">
      <div className="sandbox-left">
        <fieldset className="scenarios">
          <legend>{lang === "th" ? "1. เลือกโค้ดที่จะส่งเข้า judge" : "1. Pick a submission"}</legend>
          {SCENARIOS.map((s) => (
            <label key={s.id} className="scenario">
              <input type="radio" name="scenario" value={s.id} checked={scenario === s.id} onChange={() => choose(s.id)} />
              <span className="scenario-text">
                <b>{t(s.title)}</b>
                <small>{t(s.hint)}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <figure className="code-window code-window--sm">
          <div className="code-bar">
            <span className="code-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="code-file">main.c</span>
          </div>
          <pre className="code-body" tabIndex={0} aria-label={`main.c — ${t(sc.title)}`}><code>{sc.code}</code></pre>
        </figure>

        <p className="limits">
          <span>CPU ≤ {LIMITS.cpuSeconds}s</span>
          <span>RAM ≤ {LIMITS.memoryMb} MB</span>
          <span>seccomp: allow-list</span>
        </p>
      </div>

      <div className="sandbox-right">
        <div className="controls" role="group" aria-label={lang === "th" ? "ควบคุมการเล่น" : "Playback controls"}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (done ? (setStep(-1), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? (lang === "th" ? "หยุด" : "Pause") : done ? (lang === "th" ? "เล่นใหม่" : "Replay") : lang === "th" ? "เล่นอัตโนมัติ" : "Play"}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPlaying(false); setStep((s) => Math.min(last, s + 1)); }} disabled={done}>
            {lang === "th" ? "ขั้นต่อไป →" : "Next step →"}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPlaying(false); setStep((s) => Math.max(-1, s - 1)); }} disabled={step < 0}>
            {lang === "th" ? "← ย้อน" : "← Back"}
          </button>
          <button type="button" className="text-link" onClick={() => { setPlaying(false); setStep(-1); }} disabled={step < 0}>
            {lang === "th" ? "เริ่มใหม่" : "Reset"}
          </button>
          <span className="progress" aria-hidden="true">{Math.max(0, step + 1)} / {run.steps.length}</span>
        </div>

        <div className="lanes" aria-hidden="true">
          {ACTORS.map((a) => <span key={a.id} data-actor={a.id}>{a[lang]}</span>)}
        </div>

        <ol className="timeline" ref={listRef} tabIndex={0} aria-label={lang === "th" ? "ลำดับ system call" : "System call timeline"}>
          {run.steps.map((s, i) => (
            <li
              key={`${scenario}-${i}`}
              className={`tl-step${i === step ? " is-current" : ""}${i > step ? " is-future" : ""}`}
              data-actor={s.actor}
              data-outcome={s.outcome}
              aria-hidden={i > step || undefined}
            >
              <span className="tl-icon" aria-hidden="true">{OUTCOME_ICON[s.outcome]}</span>
              <span className="tl-body">
                <span className="tl-who">{ACTORS.find((a) => a.id === s.actor)![lang]}</span>
                <code className="tl-call">{s.call}</code>
                {s.result && <code className="tl-result">{s.result}</code>}
              </span>
            </li>
          ))}
        </ol>

        <div className="explain" aria-live="polite" aria-atomic="true">
          {current ? (
            <>
              <p className="explain-title">{step + 1}. {t(current.title)}</p>
              <p>{t(current.detail)}</p>
            </>
          ) : (
            <p className="explain-title">
              {lang === "th" ? "กด “ขั้นต่อไป” หรือ “เล่นอัตโนมัติ” เพื่อเริ่ม" : "Press “Next step” or “Play” to begin"}
            </p>
          )}
        </div>

        {done && (
          <div className="verdict" data-code={run.verdict.code} role="status">
            <span className="verdict-code">{run.verdict.code}</span>
            <div>
              <p className="verdict-label">{t(run.verdict.label)}</p>
              <p>{t(run.verdict.explain)}</p>
              <p className="verdict-meta">
                <code>{run.verdict.status}</code> · {run.verdict.timeMs} ms · {(run.verdict.memoryKb / 1024).toFixed(1)} MB
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
