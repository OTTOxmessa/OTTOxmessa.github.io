"use client";

import { PipelineError, PLAYS, PRESETS, runPipeline, type Doc } from "@portfolio/labs/aggregate";
import { useEffect, useId, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";

/** จัดรูป JSON แบบอ่านง่ายบรรทัดละ stage: { "$sort": { "plays": -1 } } */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") {
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}
const pretty = (p: unknown) => "[\n" + (p as unknown[]).map((s) => "  " + inline(s)).join(",\n") + "\n]";

type Outcome = { ok: true; stages: { op: string; out: Doc[] }[] } | { ok: false; message: string };

function evaluate(text: string, lang: "th" | "en"): Outcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: (lang === "th" ? "JSON ไม่ถูกต้อง: " : "Invalid JSON: ") + (e as Error).message };
  }
  try {
    const outs = runPipeline(PLAYS, parsed);
    return {
      ok: true,
      stages: (parsed as Record<string, unknown>[]).map((s, i) => ({ op: Object.keys(s)[0] ?? "?", out: outs[i]! })),
    };
  } catch (e) {
    if (e instanceof PipelineError) {
      const [th, en] = e.message.split(" / ");
      return { ok: false, message: lang === "th" ? th! : `stage ${e.stage + 1}: ${en ?? th}` };
    }
    return { ok: false, message: String(e) };
  }
}

function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="null">null</span>;
  if (typeof v === "object") return <code>{JSON.stringify(v)}</code>;
  if (typeof v === "number") return <span className="num">{v}</span>;
  return <>{String(v)}</>;
}

export function AggregationApp() {
  const lang = useLang();
  const id = useId();
  const [text, setText] = useState(pretty(PRESETS[0]!.pipeline));
  const [debounced, setDebounced] = useState(text);
  const [view, setView] = useState<number>(-2); // -2 = stage สุดท้าย, -1 = ข้อมูลตั้งต้น

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 350);
    return () => clearTimeout(t);
  }, [text]);

  const outcome = useMemo(() => evaluate(debounced, lang), [debounced, lang]);
  const stages = outcome.ok ? outcome.stages : [];
  const shown = view === -2 ? stages.length - 1 : Math.min(view, stages.length - 1);
  const rows = shown === -1 ? PLAYS : (stages[shown]?.out ?? PLAYS);
  const columns = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))];
  const max = PLAYS.length;

  return (
    <div className="agg">
      <section className="agg-editor" aria-labelledby={`${id}-ed`}>
        <h2 className="h3" id={`${id}-ed`}>db.plays.aggregate(</h2>
        <div className="presets" role="group" aria-label={lang === "th" ? "ตัวอย่าง pipeline" : "Example pipelines"}>
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip" onClick={() => { setText(pretty(p.pipeline)); setView(-2); }}>
              {p.title[lang]}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-txt`} className="sr-only">Pipeline JSON</label>
        <textarea
          id={`${id}-txt`}
          className="agg-text"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={text}
          onChange={(e) => { setText(e.target.value); setView(-2); }}
          aria-invalid={!outcome.ok || undefined}
          aria-describedby={`${id}-err ${id}-help`}
          rows={12}
        />
        <p className="h3 agg-close" aria-hidden="true">)</p>
        <p id={`${id}-err`} className="agg-error" role="alert">{!outcome.ok && outcome.message}</p>
        <p id={`${id}-help`} className="note">
          {lang === "th"
            ? "รองรับ $match $group $sort $limit $skip $project $count — แก้แล้วผลจะอัปเดตเอง"
            : "Supports $match $group $sort $limit $skip $project $count — results update as you type."}
        </p>
      </section>

      <section className="agg-result" aria-labelledby={`${id}-res`}>
        <h2 className="h3" id={`${id}-res`}>{lang === "th" ? "ข้อมูลหลังแต่ละ stage" : "Documents after each stage"}</h2>
        <div className="flow" role="group" aria-label={lang === "th" ? "เลือก stage ที่จะดู" : "Choose a stage to inspect"}>
          {[{ op: "plays", out: PLAYS }, ...stages].map((s, i) => {
            const idx = i - 1;
            return (
              <button
                key={i}
                type="button"
                className="flow-step"
                aria-pressed={shown === idx}
                onClick={() => setView(idx)}
              >
                <span className="flow-op">{idx === -1 ? (lang === "th" ? "ต้นฉบับ" : "input") : `${i}. ${s.op}`}</span>
                <span className="flow-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (s.out.length / max) * 100)}%` }} /></span>
                <span className="flow-n">{s.out.length} docs</span>
              </button>
            );
          })}
        </div>

        <div className="table-wrap" tabIndex={0} role="region" aria-label={lang === "th" ? "ตารางผลลัพธ์" : "Result table"}>
          <table className="docs">
            <caption>
              {shown === -1 ? (lang === "th" ? "ข้อมูลต้นฉบับ" : "Input collection") : `${lang === "th" ? "หลัง stage" : "After stage"} ${shown + 1} (${stages[shown]?.op})`}
              {" — "}{rows.length} docs{rows.length > 50 ? (lang === "th" ? " (แสดง 50 แถวแรก)" : " (first 50 shown)") : ""}
            </caption>
            <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i}>{columns.map((c) => <td key={c}><Cell v={r[c]} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
