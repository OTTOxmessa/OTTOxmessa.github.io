"use client";

import { conflicts, DAY_EN, DAY_TH, hourRange, nextClass, toIcs, toMin, validSlot, weeklyHours, type Semester, type Slot } from "@portfolio/tools/timetable";
import { useEffect, useId, useState } from "react";
import { useLang } from "@/lib/useLang";
import { ConfirmButton, download, uid, useStoredState, useToast } from "./common";

type Data = { slots: Slot[]; semester: Semester };
const emptyForm = { code: "", name: "", day: 0, start: "09:00", end: "12:00", room: "" };

const sample = (): Slot[] => [
  { id: uid(), code: "CP353002", name: "Software Design", day: 0, start: "09:00", end: "12:00", room: "SC9-201", color: 0 },
  { id: uid(), code: "CP352301", name: "Operating Systems", day: 1, start: "13:00", end: "16:00", room: "SC9-305", color: 1 },
  { id: uid(), code: "CP351002", name: "Database", day: 2, start: "09:00", end: "11:00", room: "Lab 4", color: 2 },
  { id: uid(), code: "GE", name: "English", day: 3, start: "10:30", end: "12:00", room: "HS-102", color: 3 },
  { id: uid(), code: "CP353102", name: "Networks", day: 4, start: "13:00", end: "15:00", room: "SC9-201", color: 4 },
];

export function TimetableApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const DAY = lang === "th" ? DAY_TH : DAY_EN;
  const fid = useId();
  const [data, setData] = useStoredState<Data>("tool-timetable-v1", () => ({ slots: [], semester: { start: "", end: "" } }));
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const slots = data.slots;
  const clash = conflicts(slots);
  const clashIds = new Set(clash.flatMap(([a, b]) => [a.id, b.id]));
  const [lo, hi] = hourRange(slots);
  const showWeekend = slots.some((s) => s.day >= 5);
  const days = showWeekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const upcoming = now ? nextClass(slots, now) : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!validSlot(form)) {
      setErr(T("เวลาเลิกต้องหลังเวลาเริ่ม", "End time must be after start time"));
      return;
    }
    if (!form.code.trim() && !form.name.trim()) {
      setErr(T("ใส่รหัสหรือชื่อวิชาอย่างน้อยหนึ่งอย่าง", "Enter a course code or name"));
      return;
    }
    setErr("");
    if (editing) {
      setData((d) => ({ ...d, slots: d.slots.map((s) => (s.id === editing ? { ...s, ...form } : s)) }));
      show(T("แก้ไขแล้ว", "Updated"));
    } else {
      setData((d) => ({ ...d, slots: [...d.slots, { ...form, id: uid(), color: d.slots.length % 6 }] }));
      show(T(`เพิ่ม ${form.code || form.name} แล้ว`, `Added ${form.code || form.name}`));
    }
    setEditing(null);
    setForm((f) => ({ ...emptyForm, day: f.day }));
  }

  function edit(s: Slot) {
    setEditing(s.id);
    setForm({ code: s.code, name: s.name, day: s.day, start: s.start, end: s.end, room: s.room });
    document.getElementById(`${fid}-code`)?.focus();
  }

  function exportIcs() {
    if (!data.semester.start || !data.semester.end) {
      show(T("ใส่วันเปิดเทอมและปิดเทอมก่อน", "Set the semester start and end dates first"));
      document.getElementById(`${fid}-ss`)?.focus();
      return;
    }
    download("timetable.ics", toIcs(slots, data.semester), "text/calendar;charset=utf-8");
    show(T("ดาวน์โหลดไฟล์ปฏิทินแล้ว — เปิดด้วย Google Calendar หรือแอปปฏิทินได้เลย", "Calendar file downloaded — open it with your calendar app"));
  }

  const dur = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return lang === "th" ? `${h ? `${h} ชม. ` : ""}${mm ? `${mm} นาที` : ""}`.trim() || "0 นาที" : `${h ? `${h}h ` : ""}${mm ? `${mm}m` : ""}`.trim() || "0m";
  };
  const dayOffset = (m: number) => Math.floor(m / 1440);

  return (
    <div className="tool tt">
      {toast}
      <div className="tool-main">
        {slots.length > 0 && upcoming && (
          <section className="panel now-card" aria-live="polite">
            <p className="now-label">{upcoming.ongoing ? T("กำลังเรียนอยู่", "In class now") : T("คาบถัดไป", "Next class")}</p>
            <p className="now-title">{[upcoming.slot.code, upcoming.slot.name].filter(Boolean).join(" · ")}</p>
            <p className="now-meta">
              {DAY[upcoming.slot.day]} {upcoming.slot.start}–{upcoming.slot.end}
              {upcoming.slot.room && ` · ${upcoming.slot.room}`}
              {" · "}
              {upcoming.ongoing
                ? T(`เหลืออีก ${dur(upcoming.minutes)}`, `${dur(upcoming.minutes)} left`)
                : dayOffset(upcoming.minutes) >= 1
                  ? T(`อีก ${dayOffset(upcoming.minutes)} วัน`, `in ${dayOffset(upcoming.minutes)} day(s)`)
                  : T(`อีก ${dur(upcoming.minutes)}`, `in ${dur(upcoming.minutes)}`)}
            </p>
          </section>
        )}

        <section className="panel" aria-labelledby={`${fid}-g`}>
          <div className="panel-row">
            <h2 className="panel-title" id={`${fid}-g`}>{T("ตารางรายสัปดาห์", "Weekly timetable")}</h2>
            <span className="hint">{T(`รวม ${weeklyHours(slots)} ชม./สัปดาห์`, `${weeklyHours(slots)} h/week`)}</span>
          </div>
          {clash.length > 0 && (
            <div className="alert" role="alert">
              <b>{T("เวลาชนกัน:", "Time clash:")}</b>{" "}
              {clash.map(([a, b]) => `${a.code || a.name} × ${b.code || b.name} (${DAY[a.day]})`).join(", ")}
            </div>
          )}
          {slots.length === 0 ? (
            <p className="hint">
              {T("ยังไม่มีวิชา เพิ่มจากฟอร์มด้านขวา หรือ ", "No classes yet. Add one with the form, or ")}
              <button type="button" className="link-btn" onClick={() => setData((d) => ({ ...d, slots: sample() }))}>{T("ดูตัวอย่าง", "load an example")}</button>
            </p>
          ) : (
            <div className="tt-grid" style={{ "--cols": days.length, "--rows": hi - lo } as React.CSSProperties} aria-hidden="true">
              <div className="tt-corner" />
              {days.map((d) => <div key={d} className="tt-day">{DAY[d]!.slice(0, lang === "th" ? 3 : 3)}</div>)}
              <div className="tt-times">
                {Array.from({ length: hi - lo }, (_, i) => <span key={i}>{String(lo + i).padStart(2, "0")}:00</span>)}
              </div>
              {days.map((d) => (
                <div key={d} className="tt-col">
                  {slots.filter((s) => s.day === d && validSlot(s)).map((s) => {
                    const top = ((toMin(s.start) - lo * 60) / ((hi - lo) * 60)) * 100;
                    const height = ((toMin(s.end) - toMin(s.start)) / ((hi - lo) * 60)) * 100;
                    return (
                      <div key={s.id} className={`tt-block c${s.color % 6}${clashIds.has(s.id) ? " is-clash" : ""}`} style={{ top: `${top}%`, height: `${height}%` }}>
                        <b>{s.code || s.name}</b>
                        <span>{s.start}–{s.end}</span>
                        {s.room && <span>{s.room}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        {slots.length > 0 && (
          <section className="panel" aria-labelledby={`${fid}-l`}>
            <h2 className="panel-title" id={`${fid}-l`}>{T("รายการวิชา", "Classes")}</h2>
            {days.map((d) => {
              const list = slots.filter((s) => s.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
              if (!list.length) return null;
              return (
                <div key={d} className="tt-listday">
                  <h3>{DAY[d]}</h3>
                  <ul>
                    {list.map((s) => (
                      <li key={s.id} className={clashIds.has(s.id) ? "is-clash" : ""}>
                        <span className={`dot c${s.color % 6}`} aria-hidden="true" />
                        <span className="tt-time">{s.start}–{s.end}</span>
                        <span className="tt-name">{[s.code, s.name].filter(Boolean).join(" · ")}{s.room && <small> · {s.room}</small>}</span>
                        {clashIds.has(s.id) && <span className="tag-clash">{T("ชน", "clash")}</span>}
                        <button type="button" className="text-link" onClick={() => edit(s)}>{T("แก้", "Edit")}<span className="sr-only"> {s.code}</span></button>
                        <button type="button" className="icon-btn icon-btn--sm" onClick={() => setData((dd) => ({ ...dd, slots: dd.slots.filter((x) => x.id !== s.id) }))} aria-label={`${T("ลบ", "Delete")} ${s.code || s.name}`}>✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}
      </div>

      <aside className="tool-side">
        <div className="panel panel--sticky">
          <h2 className="panel-title" id={`${fid}-f`}>{editing ? T("แก้ไขวิชา", "Edit class") : T("เพิ่มวิชา", "Add a class")}</h2>
          <form onSubmit={save} className="stack-form" aria-labelledby={`${fid}-f`} noValidate>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`${fid}-code`}>{T("รหัสวิชา", "Code")}</label>
                <input id={`${fid}-code`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CP353002" />
              </div>
              <div className="field">
                <label htmlFor={`${fid}-room`}>{T("ห้อง", "Room")}</label>
                <input id={`${fid}-room`} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${fid}-name`}>{T("ชื่อวิชา", "Course name")}</label>
              <input id={`${fid}-name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-day`}>{T("วัน", "Day")}</label>
              <select id={`${fid}-day`} value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>
                {DAY.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`${fid}-st`}>{T("เริ่ม", "Start")}</label>
                <input id={`${fid}-st`} type="time" step={300} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${fid}-en`}>{T("เลิก", "End")}</label>
                <input id={`${fid}-en`} type="time" step={300} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-invalid={Boolean(err) || undefined} aria-describedby={`${fid}-err`} />
              </div>
            </div>
            <p className="field-error" id={`${fid}-err`} role="alert">{err}</p>
            <div className="side-actions">
              <button type="submit" className="btn btn-primary btn-sm">{editing ? T("บันทึก", "Save") : T("เพิ่มวิชา", "Add")}</button>
              {editing && <button type="button" className="text-link" onClick={() => { setEditing(null); setForm(emptyForm); }}>{T("ยกเลิก", "Cancel")}</button>}
            </div>
          </form>

          <div className="planner">
            <p className="mini-title">{T("ส่งออกไปปฏิทินในมือถือ", "Send to your phone's calendar")}</p>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`${fid}-ss`}>{T("วันเปิดเทอม", "Semester starts")}</label>
                <input id={`${fid}-ss`} type="date" value={data.semester.start} onChange={(e) => setData((d) => ({ ...d, semester: { ...d.semester, start: e.target.value } }))} />
              </div>
              <div className="field">
                <label htmlFor={`${fid}-se`}>{T("วันปิดเทอม", "Semester ends")}</label>
                <input id={`${fid}-se`} type="date" value={data.semester.end} onChange={(e) => setData((d) => ({ ...d, semester: { ...d.semester, end: e.target.value } }))} />
              </div>
            </div>
            <div className="side-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={!slots.length} onClick={exportIcs}>{T("ดาวน์โหลด .ics", "Download .ics")}</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={!slots.length} onClick={() => window.print()}>{T("พิมพ์ตาราง", "Print")}</button>
              {slots.length > 0 && <ConfirmButton label={T("ล้างตาราง", "Clear")} confirmLabel={T("กดอีกครั้งเพื่อล้าง", "Tap again to clear")} onConfirm={() => setData((d) => ({ ...d, slots: [] }))} />}
            </div>
            <p className="hint">{T("ไฟล์ .ics ทำให้ทุกคาบขึ้นในปฏิทินซ้ำทุกสัปดาห์จนปิดเทอม พร้อมเวลาและห้อง", "The .ics file adds every class to your calendar, repeating weekly until the semester ends.")}</p>
          </div>
          <p className="privacy">{T("ตารางเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น", "Your timetable stays in this browser.")}</p>
        </div>
      </aside>
    </div>
  );
}
