"use client";

import { rebalance, SAMPLE, validate, type Holding } from "@portfolio/labs/rebalance";
import { useEffect, useId, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";

const KEY = "lab-rebalancer-v1";

function load(): { holdings: Holding[]; cash: number; allowSell: boolean } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function RebalancerApp() {
  const lang = useLang();
  const baseId = useId();
  const [holdings, setHoldings] = useState<Holding[]>(SAMPLE);
  const [cash, setCash] = useState(10000);
  const [allowSell, setAllowSell] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = load();
    if (saved) {
      setHoldings(saved.holdings);
      setCash(saved.cash);
      setAllowSell(saved.allowSell);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ holdings, cash, allowSell }));
    } catch {
      /* ignore */
    }
  }, [holdings, cash, allowSell, ready]);

  const { issues, result } = useMemo(() => {
    const found = validate(holdings, { cash, allowSell });
    return { issues: found, result: found.length ? null : rebalance(holdings, { cash, allowSell }) };
  }, [holdings, cash, allowSell]);

  const fmt = new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 });
  const money = (n: number) => `฿${fmt.format(n)}`;
  const targetSum = Math.round(holdings.reduce((s, h) => s + (h.target || 0), 0) * 100) / 100;

  function update(i: number, patch: Partial<Holding>) {
    setHoldings((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }
  function add() {
    setHoldings((hs) => [...hs, { id: `h${Date.now()}`, name: lang === "th" ? "สินทรัพย์ใหม่" : "New asset", value: 0, target: 0 }]);
  }
  function remove(i: number) {
    setHoldings((hs) => hs.filter((_, j) => j !== i));
  }

  const msg = (x: (typeof issues)[number]) => {
    if (x.kind === "targets") return lang === "th" ? `สัดส่วนเป้าหมายรวมกันได้ ${x.sum}% — ต้องเท่ากับ 100%` : `Targets add up to ${x.sum}% — they must total 100%`;
    if (x.kind === "negative") return lang === "th" ? "มีค่าที่ติดลบหรือว่างอยู่" : "Some values are negative or empty";
    if (x.kind === "empty") return lang === "th" ? "เพิ่มสินทรัพย์อย่างน้อย 1 รายการ" : "Add at least one asset";
    return lang === "th" ? "เงินที่เติมต้องไม่ติดลบ" : "Cash can't be negative";
  };

  return (
    <div className="rebal">
      <section className="rebal-input" aria-labelledby={`${baseId}-in`}>
        <h2 className="h3" id={`${baseId}-in`}>{lang === "th" ? "1. พอร์ตของคุณ" : "1. Your portfolio"}</h2>
        <table className="rebal-table">
          <thead>
            <tr>
              <th scope="col">{lang === "th" ? "สินทรัพย์" : "Asset"}</th>
              <th scope="col">{lang === "th" ? "มูลค่าตอนนี้ (฿)" : "Value now (฿)"}</th>
              <th scope="col">{lang === "th" ? "เป้าหมาย (%)" : "Target (%)"}</th>
              <th scope="col"><span className="sr-only">{lang === "th" ? "ลบ" : "Remove"}</span></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => (
              <tr key={h.id}>
                <td data-label={lang === "th" ? "สินทรัพย์" : "Asset"}>
                  <input aria-label={`${lang === "th" ? "ชื่อสินทรัพย์ แถว" : "Asset name, row"} ${i + 1}`} value={h.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td data-label={lang === "th" ? "มูลค่า (฿)" : "Value (฿)"}>
                  <input
                    aria-label={`${lang === "th" ? "มูลค่า" : "Value"} — ${h.name}`}
                    type="number" inputMode="decimal" min={0} step="any"
                    value={Number.isNaN(h.value) ? "" : h.value}
                    aria-invalid={!(h.value >= 0) || undefined}
                    onChange={(e) => update(i, { value: num(e.target.value) })}
                  />
                </td>
                <td data-label={lang === "th" ? "เป้าหมาย (%)" : "Target (%)"}>
                  <input
                    aria-label={`${lang === "th" ? "เป้าหมาย %" : "Target %"} — ${h.name}`}
                    type="number" inputMode="decimal" min={0} max={100} step="any"
                    value={Number.isNaN(h.target) ? "" : h.target}
                    aria-invalid={!(h.target >= 0) || undefined}
                    onChange={(e) => update(i, { target: num(e.target.value) })}
                  />
                </td>
                <td>
                  <button type="button" className="icon-btn icon-btn--sm" onClick={() => remove(i)} aria-label={`${lang === "th" ? "ลบ" : "Remove"} ${h.name}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><button type="button" className="text-link" onClick={add}>+ {lang === "th" ? "เพิ่มสินทรัพย์" : "Add asset"}</button></td>
              <td />
              <td className={targetSum === 100 ? "sum-ok" : "sum-bad"}>
                {lang === "th" ? "รวม" : "Total"} {targetSum}%
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div className="rebal-options">
          <div className="field">
            <label htmlFor={`${baseId}-cash`}>{lang === "th" ? "เงินที่จะเติมเข้าพอร์ต (฿)" : "Cash to add (฿)"}</label>
            <input id={`${baseId}-cash`} type="number" inputMode="decimal" min={0} step="any" value={Number.isNaN(cash) ? "" : cash} onChange={(e) => setCash(num(e.target.value))} />
          </div>
          <label className="switch">
            <input type="checkbox" role="switch" checked={allowSell} onChange={(e) => setAllowSell(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span>
              <b>{lang === "th" ? "อนุญาตให้ขาย" : "Allow selling"}</b>
              <small>{allowSell ? (lang === "th" ? "ปรับทุกตัวให้ตรงเป้าพอดี" : "Every holding lands exactly on target") : (lang === "th" ? "ใช้เงินที่เติมซื้อตัวที่ต่ำกว่าเป้าเท่านั้น" : "Only buys what's under target, using new cash")}</small>
            </span>
          </label>
          <button type="button" className="text-link" onClick={() => { setHoldings(SAMPLE); setCash(10000); setAllowSell(false); }}>
            {lang === "th" ? "ใช้ข้อมูลตัวอย่าง" : "Reset to sample"}
          </button>
        </div>
      </section>

      <section className="rebal-output" aria-labelledby={`${baseId}-out`}>
        <h2 className="h3" id={`${baseId}-out`}>{lang === "th" ? "2. สิ่งที่ต้องทำ" : "2. What to do"}</h2>
        <div role="alert" className="rebal-issues">
          {issues.length > 0 && <ul>{issues.map((x, i) => <li key={i}>{msg(x)}</li>)}</ul>}
        </div>

        {result && (
          <>
            <dl className="rebal-kpis">
              <div><dt>{lang === "th" ? "มูลค่ารวมหลังเติมเงิน" : "Total after cash"}</dt><dd>{money(result.total)}</dd></div>
              <div><dt>{lang === "th" ? "เพี้ยนจากเป้ามากสุด" : "Max drift"}</dt><dd>{result.maxDriftBefore}% <span aria-hidden="true">→</span><span className="sr-only">{lang === "th" ? " เหลือ " : " becomes "}</span> {result.maxDriftAfter}%</dd></div>
            </dl>

            <div className="alloc" aria-hidden="true">
              {(["currentPct", "afterPct"] as const).map((key) => (
                <div key={key} className="alloc-row">
                  <span className="alloc-label">{key === "currentPct" ? (lang === "th" ? "ตอนนี้" : "Now") : (lang === "th" ? "หลังปรับ" : "After")}</span>
                  <span className="alloc-bar">
                    {result.trades.map((t, i) => (
                      <span key={t.id} className={`alloc-seg seg-${i % 6}`} style={{ width: `${t[key]}%` }} title={`${t.name} ${t[key]}%`}>
                        {t[key] >= 9 ? `${Math.round(t[key])}%` : ""}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
              <ul className="alloc-legend">
                {result.trades.map((t, i) => <li key={t.id}><i className={`seg-${i % 6}`} />{t.name}</li>)}
              </ul>
            </div>

            <table className="trades">
              <caption className="sr-only">{lang === "th" ? "รายการซื้อขาย" : "Trades"}</caption>
              <thead>
                <tr>
                  <th scope="col">{lang === "th" ? "สินทรัพย์" : "Asset"}</th>
                  <th scope="col">{lang === "th" ? "ตอนนี้" : "Now"}</th>
                  <th scope="col">{lang === "th" ? "ทำอะไร" : "Action"}</th>
                  <th scope="col">{lang === "th" ? "หลังปรับ / เป้า" : "After / target"}</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t) => {
                  const action = Math.abs(t.delta) < 1 ? "hold" : t.delta > 0 ? "buy" : "sell";
                  const word = { hold: lang === "th" ? "คงไว้" : "Hold", buy: lang === "th" ? "ซื้อ" : "Buy", sell: lang === "th" ? "ขาย" : "Sell" }[action];
                  return (
                    <tr key={t.id}>
                      <th scope="row">{t.name}</th>
                      <td>{money(t.current)} <small>({t.currentPct}%)</small></td>
                      <td><span className={`action action--${action}`}>{word}{action !== "hold" && ` ${money(Math.abs(t.delta))}`}</span></td>
                      <td>{t.afterPct}% <small>/ {t.targetPct}%</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="note">
              {lang === "th"
                ? "ตัวเลขไว้ประกอบการตัดสินใจเท่านั้น ไม่ใช่คำแนะนำการลงทุน และยังไม่รวมค่าธรรมเนียมหรือภาษี"
                : "For illustration only — not investment advice. Fees and taxes are not included."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
