"use client";

import { cumulative, formatGpa, GRADE_POINTS, GRADES, honors, requiredAverage, termStats, type Course, type Term } from "@portfolio/tools/gpa";
import { useId, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { ConfirmButton, download, num, readFile, uid, useStoredState, useToast } from "./common";

type Data = { terms: Term[]; target: number; remaining: number };

const newCourse = (): Course => ({ id: uid(), code: "", credits: 3, grade: "A" });
const newTerm = (name: string): Term => ({ id: uid(), name, courses: [newCourse()] });

const sample = (): Data => ({
  target: 3.25,
  remaining: 60,
  terms: [
    {
      id: uid(), name: "1/2567",
      courses: [
        { id: uid(), code: "Calculus I", credits: 3, grade: "B+" },
        { id: uid(), code: "Programming I", credits: 3, grade: "A" },
        { id: uid(), code: "English I", credits: 3, grade: "B" },
        { id: uid(), code: "Physics", credits: 3, grade: "C+" },
        { id: uid(), code: "PE", credits: 1, grade: "S" },
      ],
    },
    {
      id: uid(), name: "2/2567",
      courses: [
        { id: uid(), code: "Data Structures", credits: 3, grade: "A" },
        { id: uid(), code: "Discrete Math", credits: 3, grade: "B+" },
        { id: uid(), code: "Database", credits: 3, grade: "A" },
        { id: uid(), code: "English II", credits: 3, grade: "B" },
      ],
    },
  ],
});

export function GpaApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [data, setData] = useStoredState<Data>("tool-gpa-v1", () => ({ terms: [], target: 3.25, remaining: 0 }));
  const [toast, show] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErr, setImportErr] = useState("");

  const total = cumulative(data.terms);
  const plan = requiredAverage(total, data.target, data.remaining);
  const hon = honors(total.gpa);
  const maxBar = 4;

  const setTerm = (id: string, patch: Partial<Term>) => setData((d) => ({ ...d, terms: d.terms.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setCourse = (tid: string, cid: string, patch: Partial<Course>) =>
    setData((d) => ({
      ...d,
      terms: d.terms.map((t) => (t.id === tid ? { ...t, courses: t.courses.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : t)),
    }));

  function addTerm() {
    const n = data.terms.length;
    const t = newTerm(n ? `${T("เทอม", "Term")} ${n + 1}` : "1/2568");
    setData((d) => ({ ...d, terms: [...d.terms, t] }));
    setTimeout(() => document.getElementById(`term-${t.id}`)?.focus(), 30);
  }
  function addCourse(tid: string) {
    const c = newCourse();
    setData((d) => ({ ...d, terms: d.terms.map((t) => (t.id === tid ? { ...t, courses: [...t.courses, c] } : t)) }));
    setTimeout(() => document.getElementById(`code-${c.id}`)?.focus(), 30);
  }

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await readFile(file)) as Data;
      if (!Array.isArray(parsed.terms)) throw new Error();
      setData({ target: parsed.target ?? 3.25, remaining: parsed.remaining ?? 0, terms: parsed.terms });
      setImportErr("");
      show(T("นำเข้าข้อมูลแล้ว", "Imported"));
    } catch {
      setImportErr(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองของเครื่องคำนวณเกรด", "That file isn't a GPA backup"));
    }
  }

  return (
    <div className="tool gpa">
      {toast}
      <div className="tool-main">
        {data.terms.length === 0 && (
          <section className="panel empty-state">
            <p>{T("ยังไม่มีข้อมูล เริ่มจากเพิ่มเทอมแรก หรือดูตัวอย่างก่อนก็ได้", "No terms yet — add your first one, or look at an example.")}</p>
            <div className="side-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={addTerm}>+ {T("เพิ่มเทอม", "Add a term")}</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setData(sample())}>{T("ใช้ข้อมูลตัวอย่าง", "Load example")}</button>
            </div>
          </section>
        )}

        {data.terms.map((term) => {
          const st = termStats(term.courses);
          return (
            <section key={term.id} className="panel term" aria-labelledby={`h-${term.id}`}>
              <div className="term-head">
                <h2 className="sr-only" id={`h-${term.id}`}>{term.name || T("เทอม", "Term")}</h2>
                <div className="field field--term">
                  <label htmlFor={`term-${term.id}`}>{T("ชื่อเทอม", "Term")}</label>
                  <input id={`term-${term.id}`} value={term.name} onChange={(e) => setTerm(term.id, { name: e.target.value })} />
                </div>
                <p className="term-gpa">
                  <small>GPA</small>
                  <b>{formatGpa(st.gpa)}</b>
                  <span>{st.gradedCredits} {T("หน่วยกิต", "credits")}</span>
                </p>
              </div>
              <table className="course-table">
                <thead>
                  <tr>
                    <th scope="col">{T("วิชา", "Course")}</th>
                    <th scope="col">{T("หน่วยกิต", "Credits")}</th>
                    <th scope="col">{T("เกรด", "Grade")}</th>
                    <th scope="col"><span className="sr-only">{T("ลบ", "Remove")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {term.courses.map((c, i) => (
                    <tr key={c.id}>
                      <td>
                        <input id={`code-${c.id}`} value={c.code} aria-label={`${T("ชื่อวิชา แถว", "Course name, row")} ${i + 1}`} placeholder={T("รหัส/ชื่อวิชา (ไม่ใส่ก็ได้)", "Code or name (optional)")} onChange={(e) => setCourse(term.id, c.id, { code: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" inputMode="numeric" min={0} max={12} step={1} value={c.credits || ""} aria-label={`${T("หน่วยกิต", "Credits")} — ${c.code || i + 1}`} onChange={(e) => setCourse(term.id, c.id, { credits: num(e.target.value) })} />
                      </td>
                      <td>
                        <select value={c.grade} aria-label={`${T("เกรด", "Grade")} — ${c.code || i + 1}`} onChange={(e) => setCourse(term.id, c.id, { grade: e.target.value })} data-grade={c.grade}>
                          {GRADES.map((g) => (
                            <option key={g} value={g}>{g}{GRADE_POINTS[g] === null ? ` (${T("ไม่คิดเกรด", "not graded")})` : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="icon-btn icon-btn--sm" aria-label={`${T("ลบวิชา", "Remove course")} ${c.code || i + 1}`} onClick={() => setTerm(term.id, { courses: term.courses.filter((x) => x.id !== c.id) })}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="term-actions">
                <button type="button" className="text-link" onClick={() => addCourse(term.id)}>+ {T("เพิ่มวิชา", "Add course")}</button>
                <ConfirmButton label={T("ลบเทอมนี้", "Delete term")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again to delete")} onConfirm={() => setData((d) => ({ ...d, terms: d.terms.filter((t) => t.id !== term.id) }))} />
              </div>
            </section>
          );
        })}

        {data.terms.length > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={addTerm}>+ {T("เพิ่มเทอม", "Add a term")}</button>
        )}
      </div>

      {data.terms.length > 0 && (
        <a href="#gpa-summary" className="mobile-sum">
          <span>GPAX {formatGpa(total.gpa)}</span>
          <span>{T("ดูสรุปและวางแผน ↓", "Summary & planner ↓")}</span>
        </a>
      )}
      <aside className="tool-side" id="gpa-summary" aria-labelledby={`${fid}-s`}>
        <div className="panel panel--sticky">
          <h2 className="panel-title" id={`${fid}-s`}>{T("เกรดเฉลี่ยสะสม", "Cumulative GPA")}</h2>
          <p className="big-total gpa-big">
            <small>GPAX</small>
            {formatGpa(total.gpa)}
          </p>
          <dl className="mini-dl">
            <div><dt>{T("หน่วยกิตที่คิดเกรด", "Graded credits")}</dt><dd>{total.gradedCredits}</dd></div>
            <div><dt>{T("หน่วยกิตที่ผ่าน", "Credits earned")}</dt><dd>{total.earnedCredits}</dd></div>
          </dl>
          {hon && (
            <p className="badge-line">
              {hon === "first" ? T("อยู่ในเกณฑ์เกียรตินิยมอันดับ 1", "On track for 1st-class honours") : T("อยู่ในเกณฑ์เกียรตินิยมอันดับ 2", "On track for 2nd-class honours")}
              <small>{T(" (เกณฑ์ทั่วไป 3.60 / 3.25 — เช็กข้อบังคับมหาวิทยาลัยด้วย)", " (typical 3.60 / 3.25 — check your university's rules)")}</small>
            </p>
          )}

          {data.terms.length > 1 && (
            <div className="term-bars">
              <p className="mini-title">{T("GPA แต่ละเทอม", "GPA by term")}</p>
              <ul>
                {data.terms.map((t) => {
                  const g = termStats(t.courses).gpa;
                  return (
                    <li key={t.id}>
                      <span className="tb-name">{t.name}</span>
                      <span className="tb-bar" aria-hidden="true"><i style={{ width: `${((g ?? 0) / maxBar) * 100}%` }} /></span>
                      <span className="tb-val">{formatGpa(g)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="planner">
            <p className="mini-title">{T("วางแผนเกรด", "Plan ahead")}</p>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`${fid}-t`}>{T("GPAX ที่อยากได้", "Target GPAX")}</label>
                <input id={`${fid}-t`} type="number" inputMode="decimal" min={0} max={4} step={0.01} value={data.target || ""} onChange={(e) => setData((d) => ({ ...d, target: num(e.target.value) }))} />
              </div>
              <div className="field">
                <label htmlFor={`${fid}-r`}>{T("หน่วยกิตที่เหลือ", "Credits left")}</label>
                <input id={`${fid}-r`} type="number" inputMode="numeric" min={0} step={1} value={data.remaining || ""} onChange={(e) => setData((d) => ({ ...d, remaining: num(e.target.value) }))} />
              </div>
            </div>
            <p className="plan-result" aria-live="polite">
              {!plan
                ? T("ใส่หน่วยกิตที่เหลือเพื่อดูว่าต้องได้เกรดเท่าไหร่", "Enter the credits you have left to see what you need.")
                : plan.alreadyThere
                  ? T(`ถึงเป้า ${data.target.toFixed(2)} แน่นอน แม้ได้ F ทุกวิชาที่เหลือ`, `You'll reach ${data.target.toFixed(2)} even with F in everything left.`)
                  : !plan.possible
                    ? T(`ต้องได้เฉลี่ย ${plan.need.toFixed(2)} — เกิน 4.00 จึงเป็นไปไม่ได้ ลองลดเป้าหรือเพิ่มหน่วยกิต`, `You'd need ${plan.need.toFixed(2)} — above 4.00, so it isn't reachable.`)
                    : T(`ต้องได้เฉลี่ยอย่างน้อย ${plan.need.toFixed(2)} ใน ${data.remaining} หน่วยกิตที่เหลือ`, `You need at least ${plan.need.toFixed(2)} across your remaining ${data.remaining} credits.`)}
            </p>
          </div>

          <div className="side-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={!data.terms.length} onClick={() => download("gpa-backup.json", JSON.stringify(data, null, 2), "application/json")}>
              {T("สำรองข้อมูล", "Back up")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("นำเข้า", "Restore")}</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
            {data.terms.length > 0 && (
              <ConfirmButton label={T("ล้างทั้งหมด", "Clear all")} confirmLabel={T("กดอีกครั้งเพื่อล้าง", "Tap again to clear")} onConfirm={() => setData({ terms: [], target: 3.25, remaining: 0 })} />
            )}
          </div>
          <p className="field-error" role="alert">{importErr}</p>
          <p className="privacy">{T("ข้อมูลเกรดเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่มีการส่งไปที่ไหน — กดสำรองข้อมูลไว้ถ้าจะล้างเบราว์เซอร์หรือย้ายเครื่อง", "Grades stay in this browser only. Back up before clearing your browser or switching devices.")}</p>
        </div>
      </aside>
    </div>
  );
}
