"use client";

import {
  budgetStatus,
  EXPENSE_CATEGORIES,
  fromCsv,
  INCOME_CATEGORIES,
  monthSummary,
  projectMonth,
  toCsv,
  type Budgets,
  type Entry,
  type Kind,
} from "@portfolio/tools/money";
import { useEffect, useId, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, ConfirmButton, download, readFile, uid, useStoredState, useToast } from "./common";

const EN: Record<string, string> = {
  อาหาร: "Food", เดินทาง: "Transport", ที่พัก: "Housing", ของใช้: "Supplies", การเรียน: "Study",
  บันเทิง: "Fun", สุขภาพ: "Health", อื่นๆ: "Other", "เงินเดือน/ค่าขนม": "Salary / allowance", งานพิเศษ: "Side job", ของขวัญ: "Gift",
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y!, mo! - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type Store = { entries: Entry[]; budgets: Budgets };

export function MoneyApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const cat = (c: string) => (lang === "th" ? c : (EN[c] ?? c));
  const fid = useId();
  const [store, setStore] = useStoredState<Store>("tool-money-v1", () => ({ entries: [], budgets: {} }));
  const [month, setMonth] = useState("2026-01");
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]!);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState("");
  const [lastDeleted, setLastDeleted] = useState<Entry | null>(null);
  const [showBudget, setShowBudget] = useState(false);
  const [toast, show] = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ใช้วันที่ของเครื่องผู้ใช้หลังโหลด (HTML ถูก build ไว้ล่วงหน้า)
  useEffect(() => {
    setMonth(todayStr().slice(0, 7));
    setDate(todayStr());
  }, []);

  useEffect(() => setCategory(kind === "expense" ? EXPENSE_CATEGORIES[0]! : INCOME_CATEGORIES[0]!), [kind]);

  const sum = monthSummary(store.entries, month);
  const budgets = budgetStatus(store.entries, month, store.budgets);
  const projected = projectMonth(sum.expense, month, todayStr());
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric" });
  const cats = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  function add(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) {
      setErr(T("ใส่จำนวนเงินมากกว่า 0", "Enter an amount above 0"));
      amountRef.current?.focus();
      return;
    }
    setErr("");
    const entry: Entry = { id: uid(), date: date || todayStr(), kind, amount: Math.round(n * 100) / 100, category, note: note.trim() };
    setStore((s) => ({ ...s, entries: [...s.entries, entry] }));
    setMonth((date || todayStr()).slice(0, 7));
    setAmount("");
    setNote("");
    show(T(`บันทึก${kind === "expense" ? "รายจ่าย" : "รายรับ"} ${baht(entry.amount, lang)} บาทแล้ว`, `Saved ${kind} of ${baht(entry.amount, lang)} baht`));
    amountRef.current?.focus();
  }

  function remove(entry: Entry) {
    setStore((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== entry.id) }));
    setLastDeleted(entry);
    show(T("ลบแล้ว — กด “เอาคืน” ถ้าลบผิด", "Deleted — press “Undo” if that was a mistake"));
  }

  async function importFile(file: File) {
    const text = await readFile(file);
    if (file.name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text) as Store;
        if (!Array.isArray(parsed.entries)) throw new Error();
        setStore({ entries: parsed.entries, budgets: parsed.budgets ?? {} });
        show(T(`นำเข้า ${parsed.entries.length} รายการแล้ว`, `Imported ${parsed.entries.length} entries`));
      } catch {
        show(T("ไฟล์ JSON นี้อ่านไม่ได้", "Couldn't read that JSON file"));
      }
      return;
    }
    const { entries, errors } = fromCsv(text, uid);
    setStore((s) => ({ ...s, entries: [...s.entries, ...entries] }));
    show(
      T(`นำเข้า ${entries.length} รายการ`, `Imported ${entries.length} entries`) +
        (errors.length ? T(` (ข้ามบรรทัด ${errors.slice(0, 5).join(", ")})`, ` (skipped line ${errors.slice(0, 5).join(", ")})`) : ""),
    );
  }

  const maxCat = Math.max(1, ...sum.categories.map((c) => c.amount));

  return (
    <div className="tool money">
      {toast}
      <div className="tool-main">
        {/* ---------- ฟอร์มบันทึก ---------- */}
        <section className="panel" aria-labelledby={`${fid}-add`}>
          <h2 className="panel-title" id={`${fid}-add`}>{T("จดรายการ", "Add an entry")}</h2>
          <form onSubmit={add} className="money-form" noValidate>
            <div className="seg seg--wide" role="group" aria-label={T("ประเภท", "Type")}>
              <button type="button" aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>{T("รายจ่าย", "Expense")}</button>
              <button type="button" aria-pressed={kind === "income"} onClick={() => setKind("income")}>{T("รายรับ", "Income")}</button>
            </div>
            <div className="field amount-field">
              <label htmlFor={`${fid}-amt`}>{T("จำนวนเงิน (บาท)", "Amount (baht)")}</label>
              <input
                ref={amountRef}
                id={`${fid}-amt`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={Boolean(err) || undefined}
                aria-describedby={`${fid}-err`}
                placeholder="0"
              />
              <p className="field-error" id={`${fid}-err`}>{err}</p>
            </div>
            <fieldset className="cat-pick">
              <legend>{T("หมวด", "Category")}</legend>
              {cats.map((c) => (
                <label key={c} className="cat-opt">
                  <input type="radio" name={`${fid}-cat`} value={c} checked={category === c} onChange={() => setCategory(c)} />
                  <span>{cat(c)}</span>
                </label>
              ))}
            </fieldset>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`${fid}-note`}>{T("โน้ต (ไม่ใส่ก็ได้)", "Note (optional)")}</label>
                <input id={`${fid}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
              </div>
              <div className="field">
                <label htmlFor={`${fid}-date`}>{T("วันที่", "Date")}</label>
                <input id={`${fid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">{T("บันทึก", "Save")}</button>
          </form>
        </section>

        {/* ---------- รายการของเดือน ---------- */}
        <section className="panel" aria-labelledby={`${fid}-list`}>
          <h2 className="panel-title" id={`${fid}-list`}>{T("รายการ", "Entries")} — {monthLabel}</h2>
          {lastDeleted && (
            <p className="undo">
              {T("ลบ", "Deleted")} {cat(lastDeleted.category)} {baht(lastDeleted.amount, lang)} ·{" "}
              <button type="button" className="link-btn" onClick={() => { setStore((s) => ({ ...s, entries: [...s.entries, lastDeleted] })); setLastDeleted(null); }}>
                {T("เอาคืน", "Undo")}
              </button>
            </p>
          )}
          {sum.days.length === 0 ? (
            <p className="hint">{T("เดือนนี้ยังไม่มีรายการ", "Nothing recorded this month.")}</p>
          ) : (
            <div className="days">
              {sum.days.map(([day, list]) => (
                <div key={day} className="day">
                  <h3 className="day-title">
                    {new Date(`${day}T00:00:00`).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </h3>
                  <ul>
                    {list.map((e) => (
                      <li key={e.id} className={`entry entry--${e.kind}`}>
                        <span className="entry-cat">{cat(e.category)}</span>
                        <span className="entry-note">{e.note}</span>
                        <span className="entry-amt">{e.kind === "expense" ? "−" : "+"}{baht(e.amount, lang)}</span>
                        <button type="button" className="icon-btn icon-btn--sm" onClick={() => remove(e)} aria-label={`${T("ลบ", "Delete")} ${cat(e.category)} ${baht(e.amount, lang)}`}>✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------- สรุป ---------- */}
      <aside className="tool-side" aria-labelledby={`${fid}-sum`}>
        <div className="panel panel--sticky">
          <div className="month-nav">
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label={T("เดือนก่อน", "Previous month")}>‹</button>
            <h2 className="panel-title" id={`${fid}-sum`} aria-live="polite">{monthLabel}</h2>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label={T("เดือนถัดไป", "Next month")}>›</button>
          </div>
          <dl className="money-kpis">
            <div className="k-in"><dt>{T("รายรับ", "Income")}</dt><dd>{baht(sum.income, lang)}</dd></div>
            <div className="k-out"><dt>{T("รายจ่าย", "Spent")}</dt><dd>{baht(sum.expense, lang)}</dd></div>
            <div className={sum.balance < 0 ? "k-neg" : "k-bal"}><dt>{T("คงเหลือ", "Left")}</dt><dd>{baht(sum.balance, lang)}</dd></div>
          </dl>
          {projected !== null && sum.expense > 0 && (
            <p className="hint">{T(`ถ้าใช้แบบนี้ต่อ ทั้งเดือนจะใช้ประมาณ ${baht(projected, lang, 0)} บาท`, `At this pace you'll spend about ${baht(projected, lang, 0)} baht this month`)}</p>
          )}

          {sum.categories.length > 0 && (
            <div className="cat-bars">
              <p className="mini-title">{T("ใช้ไปกับอะไร", "Where it went")}</p>
              <ul>
                {sum.categories.map((c) => (
                  <li key={c.category}>
                    <span className="cb-name">{cat(c.category)}</span>
                    <span className="cb-bar" aria-hidden="true"><i style={{ width: `${(c.amount / maxCat) * 100}%` }} /></span>
                    <span className="cb-val">{baht(c.amount, lang, 0)} <small>({Math.round((c.amount / sum.expense) * 100)}%)</small></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {budgets.length > 0 && (
            <div className="budgets">
              <p className="mini-title">{T("งบประมาณเดือนนี้", "Budgets this month")}</p>
              <ul>
                {budgets.map((b) => (
                  <li key={b.category} data-level={b.level}>
                    <span className="bd-top">
                      <span>{cat(b.category)}</span>
                      <span>{baht(b.spent, lang, 0)} / {baht(b.budget, lang, 0)}</span>
                    </span>
                    <span className="bd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={b.budget} aria-valuenow={Math.min(b.spent, b.budget)} aria-label={`${cat(b.category)}`}>
                      <i style={{ width: `${Math.min(100, b.ratio * 100)}%` }} />
                    </span>
                    {b.level !== "ok" && (
                      <span className="bd-msg">{b.level === "over" ? T(`เกินงบ ${baht(b.spent - b.budget, lang, 0)} บาท`, `Over by ${baht(b.spent - b.budget, lang, 0)}`) : T("ใกล้เต็มงบแล้ว", "Almost at budget")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="text-link" aria-expanded={showBudget} onClick={() => setShowBudget((v) => !v)}>
            {showBudget ? T("ปิดการตั้งงบ", "Close budgets") : T("ตั้งงบรายเดือน", "Set monthly budgets")}
          </button>
          {showBudget && (
            <div className="budget-form">
              {EXPENSE_CATEGORIES.map((c) => (
                <div key={c} className="field field--inline">
                  <label htmlFor={`${fid}-b-${c}`}>{cat(c)}</label>
                  <input
                    id={`${fid}-b-${c}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={store.budgets[c] || ""}
                    placeholder="—"
                    onChange={(e) => setStore((s) => ({ ...s, budgets: { ...s.budgets, [c]: Number(e.target.value) || 0 } }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="side-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={!store.entries.length} onClick={() => download(`money-${todayStr()}.csv`, toCsv(store.entries), "text/csv;charset=utf-8")}>
              {T("ส่งออก CSV (Excel)", "Export CSV")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!store.entries.length} onClick={() => download(`money-backup-${todayStr()}.json`, JSON.stringify(store), "application/json")}>
              {T("สำรองข้อมูล", "Back up")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("นำเข้า CSV/สำรอง", "Import CSV/backup")}</button>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
            {store.entries.length > 0 && (
              <ConfirmButton label={T("ล้างข้อมูลทั้งหมด", "Delete everything")} confirmLabel={T("กดอีกครั้งเพื่อลบทั้งหมด", "Tap again to delete all")} onConfirm={() => setStore({ entries: [], budgets: {} })} />
            )}
          </div>
          <p className="privacy">{T("ข้อมูลการเงินอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่มีบัญชี ไม่มี server — กดสำรองข้อมูลเป็นระยะ", "Your money data never leaves this browser — no account, no server. Back up now and then.")}</p>
        </div>
      </aside>
    </div>
  );
}
