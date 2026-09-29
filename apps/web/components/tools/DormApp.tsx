"use client";

import {
  daysOverdue,
  generateInvoices,
  lastMonths,
  monthReport,
  prevMonth,
  reading,
  units,
  type Extra,
  type Invoice,
  type Reading,
  type Room,
  type Settings,
} from "@portfolio/tools/dorm";
import { detectKind, sanitizeId } from "@portfolio/tools/promptpay";
import { bahtText } from "@portfolio/tools/thai-text";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, ConfirmButton, download, num, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { PromptPayQr } from "./PromptPayQr";
import { Modal, PrintSheet, printNow, Tabs, useHashView } from "./ui";

type Store = { rooms: Room[]; readings: Reading[]; invoices: Invoice[]; settings: Settings };
type View = "rooms" | "meters" | "bills" | "summary" | "settings";
const VIEWS = ["rooms", "meters", "bills", "summary", "settings"] as const;

const defaultSettings: Settings = { name: "หอพักของฉัน", waterRate: 18, waterMin: 100, electricRate: 8, dueDay: 5, promptpay: "", note: "กรุณาชำระภายในวันที่กำหนด ขอบคุณค่ะ/ครับ" };
const empty = (): Store => ({ rooms: [], readings: [], invoices: [], settings: defaultSettings });
const monthNow = () => todayIso().slice(0, 7);

function sample(): Store {
  const names = ["สมชาย ใจดี", "วรรณา ศรีสุข", "ธนพล แก้วมณี", "กมลชนก ทองดี", "ปิยะ วงศ์ใหญ่", "ณัฐธิดา บุญมา"];
  const rooms: Room[] = ["101", "102", "103", "104", "201", "202", "203", "204"].map((n, i) => ({
    id: uid(),
    number: n,
    rent: n.startsWith("2") ? 3800 : 3500,
    tenant: i < names.length ? { name: names[i]!, phone: `08${String(10000000 + i * 1234567).slice(0, 8)}` } : null,
    extras: i % 2 === 0 && i < names.length ? [{ name: "อินเทอร์เน็ต", amount: 200 }] : [],
  }));
  // ประวัติ 6 เดือน: มีเลขมิเตอร์ทุกเดือน, บิลย้อนหลัง 5 เดือน (เดือนล่าสุดยังค้าง 2 ห้อง)
  // เดือนปัจจุบันจดมิเตอร์แล้วเกือบครบ (เว้นไว้ 1 ห้องให้เห็นคำเตือน) — พร้อมกด “ออกบิล”
  const cur = monthNow();
  const months = lastMonths(cur, 7);
  const readings: Reading[] = [];
  rooms.forEach((r, i) => {
    let w = 100 + i * 37;
    let e = 4000 + i * 311;
    months.forEach((m, k) => {
      if (k > 0) {
        w += r.tenant ? 5 + ((i + k) % 4) * 2 : 0;
        e += r.tenant ? 80 + ((i * 13 + k * 29) % 70) : 0;
      }
      if (m === cur && i === 5) return;
      readings.push({ roomId: r.id, month: m, water: w, electric: e });
    });
  });
  const st = { ...defaultSettings, name: "บ้านสบาย อพาร์ตเมนต์" };
  let invoices: Invoice[] = [];
  months.slice(1, -1).forEach((m, k, arr) => {
    const before = invoices.length;
    invoices = generateInvoices(rooms, readings, invoices, st, m, uid).invoices;
    const last = k === arr.length - 1;
    invoices = invoices.map((inv, j) => (j < before ? inv : last && j >= invoices.length - 2 ? inv : { ...inv, status: "paid" as const, paidAt: `${cur}-01` }));
  });
  return { rooms, readings, invoices, settings: st };
}

export function DormApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const [store, setStore, ready] = useStoredState<Store>("tool-dorm-v1", empty);
  const [view, setViewRaw] = useState<View>("rooms");
  const setView = useHashView(VIEWS, "rooms", setViewRaw);
  const [month, setMonth] = useState("2026-01");
  const [today, setToday] = useState("2026-01-01");
  const [toast, show] = useToast();
  const [printList, setPrintList] = useState<Invoice[]>([]);
  useEffect(() => {
    setMonth(monthNow());
    setToday(todayIso());
  }, []);
  const money = (n: number) => baht(n, lang);

  const unpaid = store.invoices.filter((i) => i.status === "unpaid");
  const tabs = [
    { id: "rooms" as const, label: T("ห้องพัก", "Rooms") },
    { id: "meters" as const, label: T("จดมิเตอร์", "Meters") },
    { id: "bills" as const, label: T("บิลรายเดือน", "Bills"), badge: unpaid.length || undefined },
    { id: "summary" as const, label: T("สรุป", "Summary") },
    { id: "settings" as const, label: T("ตั้งค่า", "Settings") },
  ];

  function print(list: Invoice[]) {
    setPrintList(list);
    printNow();
  }

  const ctx = { store, setStore, T, money, show, month, setMonth, today };

  return (
    <div className="bigapp dorm">
      {toast}
      <div className="bigapp-bar">
        <p className="bigapp-name">{store.settings.name}</p>
        <Tabs tabs={tabs} value={view} onChange={setView} label={T("เมนูระบบหอพัก", "Dorm sections")} />
      </div>
      {ready && store.rooms.length === 0 && view !== "settings" && (
        <div className="panel empty-state">
          <p>{T("ยังไม่มีห้องพัก เพิ่มห้องในแท็บ “ห้องพัก” หรือดูตัวอย่างหอพัก 8 ห้องที่มีมิเตอร์และบิลเดือนที่แล้ว", "No rooms yet. Add rooms, or load a sample 8-room building with last month's meters and bills.")}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setStore(sample()); show(T("โหลดข้อมูลตัวอย่างแล้ว", "Sample loaded")); }}>{T("ใช้ข้อมูลตัวอย่าง", "Load sample")}</button>
          </div>
        </div>
      )}
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === view)!.label}>
        {view === "rooms" && <RoomsView {...ctx} />}
        {view === "meters" && <MetersView {...ctx} />}
        {view === "bills" && <BillsView {...ctx} onPrint={print} />}
        {view === "summary" && <SummaryView {...ctx} />}
        {view === "settings" && <SettingsView {...ctx} />}
      </div>
      <PrintSheet>
        {printList.map((inv) => {
          const room = store.rooms.find((r) => r.id === inv.roomId);
          return room ? <InvoiceDoc key={inv.id} inv={inv} room={room} st={store.settings} T={T} money={money} /> : null;
        })}
      </PrintSheet>
    </div>
  );
}

type Ctx = {
  store: Store;
  setStore: (f: Store | ((s: Store) => Store)) => void;
  T: (th: string, en: string) => string;
  money: (n: number) => string;
  show: (m: string) => void;
  month: string;
  setMonth: (m: string) => void;
  today: string;
};

function MonthPicker({ month, setMonth, T }: Pick<Ctx, "month" | "setMonth" | "T">) {
  const id = useId();
  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  return (
    <div className="month-nav month-nav--inline">
      <button type="button" className="icon-btn icon-btn--sm" onClick={() => setMonth(prevMonth(month))} aria-label={T("เดือนก่อน", "Previous month")}>‹</button>
      <label htmlFor={id} className="sr-only">{T("เดือน", "Month")}</label>
      <input id={id} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      <span className="month-label" aria-hidden="true">{label}</span>
      <button type="button" className="icon-btn icon-btn--sm" onClick={() => { const [y, m] = month.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m, 1)); setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }} aria-label={T("เดือนถัดไป", "Next month")}>›</button>
    </div>
  );
}

/* ------------------------------------------------------------------ ROOMS */
function RoomsView({ store, setStore, T, money, show }: Ctx) {
  const [edit, setEdit] = useState<Room | null>(null);
  const [err, setErr] = useState("");
  const fid = useId();
  const occupied = store.rooms.filter((r) => r.tenant).length;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (!edit.number.trim()) return setErr(T("ใส่เลขห้อง", "Enter a room number"));
    if (store.rooms.some((r) => r.number === edit.number.trim() && r.id !== edit.id)) return setErr(T("มีเลขห้องนี้แล้ว", "That room number exists"));
    const room: Room = { ...edit, number: edit.number.trim(), tenant: edit.tenant && edit.tenant.name.trim() ? { name: edit.tenant.name.trim(), phone: edit.tenant.phone.trim() } : null, extras: edit.extras.filter((x) => x.name.trim() && x.amount > 0) };
    setStore((s) => ({ ...s, rooms: s.rooms.some((r) => r.id === room.id) ? s.rooms.map((r) => (r.id === room.id ? room : r)) : [...s.rooms, room].sort((a, b) => a.number.localeCompare(b.number, "th", { numeric: true })) }));
    show(T(`บันทึกห้อง ${room.number} แล้ว`, `Room ${room.number} saved`));
    setEdit(null);
  }

  const setExtra = (i: number, p: Partial<Extra>) => edit && setEdit({ ...edit, extras: edit.extras.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("ห้องพัก", "Rooms")} <span className="muted-count">({occupied}/{store.rooms.length} {T("มีผู้เช่า", "occupied")})</span></h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setErr(""); setEdit({ id: uid(), number: "", rent: store.rooms.at(-1)?.rent ?? 3500, tenant: { name: "", phone: "" }, extras: [] }); }}>+ {T("เพิ่มห้อง", "Add room")}</button>
      </div>
      <ul className="room-grid">
        {store.rooms.map((r) => (
          <li key={r.id} className={`room-card${r.tenant ? "" : " is-vacant"}`}>
            <div className="rc-top">
              <b className="rc-no">{r.number}</b>
              <span className={`pill${r.tenant ? " pill--ok" : ""}`}>{r.tenant ? T("มีผู้เช่า", "Occupied") : T("ว่าง", "Vacant")}</span>
            </div>
            <p className="rc-tenant">{r.tenant?.name ?? "—"}</p>
            <p className="rc-rent">฿{money(r.rent)}<small>/{T("เดือน", "mo")}</small>{r.extras.length > 0 && <small> + {r.extras.map((x) => x.name).join(", ")}</small>}</p>
            <button type="button" className="text-link" onClick={() => { setErr(""); setEdit(structuredClone({ ...r, tenant: r.tenant ?? { name: "", phone: "" } })); }}>{T("แก้ไข", "Edit")}<span className="sr-only"> {T("ห้อง", "room")} {r.number}</span></button>
          </li>
        ))}
      </ul>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit && store.rooms.some((r) => r.id === edit.id) ? `${T("แก้ไขห้อง", "Edit room")} ${edit.number}` : T("เพิ่มห้อง", "Add room")}>
        {edit && (
          <form className="stack-form" onSubmit={save} noValidate>
            <div className="grid-2">
              <div className="field"><label htmlFor={`${fid}-n`}>{T("เลขห้อง", "Room no.")}</label><input id={`${fid}-n`} value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} autoFocus /></div>
              <div className="field"><label htmlFor={`${fid}-r`}>{T("ค่าเช่า/เดือน", "Rent/month")}</label><input id={`${fid}-r`} type="number" inputMode="decimal" min={0} value={edit.rent || ""} onChange={(e) => setEdit({ ...edit, rent: num(e.target.value) })} /></div>
              <div className="field"><label htmlFor={`${fid}-t`}>{T("ชื่อผู้เช่า (เว้นว่าง = ห้องว่าง)", "Tenant (blank = vacant)")}</label><input id={`${fid}-t`} value={edit.tenant?.name ?? ""} onChange={(e) => setEdit({ ...edit, tenant: { name: e.target.value, phone: edit.tenant?.phone ?? "" } })} /></div>
              <div className="field"><label htmlFor={`${fid}-ph`}>{T("เบอร์โทร", "Phone")}</label><input id={`${fid}-ph`} type="tel" inputMode="tel" value={edit.tenant?.phone ?? ""} onChange={(e) => setEdit({ ...edit, tenant: { name: edit.tenant?.name ?? "", phone: e.target.value } })} /></div>
            </div>
            <fieldset className="extras">
              <legend>{T("ค่าใช้จ่ายรายเดือนอื่น (เช่น อินเทอร์เน็ต ที่จอดรถ)", "Other monthly charges (internet, parking…)")}</legend>
              {edit.extras.map((x, i) => (
                <div key={i} className="extra-row">
                  <input aria-label={`${T("รายการ", "Item")} ${i + 1}`} value={x.name} onChange={(e) => setExtra(i, { name: e.target.value })} />
                  <input aria-label={`${T("จำนวนเงิน", "Amount")} ${i + 1}`} type="number" inputMode="decimal" min={0} value={x.amount || ""} onChange={(e) => setExtra(i, { amount: num(e.target.value) })} />
                  <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEdit({ ...edit, extras: edit.extras.filter((_, j) => j !== i) })} aria-label={`${T("ลบ", "Remove")} ${x.name}`}>✕</button>
                </div>
              ))}
              <button type="button" className="text-link" onClick={() => setEdit({ ...edit, extras: [...edit.extras, { name: "", amount: 0 }] })}>+ {T("เพิ่มรายการ", "Add charge")}</button>
            </fieldset>
            <p className="field-error" role="alert">{err}</p>
            <div className="side-actions">
              <button type="submit" className="btn btn-primary btn-sm">{T("บันทึก", "Save")}</button>
              {store.rooms.some((r) => r.id === edit.id) && (
                <ConfirmButton label={T("ลบห้องนี้", "Delete room")} confirmLabel={T("กดอีกครั้งเพื่อลบห้อง", "Tap again to delete")} onConfirm={() => { setStore((s) => ({ ...s, rooms: s.rooms.filter((r) => r.id !== edit.id) })); setEdit(null); }} />
              )}
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ METERS */
function MetersView({ store, setStore, T, month, setMonth }: Ctx) {
  const prev = prevMonth(month);
  const rooms = [...store.rooms].sort((a, b) => Number(!a.tenant) - Number(!b.tenant) || a.number.localeCompare(b.number, "th", { numeric: true }));

  function setReading(roomId: string, m: string, key: "water" | "electric", value: string) {
    setStore((s) => {
      const existing = reading(s.readings, roomId, m);
      const v = value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
      if (!existing) {
        if (v === null) return s;
        return { ...s, readings: [...s.readings, { roomId, month: m, water: key === "water" ? v : null, electric: key === "electric" ? v : null }] };
      }
      return { ...s, readings: s.readings.map((r) => (r === existing ? { ...r, [key]: v } : r)) };
    });
  }
  const val = (n: number | null | undefined) => (n === undefined || n === null ? "" : String(n));
  const done = rooms.filter((r) => r.tenant && reading(store.readings, r.id, month)?.water != null && reading(store.readings, r.id, month)?.electric != null).length;
  const occ = rooms.filter((r) => r.tenant).length;

  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("จดมิเตอร์", "Meter readings")} <span className="muted-count">({done}/{occ})</span></h2>
        <MonthPicker month={month} setMonth={setMonth} T={T} />
      </div>
      <p className="hint">{T("ใส่เลขบนมิเตอร์ ณ สิ้นเดือน — ระบบคำนวณหน่วยที่ใช้จากเลขเดือนก่อนให้เอง ถ้าเป็นเดือนแรก ใส่เลขตั้งต้นในช่อง “เดือนก่อน”", "Enter end-of-month meter numbers; usage is computed from last month. For the first month, fill in the “previous” box.")}</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางจดมิเตอร์", "Meter table")}>
        <table className="docs meters">
          <thead>
            <tr>
              <th scope="col">{T("ห้อง", "Room")}</th>
              <th scope="col">{T("น้ำ เดือนก่อน", "Water prev")}</th><th scope="col">{T("น้ำ เดือนนี้", "Water now")}</th><th scope="col">{T("หน่วย", "Units")}</th>
              <th scope="col">{T("ไฟ เดือนก่อน", "Elec. prev")}</th><th scope="col">{T("ไฟ เดือนนี้", "Elec. now")}</th><th scope="col">{T("หน่วย", "Units")}</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const p = reading(store.readings, r.id, prev);
              const c = reading(store.readings, r.id, month);
              const w = units(p?.water ?? null, c?.water ?? null);
              const e = units(p?.electric ?? null, c?.electric ?? null);
              const cell = (m: string, key: "water" | "electric", v: string, label: string, invalid?: boolean) => (
                <td><input className="meter-input" type="number" inputMode="numeric" min={0} value={v} aria-label={`${T("ห้อง", "Room")} ${r.number} ${label}`} aria-invalid={invalid || undefined} onChange={(ev) => setReading(r.id, m, key, ev.target.value)} /></td>
              );
              return (
                <tr key={r.id} className={r.tenant ? "" : "row-muted"}>
                  <th scope="row">{r.number}{!r.tenant && <small> ({T("ว่าง", "vacant")})</small>}</th>
                  {cell(prev, "water", val(p?.water), T("น้ำเดือนก่อน", "water previous"))}
                  {cell(month, "water", val(c?.water), T("น้ำเดือนนี้", "water this month"), w.error === "เลขมิเตอร์น้อยกว่าเดือนก่อน")}
                  <td className={`num${w.error === "เลขมิเตอร์น้อยกว่าเดือนก่อน" ? " bad" : ""}`}>{w.error ? (w.error === "เลขมิเตอร์น้อยกว่าเดือนก่อน" ? "!" : "–") : w.units}</td>
                  {cell(prev, "electric", val(p?.electric), T("ไฟเดือนก่อน", "electricity previous"))}
                  {cell(month, "electric", val(c?.electric), T("ไฟเดือนนี้", "electricity this month"), e.error === "เลขมิเตอร์น้อยกว่าเดือนก่อน")}
                  <td className={`num${e.error === "เลขมิเตอร์น้อยกว่าเดือนก่อน" ? " bad" : ""}`}>{e.error ? (e.error === "เลขมิเตอร์น้อยกว่าเดือนก่อน" ? "!" : "–") : e.units}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{T("“!” = เลขเดือนนี้น้อยกว่าเดือนก่อน ให้ตรวจการจดอีกครั้ง", "“!” means this month's number is lower than last month's — check the reading.")}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ BILLS */
function InvoiceDoc({ inv, room, st, T, money }: { inv: Invoice; room: Room; st: Settings; T: Ctx["T"]; money: Ctx["money"] }) {
  const pp = sanitizeId(st.promptpay);
  const label = new Date(`${inv.month}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const [y, m] = inv.month.split("-").map(Number) as [number, number];
  const due = new Date(y, m, st.dueDay).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className={`invoice${inv.status === "paid" ? " is-paid" : ""}`}>
      <header className="inv-head">
        <div>
          <p className="inv-shop">{st.name}</p>
          <p className="inv-title">{T("ใบแจ้งค่าเช่า", "Rent invoice")} · {label}</p>
        </div>
        <div className="inv-room"><small>{T("ห้อง", "Room")}</small><b>{room.number}</b></div>
      </header>
      <p className="inv-tenant">{room.tenant?.name ?? "—"}</p>
      <table>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}><td>{l.label}{l.detail && <small>{l.detail}</small>}</td><td>{money(l.amount)}</td></tr>
          ))}
          <tr className="inv-total"><td>{T("รวมทั้งสิ้น", "Total")}</td><td>{money(inv.total)}</td></tr>
        </tbody>
      </table>
      <p className="inv-words">({bahtText(inv.total)})</p>
      <div className="inv-foot">
        <div>
          <p>{T("กำหนดชำระภายใน", "Due by")} <b>{due}</b></p>
          {inv.status === "paid" && <p className="inv-paid">{T("ชำระแล้ว", "PAID")} {inv.paidAt ?? ""}</p>}
          {st.note && <p className="muted">{st.note}</p>}
        </div>
        {inv.status === "unpaid" && detectKind(pp) && <PromptPayQr id={pp} amount={inv.total} size={140} label={T(`QR พร้อมเพย์ ${money(inv.total)} บาท`, `PromptPay QR for ${money(inv.total)} baht`)} />}
      </div>
    </article>
  );
}

function BillsView({ store, setStore, T, money, show, month, setMonth, today, onPrint }: Ctx & { onPrint: (l: Invoice[]) => void }) {
  const [problems, setProblems] = useState<{ room: string; message: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const list = store.invoices.filter((i) => i.month === month).sort((a, b) => {
    const ra = store.rooms.find((r) => r.id === a.roomId)?.number ?? "";
    const rb = store.rooms.find((r) => r.id === b.roomId)?.number ?? "";
    return ra.localeCompare(rb, "th", { numeric: true });
  });
  const rep = monthReport(store.rooms, store.invoices, month);
  const current = store.invoices.find((i) => i.id === open) ?? null;
  const room = (id: string) => store.rooms.find((r) => r.id === id);

  function generate(regen: boolean) {
    const r = generateInvoices(store.rooms, store.readings, store.invoices, store.settings, month, uid, regen);
    setStore((s) => ({ ...s, invoices: r.invoices }));
    setProblems(r.problems);
    show(r.created ? T(`ออกบิล ${r.created} ห้องแล้ว`, `Created ${r.created} bill(s)`) : T("ไม่มีบิลใหม่ (ออกครบแล้ว)", "No new bills — all issued"));
  }
  function setPaid(id: string, paid: boolean) {
    setStore((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === id ? { ...i, status: paid ? "paid" : "unpaid", paidAt: paid ? today : null } : i)) }));
  }

  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("บิลรายเดือน", "Monthly bills")}</h2>
        <MonthPicker month={month} setMonth={setMonth} T={T} />
      </div>
      <div className="side-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => generate(false)} disabled={!store.rooms.some((r) => r.tenant)}>{T("ออกบิลเดือนนี้", "Issue this month's bills")}</button>
        {list.some((i) => i.status === "unpaid") && <button type="button" className="btn btn-outline btn-sm" onClick={() => generate(true)}>{T("คำนวณบิลที่ยังไม่จ่ายใหม่", "Recalculate unpaid bills")}</button>}
        {list.length > 0 && <button type="button" className="btn btn-outline btn-sm" onClick={() => onPrint(list)}>{T(`พิมพ์ทั้งหมด (${list.length})`, `Print all (${list.length})`)}</button>}
      </div>
      {problems.length > 0 && (
        <div className="alert" role="alert">
          <b>{T("ตรวจก่อนส่งบิล:", "Check before sending:")}</b> {problems.map((p) => `${T("ห้อง", "Room")} ${p.room} — ${p.message}`).join(" · ")}
        </div>
      )}
      <dl className="money-kpis kpis-4">
        <div><dt>{T("ยอดเรียกเก็บ", "Billed")}</dt><dd>{money(rep.billed)}</dd></div>
        <div className="k-in"><dt>{T("เก็บได้แล้ว", "Collected")}</dt><dd>{money(rep.collected)}</dd></div>
        <div className={rep.outstanding > 0 ? "k-neg" : ""}><dt>{T("ค้างชำระ", "Outstanding")}</dt><dd>{money(rep.outstanding)}</dd></div>
        <div><dt>{T("จ่ายแล้ว", "Paid")}</dt><dd>{rep.paid}/{rep.invoices}</dd></div>
      </dl>
      {list.length === 0 ? <p className="hint">{T("ยังไม่ได้ออกบิลเดือนนี้ — จดมิเตอร์ให้ครบแล้วกด “ออกบิลเดือนนี้”", "No bills yet — record meters, then issue the bills.")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("รายการบิล", "Bills")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("ห้อง", "Room")}</th><th scope="col">{T("ผู้เช่า", "Tenant")}</th><th scope="col">{T("ยอด", "Total")}</th><th scope="col">{T("สถานะ", "Status")}</th><th scope="col"><span className="sr-only">{T("จัดการ", "Actions")}</span></th></tr></thead>
            <tbody>
              {list.map((i) => {
                const od = daysOverdue(i, store.settings, today);
                return (
                  <tr key={i.id}>
                    <th scope="row">{room(i.roomId)?.number}</th>
                    <td>{room(i.roomId)?.tenant?.name ?? "—"}</td>
                    <td className="num">{money(i.total)}</td>
                    <td>
                      <label className="check check--inline">
                        <input type="checkbox" checked={i.status === "paid"} onChange={(e) => setPaid(i.id, e.target.checked)} />
                        {i.status === "paid" ? T("จ่ายแล้ว", "Paid") : od > 0 ? <span className="tag-clash">{T(`เกิน ${od} วัน`, `${od}d late`)}</span> : T("รอชำระ", "Unpaid")}
                        <span className="sr-only"> {T("ห้อง", "room")} {room(i.roomId)?.number}</span>
                      </label>
                    </td>
                    <td><button type="button" className="text-link" onClick={() => setOpen(i.id)}>{T("ดูบิล", "View")}<span className="sr-only"> {room(i.roomId)?.number}</span></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={current !== null} onClose={() => setOpen(null)} title={current ? `${T("บิลห้อง", "Bill — room")} ${room(current.roomId)?.number}` : ""} wide>
        {current && room(current.roomId) && (
          <>
            <InvoiceDoc inv={current} room={room(current.roomId)!} st={store.settings} T={T} money={money} />
            <div className="side-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onPrint([current])}>{T("พิมพ์", "Print")}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaid(current.id, current.status !== "paid")}>{current.status === "paid" ? T("ยกเลิกสถานะจ่ายแล้ว", "Mark unpaid") : T("บันทึกว่าจ่ายแล้ว", "Mark paid")}</button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ SUMMARY */
function SummaryView({ store, T, money, month, setMonth, today }: Ctx) {
  const months = lastMonths(month, 6);
  const reps = months.map((m) => ({ m, ...monthReport(store.rooms, store.invoices, m) }));
  const max = Math.max(1, ...reps.map((r) => r.billed));
  const cur = reps.at(-1)!;
  const overdue = store.invoices.filter((i) => i.status === "unpaid").map((i) => ({ i, days: daysOverdue(i, store.settings, today), room: store.rooms.find((r) => r.id === i.roomId) })).sort((a, b) => b.days - a.days);
  return (
    <div className="report-grid">
      <section className="panel">
        <div className="panel-row">
          <h2 className="panel-title">{T("สรุปรายเดือน", "Monthly summary")}</h2>
          <MonthPicker month={month} setMonth={setMonth} T={T} />
        </div>
        <dl className="money-kpis kpis-4">
          <div><dt>{T("อัตราเข้าพัก", "Occupancy")}</dt><dd>{cur.occupancy}%</dd></div>
          <div><dt>{T("ค่าเช่า", "Rent")}</dt><dd>{money(cur.rent)}</dd></div>
          <div><dt>{T("ค่าน้ำ", "Water")}</dt><dd>{money(cur.water)}</dd></div>
          <div><dt>{T("ค่าไฟ", "Electricity")}</dt><dd>{money(cur.electric)}</dd></div>
        </dl>
        <p className="mini-title">{T("รายได้ 6 เดือน (เรียกเก็บ / เก็บได้)", "6-month income (billed / collected)")}</p>
        <ul className="year-bars">
          {reps.map((r) => (
            <li key={r.m}>
              <span className="yb-label">{new Date(`${r.m}-01T00:00:00`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</span>
              <span className="yb-bar yb-bar--stack" aria-hidden="true">
                <i className="yb-i" style={{ width: `${(r.collected / max) * 100}%` }} />
                <i className="yb-p" style={{ width: `${((r.billed - r.collected) / max) * 100}%` }} />
              </span>
              <span className="yb-val">{money(r.collected)} / {money(r.billed)}</span>
            </li>
          ))}
        </ul>
        <p className="legend"><i className="yb-i" /> {T("เก็บได้", "Collected")} <i className="yb-p" /> {T("ค้าง", "Outstanding")}</p>
      </section>
      <section className="panel">
        <h2 className="panel-title">{T("ค้างชำระทั้งหมด", "All outstanding")}</h2>
        {overdue.length === 0 ? <p className="hint">{T("ไม่มียอดค้าง 🎉", "Nothing outstanding")}</p> : (
          <ul className="top-list">
            {overdue.map(({ i, days, room }) => (
              <li key={i.id}>
                <span>{T("ห้อง", "Room")} {room?.number} · {new Date(`${i.month}-01T00:00:00`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}{room?.tenant?.phone && <small> · {room.tenant.phone}</small>}</span>
                <span className="mono">฿{money(i.total)} {days > 0 && <span className="tag-clash">{T(`${days} วัน`, `${days}d`)}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ SETTINGS */
function SettingsView({ store, setStore, T, show }: Ctx) {
  const fid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const st = store.settings;
  const set = (p: Partial<Settings>) => setStore((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  const pp = sanitizeId(st.promptpay);
  const ppErr = pp && !detectKind(pp) ? T("ใส่เบอร์มือถือ 10 หลัก หรือเลข 13 หลัก", "Use a 10-digit mobile or 13-digit ID") : "";
  const stats = useMemo(() => ({ rooms: store.rooms.length, invoices: store.invoices.length }), [store]);
  return (
    <section className="panel settings-panel">
      <h2 className="panel-title">{T("ตั้งค่าหอพัก", "Building settings")}</h2>
      <div className="stack-form">
        <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อหอพัก (แสดงบนบิล)", "Name (on invoices)")}</label><input id={`${fid}-n`} value={st.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="grid-3">
          <div className="field"><label htmlFor={`${fid}-w`}>{T("ค่าน้ำ/หน่วย", "Water/unit")}</label><input id={`${fid}-w`} type="number" inputMode="decimal" min={0} step="any" value={st.waterRate} onChange={(e) => set({ waterRate: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor={`${fid}-wm`}>{T("ค่าน้ำขั้นต่ำ", "Water minimum")}</label><input id={`${fid}-wm`} type="number" inputMode="decimal" min={0} step="any" value={st.waterMin} onChange={(e) => set({ waterMin: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor={`${fid}-e`}>{T("ค่าไฟ/หน่วย", "Electricity/unit")}</label><input id={`${fid}-e`} type="number" inputMode="decimal" min={0} step="any" value={st.electricRate} onChange={(e) => set({ electricRate: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor={`${fid}-d`}>{T("ชำระภายในวันที่", "Due on day")}</label><input id={`${fid}-d`} type="number" inputMode="numeric" min={1} max={28} value={st.dueDay} onChange={(e) => set({ dueDay: Math.min(28, Math.max(1, num(e.target.value) || 5)) })} /></div>
        </div>
        <div className="field">
          <label htmlFor={`${fid}-p`}>{T("พร้อมเพย์รับเงิน (ใส่แล้ว QR จะขึ้นบนบิล)", "PromptPay (adds a QR to invoices)")}</label>
          <input id={`${fid}-p`} inputMode="numeric" value={st.promptpay} onChange={(e) => set({ promptpay: e.target.value })} aria-invalid={Boolean(ppErr) || undefined} aria-describedby={`${fid}-pe`} />
          <p className="field-error" id={`${fid}-pe`}>{ppErr}</p>
        </div>
        <div className="field"><label htmlFor={`${fid}-note`}>{T("หมายเหตุท้ายบิล", "Invoice note")}</label><input id={`${fid}-note`} value={st.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </div>
      <p className="mini-title">{T(`ข้อมูล (${stats.rooms} ห้อง, ${stats.invoices} บิล)`, `Data (${stats.rooms} rooms, ${stats.invoices} bills)`)}</p>
      <div className="side-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => download(`dorm-backup-${todayIso()}.json`, JSON.stringify(store), "application/json")}>{T("สำรองข้อมูล", "Back up")}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("กู้คืนจากไฟล์", "Restore")}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const d = JSON.parse(await readFile(f)) as Store;
            if (!Array.isArray(d.rooms) || !Array.isArray(d.invoices)) throw new Error();
            setStore({ ...empty(), ...d });
            show(T("กู้คืนข้อมูลแล้ว", "Restored"));
          } catch {
            show(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบหอพัก", "Not a dorm backup file"));
          }
        }} />
        <ConfirmButton label={T("ล้างข้อมูลทั้งหมด", "Delete all data")} confirmLabel={T("กดอีกครั้งเพื่อลบทุกอย่าง", "Tap again to delete everything")} onConfirm={() => setStore(empty())} />
      </div>
      <p className="privacy">{T("ข้อมูลผู้เช่าเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ถูกส่งไปที่ใด — สำรองข้อมูลเป็นประจำ", "Tenant data stays in this browser only. Back up regularly.")}</p>
    </section>
  );
}
