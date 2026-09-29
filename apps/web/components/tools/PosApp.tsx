"use client";

import {
  addToCart,
  change,
  checkout,
  daySummary,
  localDate,
  lowStock,
  quickCash,
  salesCsv,
  setQty,
  stockProblems,
  totals,
  voidSale,
  type CartLine,
  type Discount,
  type Method,
  type Product,
  type Sale,
} from "@portfolio/tools/pos";
import { detectKind, sanitizeId } from "@portfolio/tools/promptpay";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, ConfirmButton, download, num, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { PromptPayQr } from "./PromptPayQr";
import { Modal, PrintSheet, printNow, Tabs, useHashView } from "./ui";

type Settings = { shop: string; promptpay: string; footer: string };
type Store = { products: Product[]; sales: Sale[]; settings: Settings };
type View = "sell" | "products" | "sales" | "report" | "settings";
const VIEWS = ["sell", "products", "sales", "report", "settings"] as const;

const empty = (): Store => ({ products: [], sales: [], settings: { shop: "ร้านของฉัน", promptpay: "", footer: "ขอบคุณที่อุดหนุนค่ะ/ครับ" } });

function sampleProducts(): Product[] {
  const p = (name: string, price: number, category: string, stock: number | null = null, low = 3): Product => ({ id: uid(), name, price, category, stock, lowStock: low });
  return [
    p("อเมริกาโน่เย็น", 50, "กาแฟ"), p("ลาเต้เย็น", 55, "กาแฟ"), p("คาปูชิโน่ร้อน", 50, "กาแฟ"), p("มอคค่าเย็น", 60, "กาแฟ"),
    p("ชาไทยเย็น", 45, "ชา/นม"), p("ชาเขียวนม", 50, "ชา/นม"), p("โกโก้เย็น", 50, "ชา/นม"),
    p("ครัวซองต์", 45, "เบเกอรี่", 12, 4), p("บราวนี่", 55, "เบเกอรี่", 8, 3), p("เค้กช็อกโกแลต", 75, "เบเกอรี่", 4, 3),
    p("น้ำเปล่า", 10, "อื่นๆ", 36, 10),
  ];
}

function sampleSales(products: Product[]): { products: Product[]; sales: Sale[] } {
  let ps = products;
  let sales: Sale[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const now = new Date();
  for (let d = 6; d >= 0; d--) {
    const count = 8 + Math.floor(rnd() * 10);
    for (let i = 0; i < count; i++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 8 + Math.floor(rnd() * 10), Math.floor(rnd() * 60));
      if (at > now) continue;
      let cart: CartLine[] = [];
      const lines = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < lines; j++) {
        const prod = ps[Math.floor(rnd() * ps.length)]!;
        if (prod.stock !== null && prod.stock < 2) continue;
        cart = addToCart(cart, prod, 1);
      }
      if (!cart.length) continue;
      const method: Method = rnd() < 0.55 ? "promptpay" : "cash";
      const t = totals(cart);
      const r = checkout(ps, sales, cart, { type: "amount", value: 0 }, method, method === "cash" ? quickCash(t.total).at(-2) ?? t.total : null, uid(), at);
      ps = r.products;
      sales = [...sales, r.sale];
    }
  }
  return { products: ps, sales };
}

export function PosApp() {
  const lang = useLang();
  const T = (th: string, en: string) => (lang === "th" ? th : en);
  const fid = useId();
  const [store, setStore, ready] = useStoredState<Store>("tool-pos-v1", empty);
  const [view, setViewRaw] = useState<View>("sell");
  const setView = useHashView(VIEWS, "sell", setViewRaw);
  const [toast, show] = useToast();
  const [printing, setPrinting] = useState<Sale | null>(null);
  const money = (n: number) => baht(n, lang);

  function print(sale: Sale) {
    setPrinting(sale);
    printNow();
  }

  const lows = lowStock(store.products);
  const tabs = [
    { id: "sell" as const, label: T("ขาย", "Sell") },
    { id: "products" as const, label: T("สินค้า", "Products"), badge: lows.length || undefined },
    { id: "sales" as const, label: T("ประวัติการขาย", "Sales") },
    { id: "report" as const, label: T("สรุปยอด", "Report") },
    { id: "settings" as const, label: T("ตั้งค่า", "Settings") },
  ];

  return (
    <div className="bigapp pos">
      {toast}
      <div className="bigapp-bar">
        <p className="bigapp-name">{store.settings.shop}</p>
        <Tabs tabs={tabs} value={view} onChange={setView} label={T("เมนูระบบขายหน้าร้าน", "POS sections")} />
      </div>

      {ready && store.products.length === 0 && view !== "settings" && (
        <div className="panel empty-state">
          <p>{T("ยังไม่มีสินค้า เริ่มจากเพิ่มสินค้าในแท็บ “สินค้า” หรือลองใช้ข้อมูลตัวอย่างร้านกาแฟ (มียอดขายย้อนหลัง 7 วันให้ดูรายงาน)", "No products yet. Add some under “Products”, or load a sample café with 7 days of sales.")}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { const s = sampleSales(sampleProducts()); setStore((x) => ({ ...x, ...s, settings: { ...x.settings, shop: "OTTO Café" } })); show(T("โหลดข้อมูลตัวอย่างแล้ว", "Sample loaded")); }}>
              {T("ใช้ข้อมูลตัวอย่างร้านกาแฟ", "Load sample café")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setView("products")}>{T("เพิ่มสินค้าเอง", "Add products")}</button>
          </div>
        </div>
      )}

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === view)!.label}>
        {view === "sell" && store.products.length > 0 && <SellView store={store} setStore={setStore} T={T} money={money} show={show} onPrint={print} fid={fid} />}
        {view === "products" && <ProductsView store={store} setStore={setStore} T={T} money={money} show={show} />}
        {view === "sales" && <SalesView store={store} setStore={setStore} T={T} money={money} show={show} onPrint={print} />}
        {view === "report" && <ReportView store={store} T={T} money={money} />}
        {view === "settings" && <SettingsView store={store} setStore={setStore} T={T} show={show} />}
      </div>

      <PrintSheet>{printing && <Receipt sale={printing} settings={store.settings} T={T} money={money} />}</PrintSheet>
    </div>
  );
}

type Ctx = {
  store: Store;
  setStore: (f: (s: Store) => Store) => void;
  T: (th: string, en: string) => string;
  money: (n: number) => string;
  show: (m: string) => void;
};

/* ------------------------------------------------------------------ SELL */
function SellView({ store, setStore, T, money, show, onPrint, fid }: Ctx & { onPrint: (s: Sale) => void; fid: string }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [discount, setDiscount] = useState<Discount>({ type: "amount", value: 0 });
  const [pay, setPay] = useState(false);
  const [method, setMethod] = useState<Method>("cash");
  const [received, setReceived] = useState("");
  const [done, setDone] = useState<Sale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cats = [...new Set(store.products.map((p) => p.category))];
  const shown = store.products.filter((p) => (cat === "all" || p.category === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const t = totals(cart, discount);
  const problems = stockProblems(store.products, cart);
  const rec = num(received);
  const ch = change(t.total, rec);
  const pp = sanitizeId(store.settings.promptpay);
  const ppOk = detectKind(pp) !== null;

  function add(p: Product) {
    const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0;
    if (p.stock !== null && inCart >= p.stock) {
      show(T(`${p.name} เหลือ ${p.stock} ชิ้น`, `Only ${p.stock} ${p.name} left`));
      return;
    }
    setCart((c) => addToCart(c, p));
  }

  function confirm() {
    try {
      const r = checkout(store.products, store.sales, cart, discount, method, method === "cash" ? rec : null, uid(), new Date());
      setStore((s) => ({ ...s, products: r.products, sales: [...s.sales, r.sale] }));
      setDone(r.sale);
      setPay(false);
      setCart([]);
      setDiscount({ type: "amount", value: 0 });
      setReceived("");
    } catch (e) {
      show((e as Error).message);
    }
  }

  return (
    <div className="pos-sell">
      <section className="pos-catalog" aria-label={T("สินค้า", "Products")}>
        <div className="catalog-bar">
          <label htmlFor={`${fid}-q`} className="sr-only">{T("ค้นหาสินค้า", "Search products")}</label>
          <input id={`${fid}-q`} ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("ค้นหาสินค้า (กด / )", "Search (press /)")} />
          <div className="chips" role="group" aria-label={T("หมวดสินค้า", "Categories")}>
            <button type="button" className="chip" aria-pressed={cat === "all"} onClick={() => setCat("all")}>{T("ทั้งหมด", "All")}</button>
            {cats.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        </div>
        <ul className="product-grid">
          {shown.map((p) => {
            const out = p.stock !== null && p.stock <= 0;
            const inCart = cart.find((l) => l.productId === p.id)?.qty;
            return (
              <li key={p.id}>
                <button type="button" className="product-btn" onClick={() => add(p)} disabled={out} aria-label={`${p.name} ${money(p.price)} ${T("บาท", "baht")}${p.stock !== null ? `, ${T("เหลือ", "stock")} ${p.stock}` : ""}${inCart ? `, ${T("ในตะกร้า", "in cart")} ${inCart}` : ""}`}>
                  <span className="pb-name">{p.name}</span>
                  <span className="pb-price">฿{money(p.price)}</span>
                  {p.stock !== null && <span className={`pb-stock${p.stock <= p.lowStock ? " is-low" : ""}`}>{out ? T("หมด", "Sold out") : `${T("เหลือ", "Stock")} ${p.stock}`}</span>}
                  {inCart && <span className="pb-count" aria-hidden="true">{inCart}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="hint">{T("ไม่พบสินค้า", "No products found")}</p>}
      </section>

      <aside className="pos-cart panel" aria-label={T("ตะกร้า", "Cart")}>
        <h2 className="panel-title">{T("ตะกร้า", "Cart")} <span className="muted-count">({t.items})</span></h2>
        {cart.length === 0 ? (
          <p className="hint">{T("กดสินค้าทางซ้ายเพื่อเพิ่มลงตะกร้า", "Tap a product to add it")}</p>
        ) : (
          <ul className="cart-lines">
            {cart.map((l) => (
              <li key={l.productId}>
                <span className="cl-name">{l.name}<small>฿{money(l.price)}</small></span>
                <span className="qty">
                  <button type="button" className="icon-btn icon-btn--sm" onClick={() => setCart((c) => setQty(c, l.productId, l.qty - 1))} aria-label={`${T("ลด", "Less")} ${l.name}`}>−</button>
                  <span className="qty-n"><span className="sr-only">{T("จำนวน", "Quantity")} </span>{l.qty}</span>
                  <button type="button" className="icon-btn icon-btn--sm" onClick={() => { const p = store.products.find((x) => x.id === l.productId); if (p) add(p); }} aria-label={`${T("เพิ่ม", "More")} ${l.name}`}>+</button>
                </span>
                <span className="cl-amt">{money(l.price * l.qty)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="discount-row">
          <label htmlFor={`${fid}-dv`}>{T("ส่วนลด", "Discount")}</label>
          <input id={`${fid}-dv`} type="number" inputMode="decimal" min={0} step="any" value={discount.value || ""} onChange={(e) => setDiscount({ ...discount, value: num(e.target.value) })} />
          <select aria-label={T("ประเภทส่วนลด", "Discount type")} value={discount.type} onChange={(e) => setDiscount({ ...discount, type: e.target.value as Discount["type"] })}>
            <option value="amount">฿</option>
            <option value="percent">%</option>
          </select>
        </div>
        <dl className="mini-dl">
          <div><dt>{T("รวม", "Subtotal")}</dt><dd>{money(t.subtotal)}</dd></div>
          {t.discount > 0 && <div><dt>{T("ส่วนลด", "Discount")}</dt><dd>−{money(t.discount)}</dd></div>}
        </dl>
        <p className="big-total"><small>{T("ยอดชำระ", "Total")}</small>฿{money(t.total)}</p>
        {problems.length > 0 && <p className="alert" role="alert">{problems.map((p) => T(`${p.name} มีแค่ ${p.have}`, `Only ${p.have} ${p.name}`)).join(", ")}</p>}
        <div className="side-actions">
          <button type="button" className="btn btn-primary btn-block" disabled={!cart.length || problems.length > 0} onClick={() => { setReceived(""); setPay(true); }}>
            {T("ชำระเงิน", "Charge")} ฿{money(t.total)}
          </button>
          {cart.length > 0 && <button type="button" className="text-link" onClick={() => setCart([])}>{T("ล้างตะกร้า", "Clear cart")}</button>}
        </div>
      </aside>

      <Modal open={pay} onClose={() => setPay(false)} title={`${T("ชำระเงิน", "Payment")} ฿${money(t.total)}`}>
        <div className="seg seg--wide" role="group" aria-label={T("วิธีชำระ", "Method")}>
          <button type="button" aria-pressed={method === "cash"} onClick={() => setMethod("cash")}>{T("เงินสด", "Cash")}</button>
          <button type="button" aria-pressed={method === "promptpay"} onClick={() => setMethod("promptpay")}>{T("พร้อมเพย์", "PromptPay")}</button>
        </div>
        {method === "cash" ? (
          <div className="pay-cash">
            <div className="field">
              <label htmlFor={`${fid}-rec`}>{T("รับเงินมา (บาท)", "Received (baht)")}</label>
              <input id={`${fid}-rec`} className="big-input" type="number" inputMode="decimal" min={0} step="any" value={received} onChange={(e) => setReceived(e.target.value)} autoFocus />
            </div>
            <div className="chips" role="group" aria-label={T("จำนวนเงินด่วน", "Quick amounts")}>
              {quickCash(t.total).map((v) => <button key={v} type="button" className="chip" onClick={() => setReceived(String(v))}>฿{v.toLocaleString()}</button>)}
            </div>
            <p className="change-line" aria-live="polite">
              {received === "" ? T("ใส่จำนวนเงินที่รับมา", "Enter the amount received") : ch === null ? T("รับเงินไม่พอ", "Not enough") : <>{T("เงินทอน", "Change")} <b>฿{money(ch)}</b></>}
            </p>
          </div>
        ) : ppOk ? (
          <div className="pay-qr">
            <PromptPayQr id={pp} amount={t.total} size={240} label={T(`QR พร้อมเพย์ ${money(t.total)} บาท`, `PromptPay QR for ${money(t.total)} baht`)} />
            <p className="hint">{T("ให้ลูกค้าสแกน แล้วตรวจยอดเงินเข้าในแอปธนาคารก่อนกดยืนยัน", "Let the customer scan, check your bank app, then confirm.")}</p>
          </div>
        ) : (
          <p className="alert">{T("ยังไม่ได้ตั้งเบอร์พร้อมเพย์ของร้าน — ไปที่แท็บ “ตั้งค่า”", "Set the shop's PromptPay number under “Settings” first.")}</p>
        )}
        <div className="side-actions">
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={method === "cash" ? ch === null || received === "" : !ppOk}>
            {T("ยืนยันการขาย", "Complete sale")}
          </button>
          <button type="button" className="text-link" onClick={() => setPay(false)}>{T("ยกเลิก", "Cancel")}</button>
        </div>
      </Modal>

      <Modal open={done !== null} onClose={() => { setDone(null); searchRef.current?.focus(); }} title={T("ขายสำเร็จ", "Sale complete")}>
        {done && (
          <>
            {done.change !== null && <p className="change-big">{T("ทอนเงิน", "Change")} ฿{money(done.change)}</p>}
            <Receipt sale={done} settings={store.settings} T={T} money={money} />
            <div className="side-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onPrint(done)}>{T("พิมพ์ใบเสร็จ", "Print receipt")}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDone(null); searchRef.current?.focus(); }}>{T("ขายบิลต่อไป", "Next sale")}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function Receipt({ sale, settings, T, money }: { sale: Sale; settings: Settings; T: Ctx["T"]; money: Ctx["money"] }) {
  const d = new Date(sale.at);
  return (
    <div className={`receipt${sale.voided ? " is-void" : ""}`}>
      <p className="rc-shop">{settings.shop}</p>
      <p className="rc-meta">{T("ใบเสร็จ", "Receipt")} #{String(sale.no).padStart(5, "0")} · {d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</p>
      {sale.voided && <p className="rc-void">{T("ยกเลิกแล้ว", "VOIDED")}</p>}
      <table>
        <tbody>
          {sale.lines.map((l) => (
            <tr key={l.productId}><td>{l.name} × {l.qty}</td><td>{money(l.price * l.qty)}</td></tr>
          ))}
          {sale.discount > 0 && <tr><td>{T("ส่วนลด", "Discount")}</td><td>−{money(sale.discount)}</td></tr>}
          <tr className="rc-total"><td>{T("รวม", "Total")}</td><td>{money(sale.total)}</td></tr>
          <tr><td>{sale.method === "cash" ? T("เงินสด", "Cash") : T("พร้อมเพย์", "PromptPay")}</td><td>{sale.received !== null ? money(sale.received) : "✓"}</td></tr>
          {sale.change !== null && <tr><td>{T("ทอน", "Change")}</td><td>{money(sale.change)}</td></tr>}
        </tbody>
      </table>
      {settings.footer && <p className="rc-foot">{settings.footer}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ PRODUCTS */
function ProductsView({ store, setStore, T, money, show }: Ctx) {
  const blank = { name: "", price: 0, category: "", stock: "" as string, lowStock: 3 };
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const [err, setErr] = useState("");
  const fid = useId();
  const cats = [...new Set(store.products.map((p) => p.category))];

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (!edit.name.trim() || !(edit.price >= 0)) {
      setErr(T("ใส่ชื่อและราคาให้ถูกต้อง", "Enter a name and a valid price"));
      return;
    }
    const p: Product = {
      id: edit.id ?? uid(),
      name: edit.name.trim(),
      price: edit.price,
      category: edit.category.trim() || T("ทั่วไป", "General"),
      stock: edit.stock === "" ? null : Math.max(0, Math.round(Number(edit.stock))),
      lowStock: Math.max(0, edit.lowStock),
    };
    setStore((s) => ({ ...s, products: edit.id ? s.products.map((x) => (x.id === edit.id ? p : x)) : [...s.products, p] }));
    show(edit.id ? T("บันทึกแล้ว", "Saved") : T(`เพิ่ม ${p.name} แล้ว`, `Added ${p.name}`));
    setEdit(null);
  }

  function receive(p: Product, qty: number) {
    setStore((s) => ({ ...s, products: s.products.map((x) => (x.id === p.id && x.stock !== null ? { ...x, stock: Math.max(0, x.stock + qty) } : x)) }));
  }

  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("สินค้า", "Products")} <span className="muted-count">({store.products.length})</span></h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setErr(""); setEdit({ ...blank }); }}>+ {T("เพิ่มสินค้า", "Add product")}</button>
      </div>
      {store.products.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางสินค้า", "Products table")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("สินค้า", "Product")}</th><th scope="col">{T("หมวด", "Category")}</th><th scope="col">{T("ราคา", "Price")}</th><th scope="col">{T("สต็อก", "Stock")}</th><th scope="col"><span className="sr-only">{T("จัดการ", "Actions")}</span></th></tr></thead>
            <tbody>
              {store.products.map((p) => (
                <tr key={p.id} className={p.stock !== null && p.stock <= p.lowStock ? "row-warn" : ""}>
                  <th scope="row">{p.name}</th>
                  <td>{p.category}</td>
                  <td className="num">{money(p.price)}</td>
                  <td>
                    {p.stock === null ? <span className="muted">{T("ไม่นับ", "—")}</span> : (
                      <span className="stock-cell">
                        <b>{p.stock}</b>
                        {p.stock <= p.lowStock && <span className="tag-clash">{T("ใกล้หมด", "Low")}</span>}
                        <button type="button" className="text-link" onClick={() => receive(p, 10)}>+10<span className="sr-only"> {p.name}</span></button>
                      </span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button type="button" className="text-link" onClick={() => { setErr(""); setEdit({ id: p.id, name: p.name, price: p.price, category: p.category, stock: p.stock === null ? "" : String(p.stock), lowStock: p.lowStock }); }}>{T("แก้", "Edit")}<span className="sr-only"> {p.name}</span></button>
                    <ConfirmButton label={T("ลบ", "Delete")} confirmLabel={T("ยืนยันลบ", "Confirm")} onConfirm={() => setStore((s) => ({ ...s, products: s.products.filter((x) => x.id !== p.id) }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? T("แก้ไขสินค้า", "Edit product") : T("เพิ่มสินค้า", "Add product")}>
        {edit && (
          <form className="stack-form" onSubmit={save} noValidate>
            <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อสินค้า", "Name")}</label><input id={`${fid}-n`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
            <div className="grid-2">
              <div className="field"><label htmlFor={`${fid}-p`}>{T("ราคา (บาท)", "Price (baht)")}</label><input id={`${fid}-p`} type="number" inputMode="decimal" min={0} step="any" value={edit.price || ""} onChange={(e) => setEdit({ ...edit, price: num(e.target.value) })} /></div>
              <div className="field"><label htmlFor={`${fid}-c`}>{T("หมวด", "Category")}</label><input id={`${fid}-c`} list={`${fid}-cl`} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /><datalist id={`${fid}-cl`}>{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
              <div className="field"><label htmlFor={`${fid}-s`}>{T("สต็อก (เว้นว่าง = ไม่นับ)", "Stock (blank = untracked)")}</label><input id={`${fid}-s`} type="number" inputMode="numeric" min={0} value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-l`}>{T("เตือนเมื่อเหลือ", "Warn at")}</label><input id={`${fid}-l`} type="number" inputMode="numeric" min={0} value={edit.lowStock} onChange={(e) => setEdit({ ...edit, lowStock: num(e.target.value) })} /></div>
            </div>
            <p className="field-error" role="alert">{err}</p>
            <div className="side-actions"><button type="submit" className="btn btn-primary btn-sm">{T("บันทึก", "Save")}</button></div>
          </form>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ SALES */
function SalesView({ store, setStore, T, money, onPrint }: Ctx & { onPrint: (s: Sale) => void }) {
  const [date, setDate] = useState("");
  const [open, setOpen] = useState<Sale | null>(null);
  const fid = useId();
  useEffect(() => setDate(todayIso()), []);
  const list = store.sales.filter((x) => localDate(x.at) === date).sort((a, b) => b.no - a.no);
  const current = open ? store.sales.find((x) => x.id === open.id) ?? null : null;

  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("ประวัติการขาย", "Sales history")}</h2>
        <div className="field field--inline"><label htmlFor={`${fid}-d`}>{T("วันที่", "Date")}</label><input id={`${fid}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      {list.length === 0 ? <p className="hint">{T("ไม่มีการขายในวันนี้", "No sales on this day")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("รายการบิล", "Bills")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("บิล", "Bill")}</th><th scope="col">{T("เวลา", "Time")}</th><th scope="col">{T("รายการ", "Items")}</th><th scope="col">{T("วิธีจ่าย", "Method")}</th><th scope="col">{T("ยอด", "Total")}</th><th scope="col"><span className="sr-only">{T("ดู", "View")}</span></th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={x.voided ? "row-void" : ""}>
                  <th scope="row">#{String(x.no).padStart(5, "0")}{x.voided && <span className="tag-clash"> {T("ยกเลิก", "void")}</span>}</th>
                  <td>{new Date(x.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{x.lines.reduce((t, l) => t + l.qty, 0)}</td>
                  <td>{x.method === "cash" ? T("เงินสด", "Cash") : T("พร้อมเพย์", "PromptPay")}</td>
                  <td className="num">{money(x.total)}</td>
                  <td><button type="button" className="text-link" onClick={() => setOpen(x)}>{T("ดูบิล", "View")}<span className="sr-only"> #{x.no}</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={current !== null} onClose={() => setOpen(null)} title={current ? `${T("บิล", "Bill")} #${String(current.no).padStart(5, "0")}` : ""}>
        {current && (
          <>
            <Receipt sale={current} settings={store.settings} T={T} money={money} />
            <div className="side-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onPrint(current)}>{T("พิมพ์ซ้ำ", "Reprint")}</button>
              {!current.voided && <ConfirmButton label={T("ยกเลิกบิล (คืนสต็อก)", "Void bill (restock)")} confirmLabel={T("กดอีกครั้งเพื่อยกเลิกบิล", "Tap again to void")} onConfirm={() => setStore((s) => ({ ...s, ...voidSale(s.products, s.sales, current.id) }))} />}
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ REPORT */
function ReportView({ store, T, money }: Omit<Ctx, "setStore" | "show">) {
  const [date, setDate] = useState("");
  const fid = useId();
  useEffect(() => setDate(todayIso()), []);
  const sum = useMemo(() => daySummary(store.sales, date), [store.sales, date]);
  const used = sum.hourly.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
  const from = Math.min(7, ...used);
  const to = Math.max(20, ...used);
  const hours = sum.hourly.map((v, h) => ({ h, v })).filter((x) => x.h >= from && x.h <= to);
  const maxH = Math.max(1, ...hours.map((x) => x.v));
  const lows = lowStock(store.products);
  const week = useMemo(() => {
    if (!date) return [];
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(y, m - 1, d - 6 + i);
      const key = localDate(dt.toISOString());
      return { key, label: dt.toLocaleDateString("th-TH", { weekday: "short" }), total: daySummary(store.sales, key).total };
    });
  }, [store.sales, date]);
  const maxW = Math.max(1, ...week.map((w) => w.total));

  return (
    <div className="report-grid">
      <section className="panel">
        <div className="panel-row">
          <h2 className="panel-title">{T("สรุปยอดขาย", "Sales report")}</h2>
          <div className="field field--inline"><label htmlFor={`${fid}-d`}>{T("วันที่", "Date")}</label><input id={`${fid}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <dl className="money-kpis kpis-4">
          <div><dt>{T("ยอดขาย", "Sales")}</dt><dd>฿{money(sum.total)}</dd></div>
          <div><dt>{T("จำนวนบิล", "Bills")}</dt><dd>{sum.count}</dd></div>
          <div><dt>{T("เฉลี่ย/บิล", "Avg/bill")}</dt><dd>฿{money(sum.average)}</dd></div>
          <div><dt>{T("เงินสด / พร้อมเพย์", "Cash / PromptPay")}</dt><dd className="small-dd">{money(sum.byMethod.cash)} / {money(sum.byMethod.promptpay)}</dd></div>
        </dl>
        {sum.voided > 0 && <p className="hint">{T(`ยกเลิก ${sum.voided} บิล (ไม่นับในยอด)`, `${sum.voided} voided bill(s) excluded`)}</p>}
        <p className="mini-title">{T("ยอดขายรายชั่วโมง", "Sales by hour")}</p>
        <ul className="hour-bars" aria-label={T("ยอดขายรายชั่วโมง", "Sales by hour")}>
          {hours.map(({ h, v }) => (
            <li key={h}>
              <span className="hb-bar" aria-hidden="true"><i style={{ height: `${(v / maxH) * 100}%` }} /></span>
              <span className="hb-h">{String(h).padStart(2, "0")}</span>
              <span className="sr-only">{h}:00 {money(v)} {T("บาท", "baht")}</span>
            </li>
          ))}
        </ul>
        <p className="mini-title">{T("7 วันล่าสุด", "Last 7 days")}</p>
        <ul className="week-bars week-bars--wide" aria-label={T("ยอดขาย 7 วัน", "7-day sales")}>
          {week.map((w) => (
            <li key={w.key}>
              <span className="wb-bar" aria-hidden="true"><i style={{ height: `${(w.total / maxW) * 100}%` }} /></span>
              <span className="wb-day">{w.label}</span>
              <span className="sr-only">{w.key}: {money(w.total)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">{T("สินค้าขายดี", "Best sellers")}</h2>
        {sum.top.length === 0 ? <p className="hint">—</p> : (
          <ol className="top-list">
            {sum.top.slice(0, 8).map((p) => <li key={p.name}><span>{p.name}</span><span className="mono">{p.qty} × · ฿{money(p.amount)}</span></li>)}
          </ol>
        )}
        <h2 className="panel-title" style={{ marginTop: "1.25rem" }}>{T("สินค้าใกล้หมด", "Low stock")}</h2>
        {lows.length === 0 ? <p className="hint">{T("ไม่มี", "None")}</p> : (
          <ul className="top-list">{lows.map((p) => <li key={p.id}><span>{p.name}</span><span className="tag-clash">{T("เหลือ", "left")} {p.stock}</span></li>)}</ul>
        )}
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={!store.sales.length} onClick={() => download(`sales-${todayIso()}.csv`, salesCsv(store.sales), "text/csv;charset=utf-8")}>{T("ส่งออกยอดขายทั้งหมด (CSV)", "Export all sales (CSV)")}</button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ SETTINGS */
function SettingsView({ store, setStore, T, show }: Omit<Ctx, "money">) {
  const fid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const st = store.settings;
  const pp = sanitizeId(st.promptpay);
  const ppErr = pp && !detectKind(pp) ? T("ใส่เบอร์มือถือ 10 หลัก หรือเลขบัตร/เลขภาษี 13 หลัก", "Use a 10-digit mobile or 13-digit ID") : "";
  const set = (p: Partial<Settings>) => setStore((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  return (
    <section className="panel settings-panel">
      <h2 className="panel-title">{T("ตั้งค่าร้าน", "Shop settings")}</h2>
      <div className="stack-form">
        <div className="field"><label htmlFor={`${fid}-s`}>{T("ชื่อร้าน (แสดงบนใบเสร็จ)", "Shop name (on receipts)")}</label><input id={`${fid}-s`} value={st.shop} onChange={(e) => set({ shop: e.target.value })} /></div>
        <div className="field">
          <label htmlFor={`${fid}-p`}>{T("พร้อมเพย์ของร้าน", "Shop PromptPay")}</label>
          <input id={`${fid}-p`} inputMode="numeric" value={st.promptpay} onChange={(e) => set({ promptpay: e.target.value })} aria-invalid={Boolean(ppErr) || undefined} aria-describedby={`${fid}-pe`} />
          <p className="field-error" id={`${fid}-pe`}>{ppErr}</p>
        </div>
        <div className="field"><label htmlFor={`${fid}-f`}>{T("ข้อความท้ายใบเสร็จ", "Receipt footer")}</label><input id={`${fid}-f`} value={st.footer} onChange={(e) => set({ footer: e.target.value })} /></div>
      </div>
      <p className="mini-title">{T("ข้อมูล", "Data")}</p>
      <div className="side-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => download(`pos-backup-${todayIso()}.json`, JSON.stringify(store), "application/json")}>{T("สำรองข้อมูล", "Back up")}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("กู้คืนจากไฟล์", "Restore")}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const d = JSON.parse(await readFile(f)) as Store;
            if (!Array.isArray(d.products) || !Array.isArray(d.sales)) throw new Error();
            setStore(() => ({ ...empty(), ...d }));
            show(T("กู้คืนข้อมูลแล้ว", "Restored"));
          } catch {
            show(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบขาย", "Not a POS backup file"));
          }
        }} />
        <ConfirmButton label={T("ล้างข้อมูลทั้งหมด", "Delete all data")} confirmLabel={T("กดอีกครั้งเพื่อลบทุกอย่าง", "Tap again to delete everything")} onConfirm={() => setStore(() => empty())} />
      </div>
      <p className="privacy">{T("ข้อมูลร้าน สินค้า และยอดขายเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น — สำรองข้อมูลเป็นประจำ และใช้เครื่องเดียวเป็นเครื่องขายหลัก", "Shop data lives only in this browser. Back up regularly and use one device as the main till.")}</p>
    </section>
  );
}
