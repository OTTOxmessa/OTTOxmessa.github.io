"use client";

import {
  addDays,
  closePO,
  dailyUsage,
  daysOfCover,
  draftPOs,
  inventorySummary,
  issue,
  ledger,
  levelOf,
  levels,
  nextPoNumber,
  onOrder,
  poProgress,
  poTotal,
  receive,
  receivePO,
  stockCount,
  stockCsv,
  stockState,
  suggestions,
  topMovers,
  type Movement,
  type PoLine,
  type PoStatus,
  type Product,
  type PurchaseOrder,
  type Reason,
  type StockState,
  type Supplier,
} from "@portfolio/tools/inventory";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, ConfirmButton, download, num, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { Modal, PrintSheet, printNow, Tabs, useHashView } from "./ui";

type Biz = { name: string; address: string; phone: string; taxId: string; contact: string };
type Store = { products: Product[]; suppliers: Supplier[]; movements: Movement[]; pos: PurchaseOrder[]; biz: Biz };
type View = "overview" | "products" | "moves" | "orders" | "count" | "suppliers" | "settings";
const VIEWS = ["overview", "products", "moves", "orders", "count", "suppliers", "settings"] as const;
type TFn = (th: string, en: string) => string;
type SetStore = (f: (s: Store) => Store) => void;

const defaultBiz: Biz = { name: "ร้านของฉัน", address: "", phone: "", taxId: "", contact: "" };
const empty = (): Store => ({ products: [], suppliers: [], movements: [], pos: [], biz: defaultBiz });

const STATE_LABEL: Record<StockState, [string, string]> = { out: ["หมด", "Out"], low: ["ใกล้หมด", "Low"], ok: ["ปกติ", "OK"], inactive: ["เลิกขาย", "Inactive"] };
const PO_LABEL: Record<PoStatus, [string, string]> = { draft: ["ร่าง", "Draft"], ordered: ["สั่งแล้ว รอรับ", "Ordered"], partial: ["รับบางส่วน", "Part received"], received: ["รับครบ", "Received"], cancelled: ["ยกเลิก", "Cancelled"] };
const REASON: Record<Reason, [string, string]> = {
  purchase: ["ซื้อเข้า", "Purchase"], sale: ["ขาย", "Sale"], use: ["เบิกใช้", "Used"], damaged: ["เสียหาย/หมดอายุ", "Damaged/expired"],
  return: ["คืนผู้ขาย", "Returned"], count: ["ปรับจากการตรวจนับ", "Count adjustment"], opening: ["ยอดยกมา", "Opening balance"], other: ["อื่นๆ", "Other"],
};
const IN_REASONS: Reason[] = ["purchase", "return", "opening", "other"];
const OUT_REASONS: Reason[] = ["sale", "use", "damaged", "return", "other"];

const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const qtyFmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ SAMPLE: 60 days of a café's stock room */
function sample(today: string): Store {
  const S = (name: string, contact: string, phone: string, leadDays: number, note = ""): Supplier => ({ id: uid(), name, contact, phone, email: "", leadDays, note });
  const suppliers = [
    S("โรงคั่วดอยสูง", "คุณแดง", "081-100-2000", 3, "สั่งขั้นต่ำ 5 กก."),
    S("นมสดฟาร์มโคขอนแก่น", "คุณนิด", "089-300-4000", 1, "ส่งทุกเช้า"),
    S("แม็คโคร (ซื้อเอง)", "", "", 1),
    S("บรรจุภัณฑ์อีสาน", "คุณเอก", "043-111-999", 5),
  ];
  const [coffee, milk, makro, pack] = suppliers.map((s) => s.id) as [string, string, string, string];
  // [sku, name, category, unit, cost, price, reorderPoint, reorderQty, supplier, usage/day]
  const defs: [string, string, string, string, number, number, number, number, string | null, number][] = [
    ["CF-001", "เมล็ดกาแฟคั่วกลาง 1 กก.", "กาแฟ", "ถุง", 420, 0, 4, 5, coffee, 0.6],
    ["CF-002", "เมล็ดกาแฟคั่วเข้ม 1 กก.", "กาแฟ", "ถุง", 390, 0, 3, 5, coffee, 0.4],
    ["CF-003", "ผงโกโก้ 500 ก.", "กาแฟ", "ถุง", 185, 0, 3, 6, makro, 0.25],
    ["MK-001", "นมสด 2 ลิตร", "นม", "ขวด", 92, 0, 10, 24, milk, 4.2],
    ["MK-002", "นมข้นจืด", "นม", "กระป๋อง", 24, 0, 12, 48, makro, 2.4],
    ["MK-003", "วิปปิ้งครีม 1 ลิตร", "นม", "กล่อง", 165, 0, 3, 6, makro, 0.35],
    ["SY-001", "ไซรัปคาราเมล 750 มล.", "ไซรัป", "ขวด", 280, 0, 2, 4, makro, 0.15],
    ["SY-002", "น้ำตาลทรายแดง 1 กก.", "ไซรัป", "ถุง", 38, 0, 5, 10, makro, 0.5],
    ["PK-001", "แก้วพลาสติก 16 ออนซ์ (50 ใบ)", "บรรจุภัณฑ์", "แพ็ก", 95, 0, 8, 20, pack, 1.6],
    ["PK-002", "ฝาโดม 16 ออนซ์ (50 ใบ)", "บรรจุภัณฑ์", "แพ็ก", 60, 0, 8, 20, pack, 1.5],
    ["PK-003", "หลอดกระดาษ (100 เส้น)", "บรรจุภัณฑ์", "แพ็ก", 85, 0, 4, 10, pack, 0.7],
    ["PK-004", "ถุงหิ้วกระดาษ (50 ใบ)", "บรรจุภัณฑ์", "แพ็ก", 120, 0, 3, 6, null, 0.45],
    ["BK-001", "ครัวซองต์แช่แข็ง (10 ชิ้น)", "เบเกอรี่", "กล่อง", 250, 0, 3, 6, makro, 0.55],
    ["BK-002", "บราวนี่ (ถาด)", "เบเกอรี่", "ถาด", 180, 0, 2, 4, makro, 0.3],
  ];
  const products: Product[] = defs.map(([sku, name, category, unit, cost, price, rp, rq, sup]) => ({ id: uid(), sku, name, category, unit, price, reorderPoint: rp, reorderQty: rq, supplierId: sup, lastCost: cost, active: true }));
  const usage = new Map(products.map((p, i) => [p.id, defs[i]![9]]));
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mv: Movement[] = [];
  const pos: PurchaseOrder[] = [];
  const have = new Map<string, number>();
  const seqs = new Map<string, number>();
  const push = (m: Omit<Movement, "id" | "seq">) => {
    const s = (seqs.get(m.date) ?? 0) + 1;
    seqs.set(m.date, s);
    mv.push({ ...m, id: uid(), seq: s });
    have.set(m.productId, (have.get(m.productId) ?? 0) + m.qty);
  };
  const start = addDays(today, -60);
  products.forEach((p, i) => push({ date: start, productId: p.id, type: "opening", qty: p.reorderQty + p.reorderPoint + (i % 3), unitCost: p.lastCost, reason: "opening", ref: "ยอดยกมา" }));
  for (let d = -59; d <= 0; d++) {
    const date = addDays(today, d);
    // รับของตาม PO ที่ถึงกำหนด (วันนี้ยังไม่รับ ให้เห็น PO ค้าง)
    for (const po of pos) {
      if (!po.expected || d > -1) continue;
      const due = po.status === "ordered" && po.expected <= date;
      const rest = po.status === "partial" && addDays(po.expected, 3) <= date;
      if (!due && !rest) continue;
      const half = due && pos.indexOf(po) % 5 === 3; // บางใบผู้ขายส่งไม่ครบ ส่วนที่เหลือตามมาทีหลัง
      const receipts = Object.fromEntries(po.lines.map((l) => [l.productId, half ? Math.ceil(l.qty / 2) : l.qty - l.received]));
      const r = receivePO(po, receipts, date, mv, uid);
      Object.assign(po, r.po);
      r.moves.forEach((m) => push({ date: m.date, productId: m.productId, type: m.type, qty: m.qty, unitCost: m.unitCost, reason: m.reason, ref: m.ref }));
    }
    // ตรวจนับเมื่อ 2 สัปดาห์ก่อน พบของหายเล็กน้อย
    if (d === -14) {
      products.slice(0, 5).forEach((p, i) => {
        const lost = i === 3 ? 2 : i === 1 ? 1 : 0;
        if (lost && (have.get(p.id) ?? 0) >= lost) push({ date, productId: p.id, type: "adjust", qty: -lost, unitCost: null, reason: "count", ref: "ตรวจนับประจำเดือน" });
      });
    }
    // ใช้ของรายวัน (เสาร์อาทิตย์ขายดีกว่า)
    const dow = new Date(`${date}T00:00:00`).getDay();
    for (const p of products) {
      const u = (usage.get(p.id) ?? 0) * (dow === 0 || dow === 6 ? 1.5 : 1);
      let q = Math.floor(u * (0.4 + rnd() * 1.3) + rnd());
      q = Math.min(q, have.get(p.id) ?? 0);
      if (q > 0) push({ date, productId: p.id, type: "issue", qty: -q, unitCost: null, reason: rnd() < 0.03 ? "damaged" : "use", ref: "" });
    }
    // สั่งของเมื่อถึงจุดสั่งซื้อ (2 วันล่าสุดเก็บไว้ให้ผู้ใช้กดสร้างใบสั่งซื้อเอง)
    if (d < -2) {
      const lv = levels(mv);
      const drafts = draftPOs(suggestions(products, lv, pos), pos, suppliers, date, uid);
      for (const po of drafts) {
        // ต้นทุนแกว่งเล็กน้อย เพื่อให้เห็นต้นทุนถัวเฉลี่ยเปลี่ยน
        po.lines = po.lines.map((l) => ({ ...l, unitCost: Math.round(l.unitCost * (0.96 + rnd() * 0.1)) }));
        pos.push({ ...po, status: "ordered" });
      }
    }
  }
  const lastCost = new Map<string, number>();
  mv.filter((m) => m.type === "receive" && m.unitCost !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((m) => lastCost.set(m.productId, m.unitCost!));
  return {
    products: products.map((p) => ({ ...p, lastCost: lastCost.get(p.id) ?? p.lastCost })),
    suppliers,
    movements: mv,
    pos,
    biz: { name: "OTTO Café", address: "99/9 ถ.มิตรภาพ อ.เมือง จ.ขอนแก่น 40000", phone: "043-000-000", taxId: "", contact: "ออตโต้" },
  };
}

/* ------------------------------------------------------------------ APP */
export function InventoryApp() {
  const lang = useLang();
  const T: TFn = (th, en) => (lang === "th" ? th : en);
  const [store, setStore, ready] = useStoredState<Store>("tool-inventory-v1", empty);
  const [view, setViewRaw] = useState<View>("overview");
  const setView = useHashView(VIEWS, "overview", setViewRaw);
  const [toast, show] = useToast();
  const [today, setToday] = useState("");
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [openPo, setOpenPo] = useState<string | null>(null);
  const [printing, setPrinting] = useState<PurchaseOrder | null>(null);
  useEffect(() => setToday(todayIso()), []);
  const money = (n: number) => baht(n, lang);
  const lv = useMemo(() => levels(store.movements), [store.movements]);

  if (!ready || !today) return <div className="bigapp inventory" aria-busy="true" />;

  const lowCount = store.products.filter((p) => ["low", "out"].includes(stockState(p, levelOf(lv, p.id).qty))).length;
  const openPOs = store.pos.filter((p) => p.status === "ordered" || p.status === "partial").length;
  const tabs = [
    { id: "overview" as const, label: T("ภาพรวม", "Overview") },
    { id: "products" as const, label: T("สินค้า", "Products"), badge: lowCount || undefined },
    { id: "moves" as const, label: T("รับ-เบิก", "In / out") },
    { id: "orders" as const, label: T("ใบสั่งซื้อ", "Purchase orders"), badge: openPOs || undefined },
    { id: "count" as const, label: T("ตรวจนับ", "Stock count") },
    { id: "suppliers" as const, label: T("ผู้ขาย", "Suppliers") },
    { id: "settings" as const, label: T("ตั้งค่า", "Settings") },
  ];
  const ctx: Ctx = { store, setStore, T, money, show, today, lv, openProduct: setOpenProduct, openPo: setOpenPo, go: setView };
  const product = store.products.find((p) => p.id === openProduct) ?? null;
  const po = store.pos.find((p) => p.id === openPo) ?? null;

  return (
    <div className="bigapp inventory">
      {toast}
      <div className="bigapp-bar">
        <p className="bigapp-name">{store.biz.name}</p>
        <Tabs tabs={tabs} value={view} onChange={setView} label={T("เมนูระบบสต็อก", "Inventory sections")} />
      </div>

      {store.products.length === 0 && view !== "settings" && view !== "suppliers" && (
        <div className="panel empty-state">
          <p>{T("ยังไม่มีสินค้า เพิ่มสินค้าและยอดยกมาในแท็บ “สินค้า” — หรือลองข้อมูลตัวอย่างคลังวัตถุดิบร้านกาแฟ (มีความเคลื่อนไหว 60 วัน ใบสั่งซื้อ และของที่ใกล้หมด)", "No products yet. Add products with opening stock — or load a café stock room with 60 days of history.")}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setStore(() => sample(today)); show(T("โหลดข้อมูลตัวอย่างแล้ว", "Sample loaded")); }}>{T("ใช้ข้อมูลตัวอย่าง", "Load sample")}</button>
          </div>
        </div>
      )}

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === view)!.label}>
        {view === "overview" && store.products.length > 0 && <Overview {...ctx} />}
        {view === "products" && <ProductsView {...ctx} />}
        {view === "moves" && store.products.length > 0 && <MovesView {...ctx} />}
        {view === "orders" && <OrdersView {...ctx} />}
        {view === "count" && store.products.length > 0 && <CountView {...ctx} />}
        {view === "suppliers" && <SuppliersView {...ctx} />}
        {view === "settings" && <SettingsView {...ctx} />}
      </div>

      <Modal open={product !== null} onClose={() => setOpenProduct(null)} title={product ? `${product.sku} · ${product.name}` : ""} wide>
        {product && <ProductDetail product={product} ctx={ctx} />}
      </Modal>
      <Modal open={po !== null} onClose={() => setOpenPo(null)} title={po ? `${T("ใบสั่งซื้อ", "Purchase order")} ${po.no}` : ""} wide>
        {po && <PoViewer po={po} ctx={ctx} onPrint={(p) => { setPrinting(p); printNow(); }} />}
      </Modal>
      <PrintSheet>{printing && <PoPaper po={printing} store={store} />}</PrintSheet>
    </div>
  );
}

type Ctx = {
  store: Store;
  setStore: SetStore;
  T: TFn;
  money: (n: number) => string;
  show: (m: string) => void;
  today: string;
  lv: ReturnType<typeof levels>;
  openProduct: (id: string) => void;
  openPo: (id: string) => void;
  go: (v: View) => void;
};

function StateTag({ p, qty, T }: { p: Product; qty: number; T: TFn }) {
  const st = stockState(p, qty);
  return <span className={`st st-${st === "ok" ? "okstock" : st === "out" ? "overdue" : st === "low" ? "partial" : "void"}`}>{T(...STATE_LABEL[st])}</span>;
}

/* ------------------------------------------------------------------ OVERVIEW */
function Overview({ store, setStore, T, money, today, lv, openProduct, openPo, go, show }: Ctx) {
  const sum = inventorySummary(store.products, store.movements, store.pos, today);
  const sugg = suggestions(store.products, lv, store.pos);
  const movers = topMovers(store.products, store.movements, today, 30, 6);
  const maxMover = Math.max(1, ...movers.map((m) => m.value));
  const recent = [...store.movements].sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1)).slice(0, 8);
  const name = (id: string) => store.products.find((p) => p.id === id)?.name ?? "—";
  const supName = (id: string | null) => store.suppliers.find((s) => s.id === id)?.name;

  function createPOs() {
    const drafts = draftPOs(sugg, store.pos, store.suppliers, today, uid);
    if (!drafts.length) return show(T("สินค้าที่ต้องสั่งยังไม่ได้ระบุผู้ขาย", "Set a supplier on these products first"));
    setStore((s) => ({ ...s, pos: [...s.pos, ...drafts] }));
    show(T(`สร้างใบสั่งซื้อฉบับร่าง ${drafts.length} ใบ (แยกตามผู้ขาย)`, `Drafted ${drafts.length} purchase order(s), one per supplier`));
    go("orders");
    if (drafts.length === 1) openPo(drafts[0]!.id);
  }

  return (
    <div className="report-grid">
      <section className="panel bl-span">
        <dl className="money-kpis kpis-4">
          <div><dt>{T("มูลค่าสต็อก (ทุน)", "Stock value (cost)")}</dt><dd>{money(sum.value)}</dd></div>
          <div><dt>{T("รายการสินค้า", "Active SKUs")}</dt><dd>{sum.skus}</dd></div>
          <div className={sum.low + sum.out ? "k-neg" : ""}><dt>{T("ใกล้หมด / หมด", "Low / out")}</dt><dd>{sum.low} / {sum.out}</dd></div>
          <div><dt>{T("สั่งแล้วรอรับ", "Open POs")}</dt><dd>{sum.openPOs} <small>({money(sum.openPOValue)})</small></dd></div>
        </dl>
        <p className="hint">{T(`เดือนนี้รับเข้า ${money(sum.received)} บาท · เบิกใช้/ขาย คิดเป็นต้นทุน ${money(sum.issuedCost)} บาท`, `This month: received ${money(sum.received)} · used/sold at cost ${money(sum.issuedCost)}`)}</p>
      </section>

      <section className="panel bl-span">
        <div className="panel-row">
          <h2 className="panel-title">{T("ควรสั่งซื้อ", "Reorder now")} <span className="muted-count">({sugg.length})</span></h2>
          {sugg.length > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={createPOs}>{T("สร้างใบสั่งซื้อจากรายการนี้", "Draft purchase orders")}</button>}
        </div>
        {sugg.length === 0 ? <p className="hint">{T("สต็อกทุกรายการอยู่เหนือจุดสั่งซื้อ (นับรวมของที่สั่งแล้วรอรับ)", "Everything is above its reorder point (including stock on order).")}</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={T("รายการควรสั่งซื้อ", "Reorder list")}>
            <table className="docs">
              <thead><tr><th scope="col">{T("สินค้า", "Product")}</th><th scope="col">{T("คงเหลือ", "On hand")}</th><th scope="col">{T("รอรับ", "On order")}</th><th scope="col">{T("จุดสั่งซื้อ", "Reorder at")}</th><th scope="col">{T("แนะนำสั่ง", "Suggest")}</th><th scope="col">{T("ผู้ขาย", "Supplier")}</th></tr></thead>
              <tbody>
                {sugg.map((s) => (
                  <tr key={s.product.id}>
                    <th scope="row"><button type="button" className="text-link" onClick={() => openProduct(s.product.id)}>{s.product.name}</button></th>
                    <td className="num"><span className={s.onHand <= 0 ? "neg" : ""}>{qtyFmt(s.onHand)}</span> {s.product.unit}</td>
                    <td className="num">{s.onOrder ? qtyFmt(s.onOrder) : "—"}</td>
                    <td className="num">{s.product.reorderPoint}</td>
                    <td className="num"><b>{s.suggest}</b></td>
                    <td className="wrap">{supName(s.product.supplierId) ?? <span className="neg">{T("ยังไม่ระบุ", "Not set")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">{T("ใช้มากที่สุด 30 วัน", "Top used, 30 days")}</h2>
        {movers.length === 0 ? <p className="hint">—</p> : (
          <ul className="mover-bars">
            {movers.map((m) => (
              <li key={m.product.id}>
                <span className="mv-name">{m.product.name}</span>
                <span className="mv-bar" aria-hidden="true"><i style={{ width: `${(m.value / maxMover) * 100}%` }} /></span>
                <span className="mv-val">{qtyFmt(m.qty)} {m.product.unit} · ฿{money(m.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-row">
          <h2 className="panel-title">{T("เคลื่อนไหวล่าสุด", "Recent activity")}</h2>
          <button type="button" className="text-link" onClick={() => go("moves")}>{T("ดูทั้งหมด", "See all")}</button>
        </div>
        <ul className="top-list">
          {recent.map((m) => (
            <li key={m.id}>
              <span className="wrap-text">{fmtDate(m.date)} · {name(m.productId)} <small className="muted">· {T(...REASON[m.reason])}{m.ref && ` ${m.ref}`}</small></span>
              <span className={`mono ${m.qty < 0 ? "neg" : "gain"}`}>{m.qty > 0 ? "+" : "−"}{qtyFmt(Math.abs(m.qty))}</span>
            </li>
          ))}
        </ul>
      </section>

      {sum.openPOs > 0 && (
        <section className="panel">
          <h2 className="panel-title">{T("ใบสั่งซื้อรอรับของ", "Awaiting delivery")}</h2>
          <ul className="top-list">
            {store.pos.filter((p) => p.status === "ordered" || p.status === "partial").map((p) => (
              <li key={p.id}>
                <span><button type="button" className="text-link" onClick={() => openPo(p.id)}>{p.no}</button> <small className="muted">{supName(p.supplierId)}</small></span>
                <span className={`mono${p.expected && p.expected < today ? " neg" : ""}`}>{T("กำหนด", "due")} {fmtDate(p.expected)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ PRODUCTS */
function blankProduct(store: Store): Product {
  const n = store.products.length + 1;
  return { id: uid(), sku: `SKU-${String(n).padStart(3, "0")}`, name: "", category: "", unit: "ชิ้น", price: 0, reorderPoint: 5, reorderQty: 10, supplierId: null, lastCost: 0, active: true };
}

function ProductsView({ store, setStore, T, money, show, today, lv, openProduct }: Ctx) {
  const fid = useId();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [st, setSt] = useState<"all" | StockState>("all");
  const [edit, setEdit] = useState<Product | null>(null);
  const cats = [...new Set(store.products.map((p) => p.category).filter(Boolean))];
  const list = store.products
    .filter((p) => (cat === "all" || p.category === cat) && (st === "all" || stockState(p, levelOf(lv, p.id).qty) === st) && `${p.sku} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("สินค้าและวัตถุดิบ", "Products & materials")} <span className="muted-count">({list.length})</span></h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit(blankProduct(store))}>+ {T("เพิ่มสินค้า", "Add product")}</button>
      </div>
      <div className="kb-filter bl-filter">
        <div className="field field--inline"><label htmlFor={`${fid}-q`}>{T("ค้นหา", "Search")}</label><input id={`${fid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("รหัส / ชื่อ", "SKU / name")} /></div>
        <div className="field field--inline">
          <label htmlFor={`${fid}-c`}>{T("หมวด", "Category")}</label>
          <select id={`${fid}-c`} value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">{T("ทั้งหมด", "All")}</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div className="field field--inline">
          <label htmlFor={`${fid}-s`}>{T("สถานะ", "Status")}</label>
          <select id={`${fid}-s`} value={st} onChange={(e) => setSt(e.target.value as typeof st)}>
            <option value="all">{T("ทั้งหมด", "All")}</option>
            {(Object.keys(STATE_LABEL) as StockState[]).map((k) => <option key={k} value={k}>{T(...STATE_LABEL[k])}</option>)}
          </select>
        </div>
      </div>
      {list.length === 0 ? <p className="hint">{T("ไม่พบสินค้า", "No products")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางสินค้า", "Products table")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("รหัส", "SKU")}</th><th scope="col">{T("ชื่อ", "Name")}</th><th scope="col">{T("คงเหลือ", "On hand")}</th><th scope="col">{T("ทุนเฉลี่ย", "Avg cost")}</th><th scope="col">{T("มูลค่า", "Value")}</th><th scope="col">{T("พอใช้อีก", "Cover")}</th><th scope="col">{T("สถานะ", "Status")}</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const l = levelOf(lv, p.id);
                const cover = daysOfCover(l.qty, dailyUsage(store.movements, p.id, today));
                return (
                  <tr key={p.id} className={p.active ? "" : "row-muted"}>
                    <td className="mono">{p.sku}</td>
                    <th scope="row"><button type="button" className="text-link" onClick={() => openProduct(p.id)}>{p.name}</button></th>
                    <td className="num">{qtyFmt(l.qty)} <small>{p.unit}</small></td>
                    <td className="num">{money(l.avgCost)}</td>
                    <td className="num">{money(l.value)}</td>
                    <td className="num">{cover === null ? "—" : T(`${cover} วัน`, `${cover} d`)}</td>
                    <td><StateTag p={p} qty={l.qty} T={T} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{T("“พอใช้อีก” คำนวณจากปริมาณที่ใช้เฉลี่ย 30 วันล่าสุด", "“Cover” uses the average daily usage of the last 30 days.")}</p>
      <ProductEditor edit={edit} setEdit={setEdit} store={store} setStore={setStore} T={T} show={show} today={today} />
    </section>
  );
}

function ProductEditor({ edit, setEdit, store, setStore, T, show, today }: { edit: Product | null; setEdit: (p: Product | null) => void; store: Store; setStore: SetStore; T: TFn; show: (m: string) => void; today: string }) {
  const fid = useId();
  const [opening, setOpening] = useState({ qty: "", cost: "" });
  const [err, setErr] = useState("");
  const isNew = edit ? !store.products.some((p) => p.id === edit.id) : false;
  const cats = [...new Set(store.products.map((p) => p.category).filter(Boolean))];
  useEffect(() => {
    setOpening({ qty: "", cost: "" });
    setErr("");
  }, [edit?.id]);
  if (!edit) return <Modal open={false} onClose={() => setEdit(null)} title="">{null}</Modal>;
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (!edit.name.trim()) return setErr(T("ใส่ชื่อสินค้า", "Enter a name"));
    if (!edit.sku.trim()) return setErr(T("ใส่รหัสสินค้า", "Enter a SKU"));
    if (store.products.some((p) => p.id !== edit.id && p.sku.trim().toLowerCase() === edit.sku.trim().toLowerCase())) return setErr(T("รหัสสินค้าซ้ำ", "Duplicate SKU"));
    const p: Product = { ...edit, sku: edit.sku.trim(), name: edit.name.trim(), category: edit.category.trim(), unit: edit.unit.trim() || "ชิ้น" };
    const oq = num(opening.qty);
    const oc = opening.cost === "" ? p.lastCost : num(opening.cost);
    setStore((s) => {
      let movements = s.movements;
      if (isNew && oq > 0) movements = [...movements, receive(movements, p.id, oq, oc, today, "opening", "ยอดยกมา", uid())];
      const prod = isNew && oq > 0 && !p.lastCost ? { ...p, lastCost: oc } : p;
      return { ...s, movements, products: s.products.some((x) => x.id === p.id) ? s.products.map((x) => (x.id === p.id ? prod : x)) : [...s.products, prod] };
    });
    show(T(`บันทึก ${p.name} แล้ว`, `Saved ${p.name}`));
    setEdit(null);
  }
  const set = (p: Partial<Product>) => setEdit({ ...edit, ...p });
  return (
    <Modal open onClose={() => setEdit(null)} title={isNew ? T("เพิ่มสินค้า", "Add product") : T("แก้ไขสินค้า", "Edit product")} wide>
      <form className="stack-form" onSubmit={save} noValidate>
        <datalist id={`${fid}-cats`}>{cats.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="ed-grid-3">
          <div className="field"><label htmlFor={`${fid}-sku`}>{T("รหัสสินค้า (SKU)", "SKU")}</label><input id={`${fid}-sku`} value={edit.sku} onChange={(e) => set({ sku: e.target.value })} /></div>
          <div className="field ed-span2"><label htmlFor={`${fid}-n`}>{T("ชื่อสินค้า", "Name")}</label><input id={`${fid}-n`} value={edit.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></div>
          <div className="field"><label htmlFor={`${fid}-c`}>{T("หมวด", "Category")}</label><input id={`${fid}-c`} list={`${fid}-cats`} value={edit.category} onChange={(e) => set({ category: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${fid}-u`}>{T("หน่วยนับ", "Unit")}</label><input id={`${fid}-u`} value={edit.unit} onChange={(e) => set({ unit: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${fid}-lc`}>{T("ราคาทุนล่าสุด", "Last cost")}</label><input id={`${fid}-lc`} type="number" inputMode="decimal" min={0} step="any" value={edit.lastCost || ""} onChange={(e) => set({ lastCost: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor={`${fid}-rp`}>{T("จุดสั่งซื้อ (เหลือเท่านี้ให้สั่ง)", "Reorder point")}</label><input id={`${fid}-rp`} type="number" inputMode="decimal" min={0} step="any" value={edit.reorderPoint} onChange={(e) => set({ reorderPoint: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor={`${fid}-rq`}>{T("สั่งครั้งละ (หน่วยแพ็ก)", "Order in packs of")}</label><input id={`${fid}-rq`} type="number" inputMode="decimal" min={1} step="any" value={edit.reorderQty} onChange={(e) => set({ reorderQty: Math.max(1, num(e.target.value)) })} /></div>
          <div className="field">
            <label htmlFor={`${fid}-sup`}>{T("ผู้ขายหลัก", "Main supplier")}</label>
            <select id={`${fid}-sup`} value={edit.supplierId ?? ""} onChange={(e) => set({ supplierId: e.target.value || null })}>
              <option value="">{T("— ไม่ระบุ —", "— None —")}</option>
              {store.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {isNew && (
          <fieldset className="ed-group">
            <legend>{T("ยอดยกมา (ถ้ามีของอยู่แล้ว)", "Opening stock (if you already have some)")}</legend>
            <div className="ed-grid-2">
              <div className="field"><label htmlFor={`${fid}-oq`}>{T("จำนวนที่มีตอนนี้", "Quantity on hand")}</label><input id={`${fid}-oq`} type="number" inputMode="decimal" min={0} step="any" value={opening.qty} onChange={(e) => setOpening({ ...opening, qty: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-oc`}>{T("ทุนต่อหน่วย", "Cost per unit")}</label><input id={`${fid}-oc`} type="number" inputMode="decimal" min={0} step="any" value={opening.cost} onChange={(e) => setOpening({ ...opening, cost: e.target.value })} placeholder={edit.lastCost ? String(edit.lastCost) : ""} /></div>
            </div>
          </fieldset>
        )}
        {!isNew && <label className="check-row"><input type="checkbox" checked={!edit.active} onChange={(e) => set({ active: !e.target.checked })} />{T("เลิกขาย/เลิกใช้ (ซ่อนจากการสั่งซื้อและตรวจนับ)", "Discontinued (hidden from reorders and counts)")}</label>}
        <p className="field-error" role="alert">{err}</p>
        <div className="side-actions">
          <button type="submit" className="btn btn-primary btn-sm">{T("บันทึก", "Save")}</button>
          <button type="button" className="text-link" onClick={() => setEdit(null)}>{T("ยกเลิก", "Cancel")}</button>
          {!isNew && !store.movements.some((m) => m.productId === edit.id) && !store.pos.some((p) => p.lines.some((l) => l.productId === edit.id)) && (
            <ConfirmButton label={T("ลบสินค้า", "Delete")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again")} onConfirm={() => { setStore((s) => ({ ...s, products: s.products.filter((p) => p.id !== edit.id) })); setEdit(null); }} />
          )}
        </div>
      </form>
    </Modal>
  );
}

function ProductDetail({ product, ctx }: { product: Product; ctx: Ctx }) {
  const { store, setStore, T, money, show, today, lv } = ctx;
  const [edit, setEdit] = useState<Product | null>(null);
  const l = levelOf(lv, product.id);
  const usage = dailyUsage(store.movements, product.id, today);
  const cover = daysOfCover(l.qty, usage);
  const rows = ledger(store.movements, product.id);
  const [limit, setLimit] = useState(15);
  const oo = onOrder(store.pos).get(product.id) ?? 0;
  const sup = store.suppliers.find((s) => s.id === product.supplierId);
  return (
    <div className="viewer">
      <dl className="money-kpis kpis-4">
        <div><dt>{T("คงเหลือ", "On hand")}</dt><dd>{qtyFmt(l.qty)} <small>{product.unit}</small></dd></div>
        <div><dt>{T("ทุนเฉลี่ย / มูลค่า", "Avg cost / value")}</dt><dd className="small-dd">{money(l.avgCost)} / {money(l.value)}</dd></div>
        <div><dt>{T("ใช้เฉลี่ย/วัน", "Used per day")}</dt><dd>{qtyFmt(usage)}</dd></div>
        <div><dt>{T("พอใช้อีก", "Cover")}</dt><dd>{cover === null ? "—" : T(`${cover} วัน`, `${cover} days`)}</dd></div>
      </dl>
      <p className="hint">
        <StateTag p={product} qty={l.qty} T={T} /> {T(`จุดสั่งซื้อ ${product.reorderPoint} · สั่งครั้งละ ${product.reorderQty}`, `Reorder at ${product.reorderPoint}, packs of ${product.reorderQty}`)}
        {oo > 0 && T(` · สั่งแล้วรอรับ ${qtyFmt(oo)}`, ` · ${qtyFmt(oo)} on order`)}
        {sup && ` · ${sup.name}`}
      </p>
      <QuickMove product={product} ctx={ctx} />
      <p className="mini-title">{T("ประวัติความเคลื่อนไหว", "Stock card")}</p>
      {rows.length === 0 ? <p className="hint">{T("ยังไม่มี", "None yet")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("บัตรสต็อก", "Stock card")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("วันที่", "Date")}</th><th scope="col">{T("รายการ", "Entry")}</th><th scope="col">{T("เข้า/ออก", "In/out")}</th><th scope="col">{T("ทุน/หน่วย", "Unit cost")}</th><th scope="col">{T("คงเหลือ", "Balance")}</th></tr></thead>
            <tbody>
              {rows.slice(0, limit).map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.date)}</td>
                  <td className="wrap">{T(...REASON[m.reason])}{m.ref && <small className="muted"> {m.ref}</small>}</td>
                  <td className={`num ${m.qty < 0 ? "neg" : "gain"}`}>{m.qty > 0 ? "+" : "−"}{qtyFmt(Math.abs(m.qty))}</td>
                  <td className="num">{m.unitCost !== null ? money(m.unitCost) : ""}</td>
                  <td className="num">{qtyFmt(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="side-actions">
        {rows.length > limit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setLimit((x) => x + 30)}>{T("แสดงเพิ่ม", "Show more")}</button>}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdit(structuredClone(product))}>{T("แก้ไขข้อมูลสินค้า", "Edit product")}</button>
      </div>
      <ProductEditor edit={edit} setEdit={setEdit} store={store} setStore={setStore} T={T} show={show} today={today} />
    </div>
  );
}

/* ------------------------------------------------------------------ IN / OUT */
function QuickMove({ product, ctx, full }: { product?: Product; ctx: Ctx; full?: boolean }) {
  const { store, setStore, T, money, show, today, lv } = ctx;
  const fid = useId();
  const [dir, setDir] = useState<"out" | "in">("out");
  const [pid, setPid] = useState(product?.id ?? "");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState<Reason>("use");
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  const p = store.products.find((x) => x.id === (product?.id ?? pid));
  const qtyRef = useRef<HTMLInputElement>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return setErr(T("เลือกสินค้า", "Pick a product"));
    try {
      const m = dir === "out"
        ? issue(store.movements, p.id, num(qty), date, reason, ref.trim(), uid())
        : receive(store.movements, p.id, num(qty), cost === "" ? p.lastCost || levelOf(lv, p.id).avgCost : num(cost), date, reason, ref.trim(), uid());
      setStore((s) => ({ ...s, movements: [...s.movements, m], products: dir === "in" && cost !== "" ? s.products.map((x) => (x.id === p.id ? { ...x, lastCost: num(cost) } : x)) : s.products }));
      show(T(`${dir === "out" ? "เบิกออก" : "รับเข้า"} ${p.name} ${qtyFmt(Math.abs(m.qty))} ${p.unit} แล้ว`, `${dir === "out" ? "Issued" : "Received"} ${qtyFmt(Math.abs(m.qty))} ${p.unit} ${p.name}`));
      setQty("");
      setRef("");
      setErr("");
      qtyRef.current?.focus();
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  const reasons = dir === "out" ? OUT_REASONS : IN_REASONS;
  return (
    <form className={`move-form${full ? " panel" : ""}`} onSubmit={submit} noValidate>
      {full && <h2 className="panel-title">{T("บันทึกรับเข้า / เบิกออก", "Record stock in / out")}</h2>}
      <div className="seg seg--wide" role="group" aria-label={T("ประเภท", "Direction")}>
        <button type="button" aria-pressed={dir === "out"} onClick={() => { setDir("out"); setReason("use"); setErr(""); }}>{T("เบิกออก / ขาย", "Out / sold")}</button>
        <button type="button" aria-pressed={dir === "in"} onClick={() => { setDir("in"); setReason("purchase"); setErr(""); }}>{T("รับเข้า", "In")}</button>
      </div>
      <div className="move-grid">
        {!product && (
          <div className="field move-product">
            <label htmlFor={`${fid}-p`}>{T("สินค้า", "Product")}</label>
            <select id={`${fid}-p`} value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">{T("— เลือกสินค้า —", "— Choose —")}</option>
              {store.products.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name} ({T("เหลือ", "left")} {qtyFmt(levelOf(lv, x.id).qty)})</option>)}
            </select>
          </div>
        )}
        <div className="field"><label htmlFor={`${fid}-q`}>{T("จำนวน", "Quantity")}{p && ` (${p.unit})`}</label><input ref={qtyRef} id={`${fid}-q`} type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={Boolean(err) || undefined} aria-describedby={`${fid}-e`} /></div>
        {dir === "in" && <div className="field"><label htmlFor={`${fid}-c`}>{T("ทุนต่อหน่วย", "Unit cost")}</label><input id={`${fid}-c`} type="number" inputMode="decimal" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={p ? String(p.lastCost || levelOf(lv, p.id).avgCost) : ""} /></div>}
        <div className="field">
          <label htmlFor={`${fid}-r`}>{T("เหตุผล", "Reason")}</label>
          <select id={`${fid}-r`} value={reason} onChange={(e) => setReason(e.target.value as Reason)}>{reasons.map((r) => <option key={r} value={r}>{T(...REASON[r])}</option>)}</select>
        </div>
        <div className="field"><label htmlFor={`${fid}-d`}>{T("วันที่", "Date")}</label><input id={`${fid}-d`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} /></div>
        <div className="field"><label htmlFor={`${fid}-ref`}>{T("อ้างอิง / หมายเหตุ", "Reference / note")}</label><input id={`${fid}-ref`} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      </div>
      {dir === "in" && reason === "purchase" && <p className="hint">{T("ถ้าซื้อตามใบสั่งซื้อ ให้กด “รับสินค้า” ในใบสั่งซื้อแทน ระบบจะอัปเดตยอดค้างรับให้", "Buying against a PO? Use “Receive” on the PO so it tracks what's outstanding.")}</p>}
      <p className="field-error" id={`${fid}-e`} role="alert">{err}</p>
      <div className="side-actions"><button type="submit" className="btn btn-primary btn-sm">{dir === "out" ? T("บันทึกเบิกออก", "Record out") : T("บันทึกรับเข้า", "Record in")}</button>{p && dir === "in" && <span className="hint">{T(`ทุนเฉลี่ยปัจจุบัน ${money(levelOf(lv, p.id).avgCost)}`, `Current avg cost ${money(levelOf(lv, p.id).avgCost)}`)}</span>}</div>
    </form>
  );
}

function MovesView(ctx: Ctx) {
  const { store, T, money, openProduct } = ctx;
  const fid = useId();
  const [kind, setKind] = useState<"all" | "in" | "out" | "adjust">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const pmap = new Map(store.products.map((p) => [p.id, p]));
  const list = [...store.movements]
    .filter((m) => (kind === "all" || (kind === "in" ? m.qty > 0 && m.type !== "adjust" : kind === "out" ? m.type === "issue" : m.type === "adjust")) && `${pmap.get(m.productId)?.name ?? ""} ${pmap.get(m.productId)?.sku ?? ""} ${m.ref}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1));
  return (
    <div className="report-grid">
      <QuickMove ctx={ctx} full />
      <section className="panel bl-span">
        <div className="panel-row">
          <h2 className="panel-title">{T("ประวัติทั้งหมด", "All movements")} <span className="muted-count">({list.length})</span></h2>
          <div className="kb-filter bl-filter">
            <div className="seg" role="group" aria-label={T("กรองประเภท", "Filter type")}>
              {([["all", "ทั้งหมด", "All"], ["in", "เข้า", "In"], ["out", "ออก", "Out"], ["adjust", "ปรับยอด", "Adjust"]] as const).map(([k, th, en]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{T(th, en)}</button>)}
            </div>
            <div className="field field--inline"><label htmlFor={`${fid}-q`}>{T("ค้นหา", "Search")}</label><input id={`${fid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางความเคลื่อนไหว", "Movements table")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("วันที่", "Date")}</th><th scope="col">{T("สินค้า", "Product")}</th><th scope="col">{T("รายการ", "Reason")}</th><th scope="col">{T("จำนวน", "Qty")}</th><th scope="col">{T("ทุน/หน่วย", "Unit cost")}</th></tr></thead>
            <tbody>
              {list.slice(0, limit).map((m) => {
                const p = pmap.get(m.productId);
                return (
                  <tr key={m.id}>
                    <td>{fmtDate(m.date)}</td>
                    <th scope="row"><button type="button" className="text-link" onClick={() => openProduct(m.productId)}>{p?.name ?? "—"}</button></th>
                    <td className="wrap">{T(...REASON[m.reason])}{m.ref && <small className="muted"> {m.ref}</small>}</td>
                    <td className={`num ${m.qty < 0 ? "neg" : "gain"}`}>{m.qty > 0 ? "+" : "−"}{qtyFmt(Math.abs(m.qty))} <small>{p?.unit}</small></td>
                    <td className="num">{m.unitCost !== null ? money(m.unitCost) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length > limit && <div className="side-actions"><button type="button" className="btn btn-outline btn-sm" onClick={() => setLimit((x) => x + 80)}>{T(`แสดงเพิ่ม (เหลือ ${list.length - limit})`, `Show more (${list.length - limit} left)`)}</button></div>}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ PURCHASE ORDERS */
function OrdersView({ store, setStore, T, money, today, openPo }: Ctx) {
  const [status, setStatus] = useState<"open" | "all" | PoStatus>("open");
  const sup = (id: string) => store.suppliers.find((s) => s.id === id)?.name ?? "—";
  const list = store.pos
    .filter((p) => (status === "all" ? true : status === "open" ? ["draft", "ordered", "partial"].includes(p.status) : p.status === status))
    .sort((a, b) => (a.no < b.no ? 1 : -1));
  function create() {
    if (!store.suppliers.length) return;
    const s = store.suppliers[0]!;
    const po: PurchaseOrder = { id: uid(), no: nextPoNumber(store.pos, today), supplierId: s.id, date: today, expected: addDays(today, s.leadDays), status: "draft", lines: [], note: "" };
    setStore((x) => ({ ...x, pos: [...x.pos, po] }));
    openPo(po.id);
  }
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("ใบสั่งซื้อ", "Purchase orders")} <span className="muted-count">({list.length})</span></h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={create} disabled={!store.suppliers.length}>+ {T("สร้างใบสั่งซื้อ", "New PO")}</button>
      </div>
      {!store.suppliers.length && <p className="hint">{T("เพิ่มผู้ขายในแท็บ “ผู้ขาย” ก่อนสร้างใบสั่งซื้อ", "Add a supplier first.")}</p>}
      <div className="seg bl-seg" role="group" aria-label={T("กรองสถานะ", "Filter status")}>
        {([["open", "ยังไม่ปิด", "Open"], ["received", "รับครบ", "Received"], ["cancelled", "ยกเลิก", "Cancelled"], ["all", "ทั้งหมด", "All"]] as const).map(([k, th, en]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{T(th, en)}</button>)}
      </div>
      {list.length === 0 ? <p className="hint">{T("ไม่มีใบสั่งซื้อ", "No purchase orders")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางใบสั่งซื้อ", "Purchase orders table")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("เลขที่", "No.")}</th><th scope="col">{T("วันที่", "Date")}</th><th scope="col">{T("ผู้ขาย", "Supplier")}</th><th scope="col">{T("ยอดรวม", "Total")}</th><th scope="col">{T("รับแล้ว", "Received")}</th><th scope="col">{T("สถานะ", "Status")}</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const pr = poProgress(p);
                const late = (p.status === "ordered" || p.status === "partial") && p.expected !== null && p.expected < today;
                return (
                  <tr key={p.id}>
                    <th scope="row"><button type="button" className="text-link" onClick={() => openPo(p.id)}>{p.no}</button></th>
                    <td>{fmtDate(p.date)}</td>
                    <td className="wrap">{sup(p.supplierId)}</td>
                    <td className="num">{money(poTotal(p))}</td>
                    <td className="num">{p.status === "draft" || p.status === "cancelled" ? "—" : `${pr.percent}%`}</td>
                    <td><span className={`st st-po-${p.status}`}>{T(...PO_LABEL[p.status])}</span>{late && <span className="tag-clash"> {T("เลยกำหนดส่ง", "late")}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PoPaper({ po, store }: { po: PurchaseOrder; store: Store }) {
  const sup = store.suppliers.find((s) => s.id === po.supplierId);
  const m = (n: number) => baht(n, "th");
  const pmap = new Map(store.products.map((p) => [p.id, p]));
  return (
    <article className="paper" lang="th">
      <header className="paper-head">
        <div className="paper-biz">
          <p className="paper-bizname">{store.biz.name}</p>
          {store.biz.address && <p>{store.biz.address}</p>}
          <p>{store.biz.taxId && <>เลขประจำตัวผู้เสียภาษี {store.biz.taxId} · </>}{store.biz.phone && <>โทร {store.biz.phone}</>}{store.biz.contact && <> · ผู้ติดต่อ {store.biz.contact}</>}</p>
        </div>
        <div className="paper-title">
          <h3>ใบสั่งซื้อ</h3>
          <p className="paper-en">Purchase Order</p>
          <dl>
            <div><dt>เลขที่</dt><dd>{po.no}</dd></div>
            <div><dt>วันที่</dt><dd>{fmtDate(po.date)}</dd></div>
            {po.expected && <div><dt>ต้องการรับ</dt><dd>{fmtDate(po.expected)}</dd></div>}
          </dl>
          {po.status === "cancelled" && <p className="paper-stamp">ยกเลิก / CANCELLED</p>}
        </div>
      </header>
      <section className="paper-cust" aria-label="ผู้ขาย">
        <p className="paper-label">ผู้ขาย / Supplier</p>
        <p className="paper-custname">{sup?.name ?? "—"}</p>
        {sup && (sup.contact || sup.phone || sup.email) && <p>{[sup.contact && `ติดต่อ ${sup.contact}`, sup.phone && `โทร ${sup.phone}`, sup.email].filter(Boolean).join(" · ")}</p>}
      </section>
      <table className="paper-lines">
        <thead><tr><th scope="col">#</th><th scope="col">รายการ</th><th scope="col">จำนวน</th><th scope="col">ราคา/หน่วย</th><th scope="col">จำนวนเงิน</th></tr></thead>
        <tbody>
          {po.lines.map((l, i) => {
            const p = pmap.get(l.productId);
            return (
              <tr key={l.productId}>
                <td>{i + 1}</td>
                <td>{p ? `${p.sku} · ${p.name}` : "—"}</td>
                <td className="n">{qtyFmt(l.qty)} {p?.unit}</td>
                <td className="n">{m(l.unitCost)}</td>
                <td className="n">{m(Math.round(l.qty * l.unitCost * 100) / 100)}</td>
              </tr>
            );
          })}
          {po.lines.length === 0 && <tr><td colSpan={5} className="paper-emptyrow">— ยังไม่มีรายการ —</td></tr>}
        </tbody>
      </table>
      <div className="paper-foot">
        <div className="paper-words">{po.note && <><p className="paper-label">หมายเหตุ</p><p className="paper-note">{po.note}</p></>}</div>
        <dl className="paper-totals"><div className="pt-total"><dt>รวมทั้งสิ้น</dt><dd>{m(poTotal(po))}</dd></div></dl>
      </div>
      <div className="paper-sign">
        <div><span />ผู้สั่งซื้อ</div>
        <div><span />ผู้ขายยืนยันคำสั่งซื้อ</div>
      </div>
    </article>
  );
}

function PoViewer({ po, ctx, onPrint }: { po: PurchaseOrder; ctx: Ctx; onPrint: (p: PurchaseOrder) => void }) {
  const { store, setStore, T, money, show, today, lv } = ctx;
  const fid = useId();
  const [mode, setMode] = useState<"view" | "receive">("view");
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [recvDate, setRecvDate] = useState(today);
  const [err, setErr] = useState("");
  const draft = po.status === "draft";
  const setPo = (p: Partial<PurchaseOrder>) => setStore((s) => ({ ...s, pos: s.pos.map((x) => (x.id === po.id ? { ...x, ...p } : x)) }));
  const setLine = (i: number, p: Partial<PoLine>) => setPo({ lines: po.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const pmap = new Map(store.products.map((p) => [p.id, p]));
  const available = store.products.filter((p) => p.active && !po.lines.some((l) => l.productId === p.id)).sort((a, b) => Number(b.supplierId === po.supplierId) - Number(a.supplierId === po.supplierId) || a.sku.localeCompare(b.sku));

  function doReceive(e: React.FormEvent) {
    e.preventDefault();
    try {
      const receipts = Object.fromEntries(Object.entries(recv).map(([k, v]) => [k, num(v)]));
      const r = receivePO(po, receipts, recvDate, store.movements, uid);
      setStore((s) => ({
        ...s,
        pos: s.pos.map((x) => (x.id === po.id ? r.po : x)),
        movements: [...s.movements, ...r.moves],
        products: s.products.map((p) => { const l = po.lines.find((x) => x.productId === p.id); return l && receipts[p.id] ? { ...p, lastCost: l.unitCost } : p; }),
      }));
      show(r.po.status === "received" ? T("รับสินค้าครบแล้ว", "Fully received") : T("บันทึกรับบางส่วนแล้ว", "Partial receipt saved"));
      setMode("view");
      setErr("");
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="viewer">
      <div className="viewer-actions side-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onPrint(po)} disabled={!po.lines.length}>{T("พิมพ์ / PDF", "Print / PDF")}</button>
        {draft && <button type="button" className="btn btn-primary btn-sm" disabled={!po.lines.length || po.lines.some((l) => !(l.qty > 0))} onClick={() => { setPo({ status: "ordered" }); show(T("บันทึกว่าส่งใบสั่งซื้อให้ผู้ขายแล้ว", "Marked as sent to supplier")); }}>{T("ยืนยันส่งให้ผู้ขาย", "Mark as ordered")}</button>}
        {(po.status === "ordered" || po.status === "partial") && mode === "view" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setRecv(Object.fromEntries(po.lines.map((l) => [l.productId, String(Math.max(0, l.qty - l.received))]))); setRecvDate(today); setErr(""); setMode("receive"); }}>{T("รับสินค้า", "Receive goods")}</button>
        )}
        {po.status === "partial" && <ConfirmButton className="btn btn-outline btn-sm" label={T("ปิดยอดค้าง (ผู้ขายส่งไม่ครบ)", "Close remaining")} confirmLabel={T("กดอีกครั้ง — ยอดที่ยังไม่ได้รับจะถูกตัดทิ้ง", "Tap again to drop the rest")} onConfirm={() => setPo(closePO(po))} />}
        {(draft || (po.status === "ordered" && po.lines.every((l) => l.received === 0))) && (
          <ConfirmButton label={T("ยกเลิกใบสั่งซื้อ", "Cancel PO")} confirmLabel={T("กดอีกครั้งเพื่อยกเลิก", "Tap again to cancel")} onConfirm={() => setPo({ status: "cancelled" })} />
        )}
      </div>

      {draft && (
        <div className="panel po-edit">
          <div className="ed-grid-3">
            <div className="field">
              <label htmlFor={`${fid}-s`}>{T("ผู้ขาย", "Supplier")}</label>
              <select id={`${fid}-s`} value={po.supplierId} onChange={(e) => { const s = store.suppliers.find((x) => x.id === e.target.value); setPo({ supplierId: e.target.value, expected: s ? addDays(po.date, s.leadDays) : po.expected }); }}>
                {store.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor={`${fid}-d`}>{T("วันที่", "Date")}</label><input id={`${fid}-d`} type="date" value={po.date} onChange={(e) => setPo({ date: e.target.value || po.date })} /></div>
            <div className="field"><label htmlFor={`${fid}-x`}>{T("ต้องการรับ", "Needed by")}</label><input id={`${fid}-x`} type="date" value={po.expected ?? ""} onChange={(e) => setPo({ expected: e.target.value || null })} /></div>
          </div>
          <ul className="po-lines">
            {po.lines.map((l, i) => {
              const p = pmap.get(l.productId);
              return (
                <li key={l.productId}>
                  <span className="po-name">{p?.sku} · {p?.name}<small className="muted"> {T("เหลือ", "on hand")} {qtyFmt(levelOf(lv, l.productId).qty)} {p?.unit}</small></span>
                  <div className="field"><label htmlFor={`${fid}-q-${i}`}>{T("จำนวน", "Qty")}</label><input id={`${fid}-q-${i}`} type="number" inputMode="decimal" min={0} step="any" value={l.qty || ""} onChange={(e) => setLine(i, { qty: num(e.target.value) })} /></div>
                  <div className="field"><label htmlFor={`${fid}-c-${i}`}>{T("ราคา/หน่วย", "Unit cost")}</label><input id={`${fid}-c-${i}`} type="number" inputMode="decimal" min={0} step="any" value={l.unitCost || ""} onChange={(e) => setLine(i, { unitCost: num(e.target.value) })} /></div>
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={T(`ลบ ${p?.name ?? ""}`, `Remove ${p?.name ?? ""}`)} onClick={() => setPo({ lines: po.lines.filter((_, j) => j !== i) })}>✕</button>
                </li>
              );
            })}
          </ul>
          <div className="side-actions">
            <select className="ed-catalog" aria-label={T("เพิ่มสินค้าในใบสั่งซื้อ", "Add product to PO")} value="" onChange={(e) => { const p = pmap.get(e.target.value); if (p) setPo({ lines: [...po.lines, { productId: p.id, qty: p.reorderQty, unitCost: p.lastCost || levelOf(lv, p.id).avgCost, received: 0 }] }); }}>
              <option value="">{T("+ เพิ่มสินค้า…", "+ Add product…")}</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.supplierId === po.supplierId ? "★ " : ""}{p.sku} · {p.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor={`${fid}-n`}>{T("หมายเหตุถึงผู้ขาย", "Note to supplier")}</label><textarea id={`${fid}-n`} rows={2} value={po.note} onChange={(e) => setPo({ note: e.target.value })} /></div>
          <p className="hint">{T("★ = สินค้าที่มีผู้ขายรายนี้เป็นผู้ขายหลัก · แก้ไขได้จนกว่าจะกด “ยืนยันส่งให้ผู้ขาย”", "★ = this supplier's products · editable until marked as ordered")}</p>
        </div>
      )}

      {mode === "receive" && (
        <form className="panel pay-form" onSubmit={doReceive} noValidate>
          <h3 className="mini-title">{T("รับสินค้าตามใบสั่งซื้อ", "Receive against this PO")}</h3>
          <div className="field field--inline"><label htmlFor={`${fid}-rd`}>{T("วันที่รับ", "Date received")}</label><input id={`${fid}-rd`} type="date" value={recvDate} max={today} onChange={(e) => setRecvDate(e.target.value || today)} /></div>
          <ul className="po-lines">
            {po.lines.map((l, i) => {
              const p = pmap.get(l.productId);
              const left = Math.max(0, l.qty - l.received);
              return (
                <li key={l.productId}>
                  <span className="po-name">{p?.name}<small className="muted"> {T(`สั่ง ${qtyFmt(l.qty)} · รับแล้ว ${qtyFmt(l.received)}`, `ordered ${qtyFmt(l.qty)} · received ${qtyFmt(l.received)}`)}</small></span>
                  <div className="field"><label htmlFor={`${fid}-r-${i}`}>{T(`รับครั้งนี้ (ค้าง ${qtyFmt(left)})`, `Now (${qtyFmt(left)} left)`)}</label><input id={`${fid}-r-${i}`} type="number" inputMode="decimal" min={0} max={left} step="any" disabled={left === 0} value={recv[l.productId] ?? ""} onChange={(e) => setRecv({ ...recv, [l.productId]: e.target.value })} /></div>
                </li>
              );
            })}
          </ul>
          <p className="field-error" role="alert">{err}</p>
          <div className="side-actions">
            <button type="submit" className="btn btn-primary btn-sm">{T("บันทึกรับสินค้าเข้าสต็อก", "Add to stock")}</button>
            <button type="button" className="text-link" onClick={() => setMode("view")}>{T("ยกเลิก", "Cancel")}</button>
          </div>
        </form>
      )}

      {po.status !== "draft" && po.status !== "cancelled" && (
        <p className="hint">{T(`รับแล้ว ${poProgress(po).percent}% · มูลค่า ${money(poTotal(po))} บาท`, `${poProgress(po).percent}% received · ${money(poTotal(po))}`)}</p>
      )}
      <div className="paper-wrap"><PoPaper po={po} store={store} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ STOCK COUNT */
function CountView({ store, setStore, T, money, show, today, lv }: Ctx) {
  const fid = useId();
  const [cat, setCat] = useState("all");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today);
  const cats = [...new Set(store.products.map((p) => p.category).filter(Boolean))];
  const list = store.products.filter((p) => p.active && (cat === "all" || p.category === cat)).sort((a, b) => a.sku.localeCompare(b.sku));
  const diffs = list
    .filter((p) => counted[p.id] !== undefined && counted[p.id] !== "")
    .map((p) => ({ p, diff: Math.round((num(counted[p.id]!) - levelOf(lv, p.id).qty) * 10000) / 10000 }))
    .filter((x) => x.diff !== 0);
  const impact = diffs.reduce((t, x) => t + x.diff * levelOf(lv, x.p.id).avgCost, 0);
  function apply() {
    const input = Object.fromEntries(Object.entries(counted).filter(([, v]) => v !== "").map(([k, v]) => [k, num(v)]));
    const adj = stockCount(store.movements, input, date, uid, `ตรวจนับ ${fmtDate(date)}`);
    setStore((s) => ({ ...s, movements: [...s.movements, ...adj] }));
    setCounted({});
    show(adj.length ? T(`ปรับยอด ${adj.length} รายการแล้ว`, `Adjusted ${adj.length} item(s)`) : T("ยอดตรงกับระบบทุกรายการ", "Everything matched"));
  }
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("ตรวจนับสต็อก", "Stock count")}</h2>
        <div className="kb-filter bl-filter">
          <div className="field field--inline"><label htmlFor={`${fid}-c`}>{T("หมวด", "Category")}</label><select id={`${fid}-c`} value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">{T("ทั้งหมด", "All")}</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field field--inline"><label htmlFor={`${fid}-d`}>{T("วันที่นับ", "Count date")}</label><input id={`${fid}-d`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} /></div>
        </div>
      </div>
      <p className="hint">{T("นับของจริงแล้วกรอกเฉพาะรายการที่นับ ช่องที่เว้นว่างจะไม่ถูกปรับ — ระบบบันทึกผลต่างเป็นรายการ “ปรับจากการตรวจนับ” ย้อนดูได้ภายหลัง", "Enter what you physically counted; blanks are skipped. Differences are saved as count adjustments you can audit later.")}</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางตรวจนับ", "Count sheet")}>
        <table className="docs count-table">
          <thead><tr><th scope="col">{T("รหัส", "SKU")}</th><th scope="col">{T("สินค้า", "Product")}</th><th scope="col">{T("ในระบบ", "System")}</th><th scope="col">{T("นับได้", "Counted")}</th><th scope="col">{T("ผลต่าง", "Diff")}</th></tr></thead>
          <tbody>
            {list.map((p) => {
              const sys = levelOf(lv, p.id).qty;
              const v = counted[p.id] ?? "";
              const d = v === "" ? null : Math.round((num(v) - sys) * 10000) / 10000;
              return (
                <tr key={p.id}>
                  <td className="mono">{p.sku}</td>
                  <th scope="row">{p.name}</th>
                  <td className="num">{qtyFmt(sys)} <small>{p.unit}</small></td>
                  <td><input className="meter-input" type="number" inputMode="decimal" min={0} step="any" aria-label={T(`นับได้ ${p.name}`, `Counted ${p.name}`)} value={v} onChange={(e) => setCounted({ ...counted, [p.id]: e.target.value })} /></td>
                  <td className={`num${d ? (d < 0 ? " neg" : " gain") : ""}`}>{d === null ? "" : d === 0 ? "✓" : `${d > 0 ? "+" : "−"}${qtyFmt(Math.abs(d))}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="side-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={!Object.values(counted).some((v) => v !== "")} onClick={apply}>{T(`บันทึกผลตรวจนับ (${diffs.length} รายการต่าง)`, `Save count (${diffs.length} differences)`)}</button>
        {diffs.length > 0 && <span className={impact < 0 ? "neg" : "gain"}>{T("ผลต่างมูลค่า", "Value impact")} {impact < 0 ? "−" : "+"}{money(Math.abs(impact))}</span>}
        {Object.keys(counted).length > 0 && <button type="button" className="text-link" onClick={() => setCounted({})}>{T("ล้างที่กรอก", "Clear")}</button>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ SUPPLIERS */
function SuppliersView({ store, setStore, T, money, show }: Ctx) {
  const fid = useId();
  const [edit, setEdit] = useState<Supplier | null>(null);
  const spent = (id: string) => store.pos.filter((p) => p.supplierId === id && p.status !== "cancelled" && p.status !== "draft").reduce((t, p) => t + p.lines.reduce((s, l) => s + l.received * l.unitCost, 0), 0);
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("ผู้ขาย / ซัพพลายเออร์", "Suppliers")} <span className="muted-count">({store.suppliers.length})</span></h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ id: uid(), name: "", contact: "", phone: "", email: "", leadDays: 3, note: "" })}>+ {T("เพิ่มผู้ขาย", "Add supplier")}</button>
      </div>
      {store.suppliers.length === 0 ? <p className="hint">{T("ยังไม่มีผู้ขาย", "No suppliers yet")}</p> : (
        <ul className="cust-grid">
          {store.suppliers.map((s) => (
            <li key={s.id} className="cust-card">
              <h3>{s.name}</h3>
              <p className="muted">{[s.contact, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</p>
              <p>{T(`ส่งของภายใน ${s.leadDays} วัน · ${store.products.filter((p) => p.supplierId === s.id).length} สินค้า`, `${s.leadDays}-day lead time · ${store.products.filter((p) => p.supplierId === s.id).length} products`)}</p>
              <p className="muted">{T(`ซื้อไปแล้ว ${money(spent(s.id))} บาท`, `Bought ${money(spent(s.id))}`)}{s.note && ` · ${s.note}`}</p>
              <div className="row-actions"><button type="button" className="text-link" onClick={() => setEdit(structuredClone(s))}>{T("แก้ไข", "Edit")}<span className="sr-only"> {s.name}</span></button></div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit && store.suppliers.some((s) => s.id === edit.id) ? T("แก้ไขผู้ขาย", "Edit supplier") : T("เพิ่มผู้ขาย", "Add supplier")}>
        {edit && (
          <form className="stack-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (!edit.name.trim()) return;
            const s = { ...edit, name: edit.name.trim() };
            setStore((x) => ({ ...x, suppliers: x.suppliers.some((y) => y.id === s.id) ? x.suppliers.map((y) => (y.id === s.id ? s : y)) : [...x.suppliers, s] }));
            setEdit(null);
            show(T("บันทึกผู้ขายแล้ว", "Supplier saved"));
          }}>
            <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อผู้ขาย / บริษัท", "Name")}</label><input id={`${fid}-n`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
            <div className="grid-2">
              <div className="field"><label htmlFor={`${fid}-c`}>{T("ผู้ติดต่อ", "Contact")}</label><input id={`${fid}-c`} value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-p`}>{T("โทร", "Phone")}</label><input id={`${fid}-p`} type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-e`}>{T("อีเมล / LINE", "Email / LINE")}</label><input id={`${fid}-e`} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-l`}>{T("ส่งของภายใน (วัน)", "Lead time (days)")}</label><input id={`${fid}-l`} type="number" min={0} value={edit.leadDays} onChange={(e) => setEdit({ ...edit, leadDays: Math.max(0, num(e.target.value)) })} /></div>
            </div>
            <div className="field"><label htmlFor={`${fid}-no`}>{T("หมายเหตุ (เช่น สั่งขั้นต่ำ, วันที่ส่ง)", "Notes (minimum order, delivery days…)")}</label><input id={`${fid}-no`} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
            <div className="side-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!edit.name.trim()}>{T("บันทึก", "Save")}</button>
              {store.suppliers.some((s) => s.id === edit.id) && !store.pos.some((p) => p.supplierId === edit.id) && (
                <ConfirmButton label={T("ลบผู้ขาย", "Delete")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again")} onConfirm={() => { setStore((x) => ({ ...x, suppliers: x.suppliers.filter((s) => s.id !== edit.id), products: x.products.map((p) => (p.supplierId === edit.id ? { ...p, supplierId: null } : p)) })); setEdit(null); }} />
              )}
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ SETTINGS */
function SettingsView({ store, setStore, T, show, today }: Ctx) {
  const fid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const bz = store.biz;
  const set = (p: Partial<Biz>) => setStore((s) => ({ ...s, biz: { ...s.biz, ...p } }));
  return (
    <section className="panel settings-panel">
      <h2 className="panel-title">{T("ข้อมูลร้าน (หัวใบสั่งซื้อ)", "Business details (PO letterhead)")}</h2>
      <div className="stack-form">
        <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อร้าน / บริษัท", "Name")}</label><input id={`${fid}-n`} value={bz.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${fid}-a`}>{T("ที่อยู่จัดส่ง", "Delivery address")}</label><textarea id={`${fid}-a`} rows={2} value={bz.address} onChange={(e) => set({ address: e.target.value })} /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor={`${fid}-p`}>{T("โทร", "Phone")}</label><input id={`${fid}-p`} type="tel" value={bz.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${fid}-c`}>{T("ผู้ติดต่อ", "Contact person")}</label><input id={`${fid}-c`} value={bz.contact} onChange={(e) => set({ contact: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${fid}-t`}>{T("เลขผู้เสียภาษี (ถ้ามี)", "Tax ID (optional)")}</label><input id={`${fid}-t`} inputMode="numeric" value={bz.taxId} onChange={(e) => set({ taxId: e.target.value })} /></div>
        </div>
      </div>
      <p className="mini-title">{T(`ข้อมูล (${store.products.length} สินค้า, ${store.movements.length} รายการเคลื่อนไหว, ${store.pos.length} ใบสั่งซื้อ)`, `Data (${store.products.length} products, ${store.movements.length} movements, ${store.pos.length} POs)`)}</p>
      <div className="side-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={!store.products.length} onClick={() => download(`stock-${today}.csv`, stockCsv(store.products, store.movements), "text/csv;charset=utf-8")}>{T("ส่งออกยอดคงเหลือ (CSV)", "Export stock (CSV)")}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => download(`inventory-backup-${today}.json`, JSON.stringify(store), "application/json")}>{T("สำรองข้อมูล", "Back up")}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("กู้คืนจากไฟล์", "Restore")}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const d = JSON.parse(await readFile(f)) as Store;
            if (!Array.isArray(d.products) || !Array.isArray(d.movements) || !Array.isArray(d.pos)) throw new Error();
            setStore(() => ({ ...empty(), ...d, biz: { ...defaultBiz, ...d.biz } }));
            show(T("กู้คืนข้อมูลแล้ว", "Restored"));
          } catch {
            show(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบสต็อก", "Not an inventory backup file"));
          }
        }} />
        <ConfirmButton label={T("ล้างข้อมูลทั้งหมด", "Delete all data")} confirmLabel={T("กดอีกครั้งเพื่อลบทุกอย่าง", "Tap again to delete everything")} onConfirm={() => setStore(() => empty())} />
      </div>
      <p className="privacy">{T("ยอดคงเหลือคำนวณจากรายการเคลื่อนไหวทั้งหมด จึงตรวจย้อนหลังได้เสมอ · ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น สำรองไฟล์เป็นประจำ", "Balances are computed from every movement, so they're always auditable. Data stays in this browser — back up regularly.")}</p>
    </section>
  );
}
