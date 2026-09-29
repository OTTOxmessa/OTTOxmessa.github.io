"use client";

import { splitBill, summaryText, type BillInput, type Item, type Person } from "@portfolio/tools/bill";
import { detectKind, isValidThaiId, sanitizeId } from "@portfolio/tools/promptpay";
import { decodeState, encodeState } from "@portfolio/tools/share";
import { useEffect, useId, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, ConfirmButton, num, uid, useStoredState, useToast } from "./common";
import { PromptPayQr } from "./PromptPayQr";

type Bill = BillInput & { title: string; payerId: string; promptpay: string };

const blank = (): Bill => ({
  title: "",
  people: [],
  items: [],
  discount: 0,
  servicePct: 10,
  vatPct: 7,
  roundUp: false,
  payerId: "",
  promptpay: "",
});

const sample = (): Bill => {
  const p = ["มายด์", "ต้น", "ฟ้า", "โอ๊ต"].map((name) => ({ id: uid(), name }));
  return {
    title: "หมูกระทะหลังสอบ",
    people: p,
    items: [
      { id: uid(), name: "ชุดหมูกระทะ", price: 599, qty: 1, sharedBy: [] },
      { id: uid(), name: "ชาไทย", price: 45, qty: 2, sharedBy: [p[0]!.id, p[2]!.id] },
      { id: uid(), name: "เบียร์", price: 95, qty: 2, sharedBy: [p[1]!.id, p[3]!.id] },
      { id: uid(), name: "ไอศกรีม", price: 59, qty: 1, sharedBy: [p[2]!.id] },
    ],
    discount: 0,
    servicePct: 10,
    vatPct: 7,
    roundUp: false,
    payerId: p[1]!.id,
    promptpay: "",
  };
};

export function BillSplitApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [bill, setBill, ready] = useStoredState<Bill>("tool-bill-v1", blank);
  const [newName, setNewName] = useState("");
  const [openQr, setOpenQr] = useState<string | null>(null);
  const [toast, show] = useToast();

  // เปิดบิลจากลิงก์ที่เพื่อนแชร์มา (#b=...)
  useEffect(() => {
    if (!ready) return;
    const m = window.location.hash.match(/#b=(.+)$/);
    if (!m) return;
    const shared = decodeState<Bill>(m[1]!);
    if (shared && Array.isArray(shared.people) && Array.isArray(shared.items)) {
      setBill({ ...blank(), ...shared });
      show(T("เปิดบิลที่แชร์มาแล้ว", "Opened the shared bill"));
    }
    history.replaceState(null, "", window.location.pathname);
  }, [ready]);

  const result = useMemo(() => splitBill(bill), [bill]);
  const payer = bill.people.find((p) => p.id === bill.payerId);
  const ppDigits = sanitizeId(bill.promptpay);
  const ppKind = detectKind(ppDigits);
  const ppError =
    ppDigits.length === 0
      ? ""
      : !ppKind
        ? T("ใส่เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก", "Use a 10-digit mobile number or 13-digit ID")
        : ppKind === "nationalId" && !isValidThaiId(ppDigits)
          ? T("เลขบัตรประชาชนไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)", "That ID number fails the checksum")
          : "";
  const ppOk = ppKind !== null && !ppError;

  const update = (patch: Partial<Bill>) => setBill((b) => ({ ...b, ...patch }));
  const updateItem = (id: string, patch: Partial<Item>) =>
    setBill((b) => ({ ...b, items: b.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  function addPerson(e?: React.FormEvent) {
    e?.preventDefault();
    const names = newName.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const added: Person[] = names.map((name) => ({ id: uid(), name }));
    setBill((b) => ({ ...b, people: [...b.people, ...added], payerId: b.payerId || added[0]!.id }));
    setNewName("");
  }
  function removePerson(id: string) {
    setBill((b) => ({
      ...b,
      people: b.people.filter((p) => p.id !== id),
      items: b.items.map((it) => ({ ...it, sharedBy: it.sharedBy.filter((x) => x !== id) })),
      payerId: b.payerId === id ? "" : b.payerId,
    }));
  }
  function addItem() {
    const id = uid();
    setBill((b) => ({ ...b, items: [...b.items, { id, name: "", price: 0, qty: 1, sharedBy: [] }] }));
    setTimeout(() => document.getElementById(`item-name-${id}`)?.focus(), 30);
  }
  function toggleEater(item: Item, pid: string) {
    const has = item.sharedBy.includes(pid);
    updateItem(item.id, { sharedBy: has ? item.sharedBy.filter((x) => x !== pid) : [...item.sharedBy, pid] });
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      show(done);
    } catch {
      show(T("คัดลอกไม่ได้ — เบราว์เซอร์ไม่อนุญาต", "Couldn't copy — the browser blocked it"));
    }
  }
  const shareUrl = () => `${window.location.origin}${window.location.pathname}#b=${encodeState(bill)}`;

  return (
    <div className="tool bill">
      {toast}
      <div className="tool-main">
        {/* ---------- 1. คน ---------- */}
        <section className="panel" aria-labelledby={`${fid}-p`}>
          <h2 className="panel-title" id={`${fid}-p`}><span className="step">1</span>{T("ใครไปกินบ้าง", "Who's eating?")}</h2>
          <form className="inline-form" onSubmit={addPerson}>
            <label htmlFor={`${fid}-name`} className="sr-only">{T("ชื่อเพื่อน", "Friend's name")}</label>
            <input
              id={`${fid}-name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={T("พิมพ์ชื่อ แล้วกด Enter (ใส่หลายคนคั่นด้วย , ได้)", "Type a name and press Enter (comma for several)")}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-sm">{T("เพิ่ม", "Add")}</button>
          </form>
          {bill.people.length > 0 ? (
            <ul className="people">
              {bill.people.map((p) => (
                <li key={p.id}>
                  <input
                    className="person-name"
                    value={p.name}
                    aria-label={T("แก้ชื่อ", "Edit name")}
                    onChange={(e) => update({ people: bill.people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })}
                  />
                  <button type="button" className="chip-x" onClick={() => removePerson(p.id)} aria-label={`${T("ลบ", "Remove")} ${p.name}`}>✕</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">
              {T("ยังไม่มีใคร — ", "Nobody yet — ")}
              <button type="button" className="link-btn" onClick={() => setBill(sample())}>{T("ลองใช้ตัวอย่าง", "try an example")}</button>
            </p>
          )}
        </section>

        {/* ---------- 2. รายการ ---------- */}
        <section className="panel" aria-labelledby={`${fid}-i`}>
          <h2 className="panel-title" id={`${fid}-i`}><span className="step">2</span>{T("สั่งอะไรบ้าง", "What was ordered?")}</h2>
          <p className="hint">{T("กดชื่อคนที่กินแต่ละรายการ ถ้าไม่เลือกใครเลย = หารทุกคน", "Tap who shared each item. Pick nobody = split between everyone.")}</p>
          <ol className="items">
            {bill.items.map((it, i) => (
              <li key={it.id} className="item">
                <div className="item-row">
                  <div className="field field--grow">
                    <label htmlFor={`item-name-${it.id}`}>{T("รายการ", "Item")} {i + 1}</label>
                    <input id={`item-name-${it.id}`} value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} placeholder={T("เช่น ชาไทย", "e.g. Thai tea")} />
                  </div>
                  <div className="field field--num">
                    <label htmlFor={`item-price-${it.id}`}>{T("ราคา (฿)", "Price (฿)")}</label>
                    <input id={`item-price-${it.id}`} type="number" inputMode="decimal" min={0} step="any" value={it.price || ""} onChange={(e) => updateItem(it.id, { price: num(e.target.value) })} />
                  </div>
                  <div className="field field--qty">
                    <label htmlFor={`item-qty-${it.id}`}>{T("จำนวน", "Qty")}</label>
                    <input id={`item-qty-${it.id}`} type="number" inputMode="numeric" min={1} step={1} value={it.qty || ""} onChange={(e) => updateItem(it.id, { qty: Math.max(0, num(e.target.value)) })} />
                  </div>
                  <button type="button" className="icon-btn icon-btn--sm item-del" onClick={() => update({ items: bill.items.filter((x) => x.id !== it.id) })} aria-label={`${T("ลบรายการ", "Remove item")} ${it.name || i + 1}`}>✕</button>
                </div>
                {bill.people.length > 0 && (
                  <div className="eaters" role="group" aria-label={`${T("ใครกิน", "Shared by")} — ${it.name || i + 1}`}>
                    {bill.people.map((p) => (
                      <button key={p.id} type="button" className="chip" aria-pressed={it.sharedBy.includes(p.id)} onClick={() => toggleEater(it, p.id)}>
                        {p.name || "?"}
                      </button>
                    ))}
                    {it.sharedBy.length === 0 && <span className="eaters-all">= {T("หารทุกคน", "everyone")}</span>}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ {T("เพิ่มรายการ", "Add item")}</button>
        </section>

        {/* ---------- 3. ค่าใช้จ่ายเพิ่ม ---------- */}
        <section className="panel" aria-labelledby={`${fid}-x`}>
          <h2 className="panel-title" id={`${fid}-x`}><span className="step">3</span>{T("ส่วนลด ค่าบริการ VAT", "Discount, service & VAT")}</h2>
          <div className="grid-3">
            <div className="field">
              <label htmlFor={`${fid}-sc`}>{T("ค่าบริการ (%)", "Service charge (%)")}</label>
              <input id={`${fid}-sc`} type="number" inputMode="decimal" min={0} max={100} step="any" value={bill.servicePct} onChange={(e) => update({ servicePct: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-vat`}>VAT (%)</label>
              <input id={`${fid}-vat`} type="number" inputMode="decimal" min={0} max={100} step="any" value={bill.vatPct} onChange={(e) => update({ vatPct: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-dc`}>{T("ส่วนลด (฿)", "Discount (฿)")}</label>
              <input id={`${fid}-dc`} type="number" inputMode="decimal" min={0} step="any" value={bill.discount || ""} onChange={(e) => update({ discount: num(e.target.value) })} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={bill.roundUp} onChange={(e) => update({ roundUp: e.target.checked })} />
            {T("ปัดเศษขึ้นเป็นบาทเต็ม (โอนง่าย)", "Round each person up to whole baht")}
          </label>
          <p className="hint">{T("ร้านส่วนใหญ่คิดค่าบริการก่อน แล้วค่อยคิด VAT จากยอดรวมค่าบริการ — ถ้าบิลรวม VAT แล้ว ใส่ VAT เป็น 0", "Most places add service first, then VAT on top. If prices already include VAT, set VAT to 0.")}</p>
        </section>
      </div>

      {/* ---------- สรุป ---------- */}
      <a href="#bill-summary" className="mobile-sum">
        <span>{T("รวม", "Total")} ฿{baht(result.total, lang)}</span>
        <span>{T("ดูคนละเท่าไหร่ ↓", "See each share ↓")}</span>
      </a>
      <aside className="tool-side" id="bill-summary" aria-labelledby={`${fid}-sum`}>
        <div className="panel panel--sticky">
          <h2 className="panel-title" id={`${fid}-sum`}>{T("ต้องจ่ายคนละเท่าไหร่", "Who owes what")}</h2>
          <p className="big-total">
            <small>{T("ยอดรวมบิล", "Bill total")}</small>
            ฿{baht(result.total, lang)}
          </p>
          <dl className="mini-dl">
            <div><dt>{T("ค่าอาหาร", "Food")}</dt><dd>{baht(result.subtotal, lang)}</dd></div>
            {result.discount > 0 && <div><dt>{T("ส่วนลด", "Discount")}</dt><dd>−{baht(result.discount, lang)}</dd></div>}
            <div><dt>{T("ค่าบริการ", "Service")}</dt><dd>{baht(result.service, lang)}</dd></div>
            <div><dt>VAT</dt><dd>{baht(result.vat, lang)}</dd></div>
          </dl>

          <div className="payer">
            <div className="field">
              <label htmlFor={`${fid}-payer`}>{T("ใครจ่ายไปก่อน", "Who paid?")}</label>
              <select id={`${fid}-payer`} value={bill.payerId} onChange={(e) => update({ payerId: e.target.value })}>
                <option value="">{T("— เลือก —", "— choose —")}</option>
                {bill.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${fid}-pp`}>{T("พร้อมเพย์ของคนจ่าย", "Payer's PromptPay")}</label>
              <input
                id={`${fid}-pp`}
                inputMode="numeric"
                autoComplete="off"
                value={bill.promptpay}
                onChange={(e) => update({ promptpay: e.target.value })}
                placeholder={T("เบอร์มือถือ หรือเลขบัตร", "Mobile no. or ID no.")}
                aria-invalid={Boolean(ppError) || undefined}
                aria-describedby={`${fid}-pp-err`}
              />
              <p className="field-error" id={`${fid}-pp-err`}>{ppError}</p>
            </div>
          </div>

          {bill.people.length === 0 ? (
            <p className="hint">{T("เพิ่มชื่อเพื่อนก่อน แล้วยอดของแต่ละคนจะขึ้นตรงนี้", "Add people and each share shows up here.")}</p>
          ) : (
            <ul className="shares">
              {result.shares.map((s) => {
                const isPayer = s.personId === bill.payerId;
                const open = openQr === s.personId;
                return (
                  <li key={s.personId} className={`share${isPayer ? " is-payer" : ""}`}>
                    <details>
                      <summary>
                        <span className="share-name">{s.name || "?"}{isPayer && <em> · {T("คนจ่าย", "paid")}</em>}</span>
                        <span className="share-amt">฿{baht(s.total, lang)}</span>
                      </summary>
                      <ul className="share-items">
                        {s.items.map((it, i) => <li key={i}><span>{it.name}</span><span>{baht(it.amount, lang)}</span></li>)}
                        {s.discount > 0 && <li><span>{T("ส่วนลด", "Discount")}</span><span>−{baht(s.discount, lang)}</span></li>}
                        <li><span>{T("ค่าบริการ + VAT", "Service + VAT")}</span><span>{baht(s.service + s.vat, lang)}</span></li>
                      </ul>
                    </details>
                    {!isPayer && ppOk && s.total > 0 && (
                      <>
                        <button type="button" className="text-link qr-toggle" aria-expanded={open} onClick={() => setOpenQr(open ? null : s.personId)}>
                          {open ? T("ซ่อน QR", "Hide QR") : T("QR ให้สแกนจ่าย", "Show pay QR")}
                        </button>
                        {open && (
                          <PromptPayQr
                            id={ppDigits}
                            amount={s.total}
                            label={T(`QR พร้อมเพย์ ${baht(s.total, lang)} บาท โอนให้ ${payer?.name ?? ""}`, `PromptPay QR for ${baht(s.total, lang)} baht to ${payer?.name ?? ""}`)}
                          />
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {result.unassigned.length > 0 && (
            <p className="hint">{T("หารทุกคน:", "Split by everyone:")} {result.unassigned.filter(Boolean).join(", ") || "—"}</p>
          )}

          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={!bill.people.length} onClick={() => copy(summaryText(result, payer?.name), T("คัดลอกสรุปแล้ว วางใน LINE ได้เลย", "Summary copied — paste it into your chat"))}>
              {T("คัดลอกสรุป", "Copy summary")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!bill.people.length} onClick={() => copy(shareUrl(), T("คัดลอกลิงก์แล้ว เพื่อนเปิดแล้วเห็นบิลเดียวกัน", "Link copied — friends will see the same bill"))}>
              {T("แชร์ลิงก์บิล", "Share bill link")}
            </button>
            <ConfirmButton label={T("เริ่มบิลใหม่", "New bill")} confirmLabel={T("กดอีกครั้งเพื่อล้าง", "Tap again to clear")} onConfirm={() => { setBill(blank()); setOpenQr(null); }} />
          </div>
          <p className="privacy">
            {T("ข้อมูลอยู่ในเครื่องคุณเท่านั้น ลิงก์ที่แชร์จะมีรายการและเลขพร้อมเพย์อยู่ในลิงก์ — ส่งเฉพาะคนที่ไว้ใจ", "Everything stays on your device. A shared link contains the items and PromptPay number — only send it to people you trust.")}
          </p>
        </div>
      </aside>
    </div>
  );
}
