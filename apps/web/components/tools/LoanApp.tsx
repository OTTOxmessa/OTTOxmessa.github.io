"use client";

import { annuityPayment, byYear, effectiveRate, flatLoan, flatSchedule, reducingSchedule, scheduleCsv, summarize } from "@portfolio/tools/loan";
import { useId, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, download, num, useStoredState } from "./common";

type Kind = "flat" | "reducing";
type Input = { price: number; down: number; rate: number; months: number; kind: Kind };

const PRESETS: { th: string; en: string; v: Input }[] = [
  { th: "ผ่อนรถ", en: "Car loan", v: { price: 650000, down: 130000, rate: 2.49, months: 60, kind: "flat" } },
  { th: "ผ่อนมือถือ/โน้ตบุ๊ก", en: "Phone / laptop", v: { price: 42900, down: 0, rate: 0.89, months: 10, kind: "flat" } },
  { th: "สินเชื่อบ้าน", en: "Home loan", v: { price: 3200000, down: 320000, rate: 6.1, months: 360, kind: "reducing" } },
];

export function LoanApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [inp, setInp] = useStoredState<Input>("tool-loan-v1", () => PRESETS[0]!.v);
  const [showAll, setShowAll] = useState(false);
  const set = (p: Partial<Input>) => setInp((x) => ({ ...x, ...p }));

  const principal = Math.max(0, inp.price - inp.down);
  const valid = principal > 0 && inp.months >= 1 && inp.months <= 600 && inp.rate >= 0 && inp.rate < 100;

  const calc = useMemo(() => {
    if (!valid) return null;
    const n = Math.round(inp.months);
    const rows = inp.kind === "flat" ? flatSchedule(principal, inp.rate, n) : reducingSchedule(principal, inp.rate, n);
    const sum = summarize(rows);
    const payment = inp.kind === "flat" ? flatLoan(principal, inp.rate, n).payment : Math.round(annuityPayment(principal, inp.rate, n) * 100) / 100;
    const apr = inp.kind === "flat" ? effectiveRate(principal, payment, n) : inp.rate;
    // ถ้าอัตราเดียวกันเป็นอีกแบบ จะผ่อนเท่าไหร่ (ช่วยให้เห็นว่า flat กับ ลดต้นลดดอกต่างกันแค่ไหน)
    const other = inp.kind === "flat" ? annuityPayment(principal, inp.rate, n) : flatLoan(principal, inp.rate, n).payment;
    return { rows, sum, payment, apr, other, years: byYear(rows) };
  }, [inp, principal, valid]);

  const money = (n: number, d = 2) => baht(n, lang, d);
  const maxYear = calc ? Math.max(...calc.years.map((y) => y.interest + y.principal)) : 1;

  return (
    <div className="tool loan">
      <div className="tool-main">
        <section className="panel" aria-labelledby={`${fid}-in`}>
          <h2 className="panel-title" id={`${fid}-in`}>{T("รายละเอียดการผ่อน", "Loan details")}</h2>
          <div className="presets" role="group" aria-label={T("ตัวอย่าง", "Examples")}>
            {PRESETS.map((p) => (
              <button key={p.en} type="button" className="chip" onClick={() => set(p.v)}>{T(p.th, p.en)}</button>
            ))}
          </div>
          <div className="seg seg--wide" role="group" aria-label={T("ประเภทดอกเบี้ย", "Interest type")}>
            <button type="button" aria-pressed={inp.kind === "flat"} onClick={() => set({ kind: "flat" })}>{T("ดอกเบี้ยคงที่ (flat)", "Flat rate")}</button>
            <button type="button" aria-pressed={inp.kind === "reducing"} onClick={() => set({ kind: "reducing" })}>{T("ลดต้นลดดอก", "Reducing balance")}</button>
          </div>
          <p className="hint">
            {inp.kind === "flat"
              ? T("แบบที่ใช้กับผ่อนรถ ผ่อนสินค้า — คิดดอกเบี้ยจากยอดเต็มตลอดสัญญา", "Used for cars and gadgets — interest on the full amount for the whole term.")
              : T("แบบที่ใช้กับบ้าน สินเชื่อบุคคล — คิดดอกจากเงินต้นที่เหลือ", "Used for homes and personal loans — interest on what's left.")}
          </p>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${fid}-p`}>{T("ราคา / ยอดที่ต้องการกู้ (฿)", "Price / amount (฿)")}</label>
              <input id={`${fid}-p`} type="number" inputMode="decimal" min={0} step="any" value={inp.price || ""} onChange={(e) => set({ price: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-d`}>{T("เงินดาวน์ (฿)", "Down payment (฿)")}</label>
              <input id={`${fid}-d`} type="number" inputMode="decimal" min={0} step="any" value={inp.down || ""} onChange={(e) => set({ down: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-r`}>{T("ดอกเบี้ย (% ต่อปี)", "Interest (% per year)")}</label>
              <input id={`${fid}-r`} type="number" inputMode="decimal" min={0} max={99} step="0.01" value={inp.rate} onChange={(e) => set({ rate: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-m`}>{T("จำนวนงวด (เดือน)", "Term (months)")}</label>
              <input id={`${fid}-m`} type="number" inputMode="numeric" min={1} max={600} step={1} value={inp.months || ""} onChange={(e) => set({ months: num(e.target.value) })} list={`${fid}-ml`} />
              <datalist id={`${fid}-ml`}>{[6, 10, 12, 24, 36, 48, 60, 72, 84, 240, 360].map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>
          {!valid && <p className="field-error" role="alert">{T("ยอดกู้ต้องมากกว่า 0 และจำนวนงวด 1–600 เดือน", "Amount must be above 0 and term 1–600 months")}</p>}
          {inp.down > 0 && inp.price > 0 && <p className="hint">{T(`ยอดจัดไฟแนนซ์ ${money(principal, 0)} บาท (ดาวน์ ${Math.round((inp.down / inp.price) * 100)}%)`, `Financed ${money(principal, 0)} baht (${Math.round((inp.down / inp.price) * 100)}% down)`)}</p>}
        </section>

        {calc && (
          <section className="panel" aria-labelledby={`${fid}-y`}>
            <h2 className="panel-title" id={`${fid}-y`}>{T("จ่ายเงินต้นกับดอกเบี้ยปีละเท่าไหร่", "Principal vs interest by year")}</h2>
            <ul className="year-bars">
              {calc.years.map((y) => (
                <li key={y.year}>
                  <span className="yb-label">{T(`ปีที่ ${y.year}`, `Year ${y.year}`)}</span>
                  <span className="yb-bar" aria-hidden="true">
                    <i className="yb-p" style={{ width: `${(y.principal / maxYear) * 100}%` }} />
                    <i className="yb-i" style={{ width: `${(y.interest / maxYear) * 100}%` }} />
                  </span>
                  <span className="yb-val">
                    <span className="sr-only">{T("เงินต้น", "principal")} </span>{money(y.principal, 0)}
                    {" + "}
                    <span className="sr-only">{T("ดอกเบี้ย", "interest")} </span><b>{money(y.interest, 0)}</b>
                  </span>
                </li>
              ))}
            </ul>
            <p className="legend"><i className="yb-p" /> {T("เงินต้น", "Principal")} <i className="yb-i" /> {T("ดอกเบี้ย", "Interest")}</p>

            <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางผ่อนรายงวด", "Payment schedule")}>
              <table className="docs">
                <caption>{T("ตารางผ่อนรายงวด", "Payment schedule")}</caption>
                <thead><tr><th scope="col">{T("งวด", "No.")}</th><th scope="col">{T("ค่างวด", "Payment")}</th><th scope="col">{T("ดอกเบี้ย", "Interest")}</th><th scope="col">{T("เงินต้น", "Principal")}</th><th scope="col">{T("คงเหลือ", "Balance")}</th></tr></thead>
                <tbody>
                  {(showAll ? calc.rows : calc.rows.slice(0, 12)).map((r) => (
                    <tr key={r.month}><td>{r.month}</td><td className="num">{money(r.payment)}</td><td className="num">{money(r.interest)}</td><td className="num">{money(r.principal)}</td><td className="num">{money(r.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="side-actions">
              {calc.rows.length > 12 && (
                <button type="button" className="text-link" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? T("แสดงแค่ 12 งวดแรก", "Show first 12 only") : T(`แสดงทั้งหมด ${calc.rows.length} งวด`, `Show all ${calc.rows.length} payments`)}
                </button>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => download("loan-schedule.csv", scheduleCsv(calc.rows), "text/csv;charset=utf-8")}>{T("ดาวน์โหลด CSV", "Download CSV")}</button>
            </div>
          </section>
        )}
      </div>

      <aside className="tool-side">
        <div className="panel panel--sticky" aria-live="polite">
          <h2 className="panel-title">{T("ผลการคำนวณ", "Result")}</h2>
          {calc ? (
            <>
              <p className="big-total"><small>{T("ผ่อนเดือนละ", "Monthly payment")}</small>฿{money(calc.payment)}</p>
              <dl className="mini-dl">
                <div><dt>{T("ยอดกู้", "Borrowed")}</dt><dd>{money(principal, 0)}</dd></div>
                <div><dt>{T("ดอกเบี้ยทั้งหมด", "Total interest")}</dt><dd>{money(calc.sum.totalInterest, 0)}</dd></div>
                <div><dt>{T("จ่ายรวมทั้งสัญญา", "Total paid")}</dt><dd>{money(calc.sum.totalPaid, 0)}</dd></div>
                <div><dt>{T("ดอกเบี้ย / ยอดกู้", "Interest / borrowed")}</dt><dd>{Math.round((calc.sum.totalInterest / principal) * 1000) / 10}%</dd></div>
              </dl>
              {inp.kind === "flat" && inp.rate > 0 && (
                <p className="badge-line">
                  {T(`ดอกเบี้ย ${inp.rate}% แบบคงที่ เท่ากับดอกเบี้ยจริงประมาณ ${calc.apr.toFixed(2)}% ต่อปี`, `A ${inp.rate}% flat rate is really about ${calc.apr.toFixed(2)}% a year`)}
                  <small>{T(" (แบบลดต้นลดดอก) — ใช้ตัวเลขนี้เทียบกับสินเชื่อแบบอื่น", " (effective rate) — use this to compare with other loans")}</small>
                </p>
              )}
              {inp.rate > 0 && (
                <p className="hint">
                  {inp.kind === "flat"
                    ? T(`ถ้าได้ ${inp.rate}% แบบลดต้นลดดอก จะผ่อนแค่ ${money(calc.other)} บาท/เดือน`, `At ${inp.rate}% reducing balance you'd pay only ${money(calc.other)} a month`)
                    : T(`ถ้าเป็น ${inp.rate}% แบบคงที่ จะต้องผ่อน ${money(calc.other)} บาท/เดือน`, `At ${inp.rate}% flat you'd pay ${money(calc.other)} a month`)}
                </p>
              )}
            </>
          ) : (
            <p className="hint">{T("กรอกข้อมูลให้ครบเพื่อดูผล", "Fill in the details to see the result")}</p>
          )}
          <p className="privacy">{T("ตัวเลขเพื่อประกอบการตัดสินใจเท่านั้น สัญญาจริงอาจมีค่าธรรมเนียม ประกัน หรือการปัดเศษต่างไป — ตรวจกับผู้ให้กู้ก่อนเซ็น", "For planning only — real contracts may add fees, insurance or different rounding. Check with the lender before signing.")}</p>
        </div>
      </aside>
    </div>
  );
}
