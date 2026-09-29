"use client";

import { groupCount, groupsText, makeGroups, parseNames, rng, seedFromText } from "@portfolio/tools/groups";
import { useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { CopyButton, num, useStoredState, useToast } from "./common";

type Store = { text: string; mode: "groups" | "size"; value: number; apart: [string, string][]; seed: number; picked: string[]; noRepeat: boolean };

const initial = (): Store => ({ text: "", mode: "groups", value: 4, apart: [], seed: 1, picked: [], noRepeat: true });
const SAMPLE = "แพร\nบอส\nมิ้นท์\nต้น\nฟ้า\nโอ๊ต\nเจ\nกาย\nน้ำ\nปาล์ม\nมายด์\nเฟิร์น\nบีม\nอาร์ม\nพลอย\nนัท\nกัน\nเอิร์ธ";

export function GroupsApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [st, setSt] = useStoredState<Store>("tool-groups-v1", initial);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [spin, setSpin] = useState<string | null>(null);
  const [toast, show] = useToast();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const set = (p: Partial<Store>) => setSt((x) => ({ ...x, ...p }));

  const names = useMemo(() => parseNames(st.text), [st.text]);
  const by = st.mode === "groups" ? { groups: st.value } : { size: st.value };
  const k = groupCount(names.length, by);
  const apart = st.apart.filter(([x, y]) => names.includes(x) && names.includes(y));
  const apartKey = JSON.stringify(apart);
  const result = useMemo(
    () => (names.length ? makeGroups(names, st.mode === "groups" ? { groups: st.value } : { size: st.value }, st.seed, JSON.parse(apartKey)) : null),
    [names, st.mode, st.value, st.seed, apartKey],
  );
  const label = T("กลุ่ม", "Group");
  const pool = st.noRepeat ? names.filter((n) => !st.picked.includes(n)) : names;

  function reshuffle() {
    set({ seed: (Math.random() * 2 ** 32) >>> 0 });
    show(T("สุ่มใหม่แล้ว", "Reshuffled"));
  }

  function pick() {
    if (!pool.length) return;
    const random = rng((Math.random() * 2 ** 32) >>> 0);
    const winner = pool[Math.floor(random() * pool.length)]!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (timer.current) clearInterval(timer.current);
    if (reduce || pool.length === 1) {
      setSpin(null);
      set({ picked: [...st.picked, winner] });
      return;
    }
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      setSpin(pool[Math.floor(Math.random() * pool.length)]!);
      if (n > 14) {
        clearInterval(timer.current!);
        setSpin(null);
        setSt((x) => ({ ...x, picked: [...x.picked, winner] }));
      }
    }, 70);
  }

  const last = st.picked.at(-1);

  return (
    <div className="tool groups">
      {toast}
      <div className="tool-main">
        <section className="panel" aria-labelledby={`${fid}-n`}>
          <h2 className="panel-title" id={`${fid}-n`}><span className="step">1</span>{T("รายชื่อ", "Names")}</h2>
          <label htmlFor={`${fid}-txt`} className="sr-only">{T("รายชื่อ บรรทัดละคน", "Names, one per line")}</label>
          <textarea id={`${fid}-txt`} rows={8} value={st.text} onChange={(e) => set({ text: e.target.value })} placeholder={T("วางรายชื่อ บรรทัดละคน (ก๊อปจาก Excel หรือ LINE ได้)", "Paste names, one per line (from Excel or chat)")} aria-describedby={`${fid}-cnt`} />
          <p className="hint" id={`${fid}-cnt`}>
            {T(`${names.length} คน (ตัดชื่อซ้ำและเลขลำดับออกให้แล้ว)`, `${names.length} people (duplicates and numbering removed)`)}
            {names.length === 0 && <> · <button type="button" className="link-btn" onClick={() => set({ text: SAMPLE })}>{T("ใช้รายชื่อตัวอย่าง", "use sample names")}</button></>}
          </p>
        </section>

        <section className="panel" aria-labelledby={`${fid}-o`}>
          <h2 className="panel-title" id={`${fid}-o`}><span className="step">2</span>{T("แบ่งยังไง", "How to split")}</h2>
          <div className="seg seg--wide" role="group" aria-label={T("วิธีแบ่ง", "Split by")}>
            <button type="button" aria-pressed={st.mode === "groups"} onClick={() => set({ mode: "groups" })}>{T("กำหนดจำนวนกลุ่ม", "Number of groups")}</button>
            <button type="button" aria-pressed={st.mode === "size"} onClick={() => set({ mode: "size" })}>{T("กำหนดคนต่อกลุ่ม", "People per group")}</button>
          </div>
          <div className="grid-2" style={{ marginTop: "0.75rem" }}>
            <div className="field">
              <label htmlFor={`${fid}-v`}>{st.mode === "groups" ? T("จำนวนกลุ่ม", "Groups") : T("คนต่อกลุ่ม", "People per group")}</label>
              <input id={`${fid}-v`} type="number" inputMode="numeric" min={1} max={100} value={st.value || ""} onChange={(e) => set({ value: Math.max(1, Math.round(num(e.target.value)) || 1) })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-seed`}>{T("รหัสการสุ่ม", "Shuffle code")}</label>
              <input id={`${fid}-seed`} value={st.seed} inputMode="numeric" onChange={(e) => set({ seed: /^\d+$/.test(e.target.value) ? Number(e.target.value) >>> 0 : seedFromText(e.target.value) })} aria-describedby={`${fid}-seedh`} />
            </div>
          </div>
          <p className="hint" id={`${fid}-seedh`}>{T("รหัสเดิม + รายชื่อเดิม = ผลเดิมเสมอ บอกรหัสนี้ให้คนอื่นตรวจได้ว่าสุ่มจริง", "Same code + same names = same result, so others can check the draw was fair.")}</p>

          <p className="mini-title">{T("คู่ที่ไม่ให้อยู่กลุ่มเดียวกัน", "Keep these apart")}</p>
          <div className="apart-form">
            <label className="sr-only" htmlFor={`${fid}-a`}>{T("คนที่ 1", "Person 1")}</label>
            <select id={`${fid}-a`} value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">{T("— เลือก —", "— choose —")}</option>
              {names.map((n) => <option key={n}>{n}</option>)}
            </select>
            <span aria-hidden="true">×</span>
            <label className="sr-only" htmlFor={`${fid}-b`}>{T("คนที่ 2", "Person 2")}</label>
            <select id={`${fid}-b`} value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">{T("— เลือก —", "— choose —")}</option>
              {names.filter((n) => n !== a).map((n) => <option key={n}>{n}</option>)}
            </select>
            <button type="button" className="btn btn-outline btn-sm" disabled={!a || !b || a === b} onClick={() => { set({ apart: [...st.apart, [a, b]] }); setA(""); setB(""); }}>{T("เพิ่ม", "Add")}</button>
          </div>
          {apart.length > 0 && (
            <ul className="apart-list">
              {apart.map(([x, y], i) => (
                <li key={`${x}-${y}-${i}`}>{x} × {y} <button type="button" className="chip-x" aria-label={`${T("ลบเงื่อนไข", "Remove rule")} ${x} ${y}`} onClick={() => set({ apart: st.apart.filter((p) => !(p[0] === x && p[1] === y)) })}>✕</button></li>
              ))}
            </ul>
          )}
        </section>

        {result && (
          <section className="panel" aria-labelledby={`${fid}-r`}>
            <div className="panel-row">
              <h2 className="panel-title" id={`${fid}-r`}><span className="step">3</span>{T(`ผลการแบ่ง ${k} กลุ่ม`, `${k} groups`)}</h2>
              <div className="side-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={reshuffle}>{T("สุ่มใหม่", "Shuffle again")}</button>
                <CopyButton text={groupsText(result.groups, label)} label={T("คัดลอก", "Copy")} done={T("คัดลอกแล้ว วางใน LINE ได้เลย", "Copied — paste it anywhere")} notify={show} />
              </div>
            </div>
            {result.unmet > 0 && <p className="alert" role="alert">{T(`มี ${result.unmet} เงื่อนไขที่ทำไม่ได้ (กลุ่มน้อยเกินไป) — ลองเพิ่มจำนวนกลุ่ม`, `${result.unmet} rule(s) couldn't be met — try more groups`)}</p>}
            <ol className="group-grid">
              {result.groups.map((g, i) => (
                <li key={i} className={`group-card c${i % 6}`}>
                  <h3>{label} {i + 1} <small>({g.length})</small></h3>
                  <ul>{g.map((n) => <li key={n}>{n}</li>)}</ul>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <aside className="tool-side">
        <div className="panel panel--sticky">
          <h2 className="panel-title">{T("สุ่มเลือก 1 คน", "Pick someone")}</h2>
          <div className={`picker${spin ? " is-spinning" : ""}`} aria-hidden={Boolean(spin) || undefined}>
            {spin ?? last ?? T("พร้อมสุ่ม", "Ready")}
          </div>
          <p className="sr-only" role="status" aria-live="polite">{!spin && last ? T(`ได้ ${last}`, `Picked ${last}`) : ""}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={pick} disabled={!pool.length || Boolean(spin)}>
            {pool.length ? T("สุ่มเลย", "Pick") : names.length ? T("สุ่มครบทุกคนแล้ว", "Everyone's been picked") : T("ใส่รายชื่อก่อน", "Add names first")}
          </button>
          <label className="check"><input type="checkbox" checked={st.noRepeat} onChange={(e) => set({ noRepeat: e.target.checked })} />{T("ไม่ซ้ำคนที่ถูกเลือกไปแล้ว", "Don't repeat people")}</label>
          {st.picked.length > 0 && (
            <>
              <p className="mini-title">{T(`ถูกเลือกแล้ว (${st.picked.length})`, `Picked (${st.picked.length})`)}</p>
              <ol className="picked-list">{st.picked.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}</ol>
              <button type="button" className="text-link" onClick={() => set({ picked: [] })}>{T("ล้างประวัติการสุ่ม", "Clear history")}</button>
            </>
          )}
          <p className="privacy">{T("รายชื่อเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น", "Names stay in this browser.")}</p>
        </div>
      </aside>
    </div>
  );
}
