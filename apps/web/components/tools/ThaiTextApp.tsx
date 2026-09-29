"use client";

import { bahtText, daysBetween, englishAmount, fromThaiDigits, thaiDate, toBE, toCE, toThaiDigits, ymdBetween } from "@portfolio/tools/thai-text";
import { useEffect, useId, useState } from "react";
import { useLang } from "@/lib/useLang";
import { CopyButton, todayIso, useToast } from "./common";

export function ThaiTextApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [toast, show] = useToast();
  const [amount, setAmount] = useState("15999.95");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [year, setYear] = useState("2569");
  const [digits, setDigits] = useState("");

  useEffect(() => {
    const t = todayIso();
    setDate(t);
    setTo(t);
    setFrom(`${Number(t.slice(0, 4)) - 20}${t.slice(4)}`);
  }, []);

  const cleaned = fromThaiDigits(amount).replace(/[,\s฿]/g, "");
  const n = cleaned === "" ? NaN : Number(cleaned);
  const amountOk = Number.isFinite(n) && Math.abs(n) < 1e15;
  const th = amountOk ? bahtText(n) : "";
  const en = amountOk ? englishAmount(n) : "";
  const formatted = amountOk ? n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const dateInfo = date ? thaiDate(date) : null;
  const diff = from && to ? { days: daysBetween(from, to), ymd: ymdBetween(from, to) } : null;
  const y = Number(fromThaiDigits(year));
  const isBE = y > 2400;

  const copy = (text: string) => <CopyButton text={text} label={T("คัดลอก", "Copy")} done={T("คัดลอกแล้ว", "Copied")} notify={show} className="text-link copy-link" />;

  return (
    <div className="tool thai">
      {toast}
      <div className="tool-main">
        <section className="panel" aria-labelledby={`${fid}-a`}>
          <h2 className="panel-title" id={`${fid}-a`}>{T("อ่านจำนวนเงินเป็นตัวหนังสือ", "Amount in words")}</h2>
          <div className="field">
            <label htmlFor={`${fid}-amt`}>{T("จำนวนเงิน (บาท)", "Amount (baht)")}</label>
            <input id={`${fid}-amt`} className="big-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={(!amountOk && amount !== "") || undefined} aria-describedby={`${fid}-amt-e`} autoComplete="off" />
            <p className="field-error" id={`${fid}-amt-e`}>{!amountOk && amount !== "" ? T("ใส่ตัวเลข เช่น 1,250.50", "Enter a number, e.g. 1,250.50") : ""}</p>
          </div>
          <dl className="out-list" aria-live="polite">
            <div>
              <dt>{T("ภาษาไทย (แบบ BAHTTEXT ใน Excel)", "Thai (same as Excel BAHTTEXT)")}</dt>
              <dd><span className="out-main">{th || "—"}</span>{th && copy(th)}</dd>
            </div>
            <div>
              <dt>{T("ภาษาอังกฤษ (สำหรับ invoice)", "English (for invoices)")}</dt>
              <dd><span>{en || "—"}</span>{en && copy(en)}</dd>
            </div>
            <div>
              <dt>{T("ตัวเลข / เลขไทย", "Figures / Thai numerals")}</dt>
              <dd><span className="mono">{formatted ? `${formatted} · ${toThaiDigits(formatted)}` : "—"}</span>{formatted && copy(toThaiDigits(formatted))}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby={`${fid}-d`}>
          <h2 className="panel-title" id={`${fid}-d`}>{T("วันที่แบบไทย", "Thai date formats")}</h2>
          <div className="field">
            <label htmlFor={`${fid}-date`}>{T("วันที่", "Date")}</label>
            <input id={`${fid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {dateInfo && (
            <dl className="out-list">
              <div><dt>{T("แบบเป็นทางการ (หนังสือราชการ)", "Formal")}</dt><dd><span className="out-main">{dateInfo.formal}</span>{copy(dateInfo.formal)}</dd></div>
              <div><dt>{T("แบบเต็ม", "Long")}</dt><dd><span>{dateInfo.long}</span>{copy(dateInfo.long)}</dd></div>
              <div><dt>{T("แบบย่อ", "Short")}</dt><dd><span>{dateInfo.short}</span>{copy(dateInfo.short)}</dd></div>
              <div><dt>{T("ตัวเลข", "Numeric")}</dt><dd><span className="mono">{dateInfo.numeric}</span>{copy(dateInfo.numeric)}</dd></div>
              <div><dt>{T("เลขไทย", "Thai numerals")}</dt><dd><span>{dateInfo.thaiDigits}</span>{copy(dateInfo.thaiDigits)}</dd></div>
            </dl>
          )}
        </section>

        <section className="panel" aria-labelledby={`${fid}-c`}>
          <h2 className="panel-title" id={`${fid}-c`}>{T("นับวัน / คำนวณอายุ", "Count days / age")}</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${fid}-from`}>{T("ตั้งแต่ (เช่น วันเกิด)", "From (e.g. birthday)")}</label>
              <input id={`${fid}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-to`}>{T("ถึง", "To")}</label>
              <input id={`${fid}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {diff && (
            <p className="plan-result" aria-live="polite">
              {diff.ymd.sign < 0 && T("(นับย้อนหลัง) ", "(backwards) ")}
              {T(`${diff.ymd.years} ปี ${diff.ymd.months} เดือน ${diff.ymd.days} วัน`, `${diff.ymd.years} years ${diff.ymd.months} months ${diff.ymd.days} days`)}
              <small className="block">{T(`รวม ${Math.abs(diff.days).toLocaleString("th-TH")} วัน (${Math.floor(Math.abs(diff.days) / 7)} สัปดาห์)`, `${Math.abs(diff.days).toLocaleString("en-US")} days in total (${Math.floor(Math.abs(diff.days) / 7)} weeks)`)}</small>
            </p>
          )}
        </section>
      </div>

      <aside className="tool-side">
        <div className="panel panel--sticky">
          <h2 className="panel-title">{T("แปลง พ.ศ. ↔ ค.ศ.", "Buddhist ↔ Gregorian year")}</h2>
          <div className="field">
            <label htmlFor={`${fid}-y`}>{T("ปี (พ.ศ. หรือ ค.ศ.)", "Year (BE or CE)")}</label>
            <input id={`${fid}-y`} className="big-input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          {y > 0 && (
            <p className="plan-result" aria-live="polite">
              {isBE ? `พ.ศ. ${y} = ค.ศ. ${toCE(y)}` : `ค.ศ. ${y} = พ.ศ. ${toBE(y)}`}
              <small className="block">{T("ต่างกัน 543 ปี (ปีเริ่ม 1 มกราคม ตั้งแต่ พ.ศ. 2484)", "543 years apart (Thai years start on 1 January since BE 2484)")}</small>
            </p>
          )}

          <h2 className="panel-title" style={{ marginTop: "1.5rem" }}>{T("เลขไทย ↔ เลขอารบิก", "Thai ↔ Arabic numerals")}</h2>
          <div className="field">
            <label htmlFor={`${fid}-dg`}>{T("ข้อความ", "Text")}</label>
            <textarea id={`${fid}-dg`} rows={3} value={digits} onChange={(e) => setDigits(e.target.value)} placeholder={T("เช่น เลขที่ ๑๒๓/๒๕๖๙", "e.g. No. 123/2569")} />
          </div>
          {digits && (
            <dl className="out-list">
              <div><dt>{T("เป็นเลขไทย", "To Thai")}</dt><dd><span>{toThaiDigits(digits)}</span>{copy(toThaiDigits(digits))}</dd></div>
              <div><dt>{T("เป็นเลขอารบิก", "To Arabic")}</dt><dd><span>{fromThaiDigits(digits)}</span>{copy(fromThaiDigits(digits))}</dd></div>
            </dl>
          )}
          <p className="privacy">{T("ทำงานในเครื่องทั้งหมด ไม่มีการส่งข้อมูลออกไป", "Runs entirely on your device.")}</p>
        </div>
      </aside>
    </div>
  );
}
