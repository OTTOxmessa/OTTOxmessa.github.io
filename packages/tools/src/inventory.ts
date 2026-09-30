/**
 * ระบบสต็อกสินค้า + สั่งซื้อจากซัพพลายเออร์ สำหรับร้าน/ธุรกิจขนาดเล็ก
 * - ยอดคงเหลือคำนวณจาก "รายการเคลื่อนไหว" ทั้งหมด (ไม่เก็บยอดซ้ำ จึงตรวจย้อนหลังได้เสมอ)
 * - ต้นทุนแบบถัวเฉลี่ยเคลื่อนที่ (moving average) — วิธีที่ SME ไทยใช้กันมากที่สุด
 * - จุดสั่งซื้อ (reorder point) + ยอดที่สั่งค้างอยู่ → แนะนำใบสั่งซื้อแยกตามผู้ขาย
 */
export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number; // ราคาขาย
  reorderPoint: number; // เหลือเท่านี้แล้วควรสั่ง
  reorderQty: number; // สั่งครั้งละ
  supplierId: string | null;
  lastCost: number; // ราคาทุนล่าสุด (ใช้เป็นค่าเริ่มต้นตอนสั่งซื้อ)
  active: boolean;
};
export type Supplier = { id: string; name: string; contact: string; phone: string; email: string; leadDays: number; note: string };
export type MoveType = "receive" | "issue" | "adjust" | "opening";
export type Reason = "purchase" | "sale" | "use" | "damaged" | "return" | "count" | "opening" | "other";
export type Movement = {
  id: string;
  date: string; // YYYY-MM-DD
  seq: number; // ลำดับภายในวัน
  productId: string;
  type: MoveType;
  qty: number; // + เข้า / − ออก
  unitCost: number | null; // เฉพาะรับเข้า
  reason: Reason;
  ref: string; // เลขที่ PO / หมายเหตุ
};
export type PoLine = { productId: string; qty: number; unitCost: number; received: number };
export type PoStatus = "draft" | "ordered" | "partial" | "received" | "cancelled";
export type PurchaseOrder = {
  id: string;
  no: string;
  supplierId: string;
  date: string;
  expected: string | null;
  status: PoStatus;
  lines: PoLine[];
  note: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const byTime = (a: Movement, b: Movement) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq);

export type Level = { qty: number; avgCost: number; value: number };

/** ยอดคงเหลือ + ต้นทุนเฉลี่ย ณ วันที่กำหนด (ไม่ใส่ = ทั้งหมด) */
export function levels(movements: Movement[], until?: string): Map<string, Level> {
  const out = new Map<string, Level>();
  for (const m of [...movements].sort(byTime)) {
    if (until && m.date > until) break;
    const cur = out.get(m.productId) ?? { qty: 0, avgCost: 0, value: 0 };
    let { qty, avgCost } = cur;
    if (m.qty > 0 && m.unitCost !== null) {
      // รับเข้าพร้อมต้นทุน → ถัวเฉลี่ยใหม่ (ถ้ายอดเดิมติดลบ ใช้ต้นทุนล่าสุด)
      avgCost = qty > 0 ? r4((qty * avgCost + m.qty * m.unitCost) / (qty + m.qty)) : m.unitCost;
    }
    qty = r4(qty + m.qty);
    out.set(m.productId, { qty, avgCost, value: r2(Math.max(0, qty) * avgCost) });
  }
  return out;
}

export const levelOf = (lv: Map<string, Level>, id: string): Level => lv.get(id) ?? { qty: 0, avgCost: 0, value: 0 };

/** จำนวนที่สั่งไปแล้วแต่ยังไม่ได้รับ */
export function onOrder(pos: PurchaseOrder[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const po of pos) {
    if (po.status !== "ordered" && po.status !== "partial") continue;
    for (const l of po.lines) out.set(l.productId, r4((out.get(l.productId) ?? 0) + Math.max(0, l.qty - l.received)));
  }
  return out;
}

/** ใช้ไปเฉลี่ยวันละเท่าไร (นับเฉพาะเบิก/ขาย/เสียหาย ในช่วง n วันล่าสุด) */
export function dailyUsage(movements: Movement[], productId: string, today: string, days = 30): number {
  const from = addDays(today, -days + 1);
  const used = movements.filter((m) => m.productId === productId && m.type === "issue" && m.date >= from && m.date <= today).reduce((t, m) => t - m.qty, 0);
  return r4(used / days);
}

/** อยู่ได้อีกกี่วันด้วยอัตราใช้ปัจจุบัน (null = ไม่มีการใช้) */
export function daysOfCover(qty: number, usage: number): number | null {
  if (usage <= 0) return null;
  return Math.max(0, Math.floor(qty / usage));
}

export type StockState = "out" | "low" | "ok" | "inactive";
export function stockState(p: Product, qty: number): StockState {
  if (!p.active) return "inactive";
  if (qty <= 0) return "out";
  if (qty <= p.reorderPoint) return "low";
  return "ok";
}

export type Suggestion = { product: Product; qty: number; onHand: number; onOrder: number; suggest: number; unitCost: number };

/**
 * แนะนำการสั่งซื้อ: ถ้า (คงเหลือ + ที่สั่งค้าง) ≤ จุดสั่งซื้อ → สั่งให้กลับไปเกินจุดสั่งซื้อ
 * อย่างน้อยเท่ากับ "สั่งครั้งละ" (ปัดขึ้นเป็นทวีคูณของ reorderQty เพื่อให้ตรงกับหน่วยแพ็กที่ผู้ขายขาย)
 */
export function suggestions(products: Product[], lv: Map<string, Level>, pos: PurchaseOrder[]): Suggestion[] {
  const oo = onOrder(pos);
  const out: Suggestion[] = [];
  for (const p of products) {
    if (!p.active) continue;
    const onHand = levelOf(lv, p.id).qty;
    const ordered = oo.get(p.id) ?? 0;
    const position = onHand + ordered;
    if (position > p.reorderPoint) continue;
    const pack = Math.max(1, p.reorderQty);
    const need = p.reorderPoint - position + 1;
    const suggest = Math.max(pack, Math.ceil(need / pack) * pack);
    out.push({ product: p, qty: onHand, onHand, onOrder: ordered, suggest, unitCost: p.lastCost || levelOf(lv, p.id).avgCost });
  }
  return out.sort((a, b) => a.onHand + a.onOrder - a.product.reorderPoint - (b.onHand + b.onOrder - b.product.reorderPoint));
}

export function nextPoNumber(pos: PurchaseOrder[], date: string, prefix = "PO"): string {
  const head = `${prefix}-${date.slice(0, 7).replace("-", "")}-`;
  const max = pos.filter((p) => p.no.startsWith(head)).reduce((m, p) => Math.max(m, Number(p.no.slice(head.length)) || 0), 0);
  return `${head}${String(max + 1).padStart(3, "0")}`;
}

/** สร้างใบสั่งซื้อฉบับร่างจากรายการแนะนำ — แยกหนึ่งใบต่อผู้ขาย (สินค้าที่ไม่มีผู้ขายจะถูกข้าม) */
export function draftPOs(sugg: Suggestion[], pos: PurchaseOrder[], suppliers: Supplier[], date: string, makeId: () => string): PurchaseOrder[] {
  const groups = new Map<string, Suggestion[]>();
  for (const s of sugg) {
    if (!s.product.supplierId) continue;
    groups.set(s.product.supplierId, [...(groups.get(s.product.supplierId) ?? []), s]);
  }
  const out: PurchaseOrder[] = [];
  for (const [supplierId, list] of groups) {
    const sup = suppliers.find((x) => x.id === supplierId);
    out.push({
      id: makeId(),
      no: nextPoNumber([...pos, ...out], date),
      supplierId,
      date,
      expected: sup ? addDays(date, sup.leadDays) : null,
      status: "draft",
      lines: list.map((s) => ({ productId: s.product.id, qty: s.suggest, unitCost: r2(s.unitCost), received: 0 })),
      note: "",
    });
  }
  return out;
}

export function poTotal(po: PurchaseOrder): number {
  return r2(po.lines.reduce((t, l) => t + Math.round(l.qty * l.unitCost * 100) / 100, 0));
}

export function poProgress(po: PurchaseOrder) {
  const ordered = po.lines.reduce((t, l) => t + l.qty, 0);
  const received = po.lines.reduce((t, l) => t + l.received, 0);
  return { ordered, received, percent: ordered ? Math.round((received / ordered) * 100) : 0 };
}

const nextSeq = (movements: Movement[], date: string) => Math.max(0, ...movements.filter((m) => m.date === date).map((m) => m.seq)) + 1;

/**
 * รับสินค้าตาม PO (รับบางส่วนได้) — สร้างรายการรับเข้าพร้อมต้นทุนตาม PO และอัปเดตสถานะ
 * ห้ามรับเกินที่สั่ง, ห้ามรับ PO ที่ยังเป็นร่างหรือถูกยกเลิก
 */
export function receivePO(
  po: PurchaseOrder,
  receipts: Record<string, number>,
  date: string,
  movements: Movement[],
  makeId: () => string,
): { po: PurchaseOrder; moves: Movement[] } {
  if (po.status !== "ordered" && po.status !== "partial") throw new Error("รับได้เฉพาะใบสั่งซื้อที่ส่งแล้ว");
  const moves: Movement[] = [];
  let seq = nextSeq(movements, date);
  const lines = po.lines.map((l) => {
    const q = receipts[l.productId] ?? 0;
    if (q < 0) throw new Error("จำนวนรับต้องไม่ติดลบ");
    if (r4(l.received + q) > l.qty) throw new Error("รับเกินจำนวนที่สั่ง");
    if (q > 0) moves.push({ id: makeId(), date, seq: seq++, productId: l.productId, type: "receive", qty: q, unitCost: l.unitCost, reason: "purchase", ref: po.no });
    return { ...l, received: r4(l.received + q) };
  });
  if (!moves.length) throw new Error("ยังไม่ได้ใส่จำนวนที่รับ");
  const done = lines.every((l) => l.received >= l.qty);
  return { po: { ...po, lines, status: done ? "received" : "partial" }, moves };
}

/** ปิด PO ที่รับไม่ครบ (ผู้ขายส่งไม่ได้) — ยอดที่ค้างจะไม่นับเป็น "สั่งค้าง" อีก */
export function closePO(po: PurchaseOrder): PurchaseOrder {
  if (po.status !== "partial") return po;
  return { ...po, status: "received", lines: po.lines.map((l) => ({ ...l, qty: l.received })) };
}

/** เบิก/ขายออก — กันสต็อกติดลบ */
export function issue(movements: Movement[], productId: string, qty: number, date: string, reason: Reason, ref: string, id: string): Movement {
  if (!(qty > 0)) throw new Error("จำนวนต้องมากกว่า 0");
  const have = levelOf(levels(movements), productId).qty;
  if (qty > have) throw new Error(`สต็อกไม่พอ (เหลือ ${have})`);
  return { id, date, seq: nextSeq(movements, date), productId, type: "issue", qty: -qty, unitCost: null, reason, ref };
}

export function receive(movements: Movement[], productId: string, qty: number, unitCost: number, date: string, reason: Reason, ref: string, id: string): Movement {
  if (!(qty > 0)) throw new Error("จำนวนต้องมากกว่า 0");
  if (unitCost < 0) throw new Error("ต้นทุนต้องไม่ติดลบ");
  return { id, date, seq: nextSeq(movements, date), productId, type: reason === "opening" ? "opening" : "receive", qty, unitCost, reason, ref };
}

/** ตรวจนับสต็อก: สร้างรายการปรับยอดเฉพาะสินค้าที่นับได้ไม่ตรงระบบ */
export function stockCount(movements: Movement[], counted: Record<string, number>, date: string, makeId: () => string, ref = "ตรวจนับ"): Movement[] {
  const lv = levels(movements);
  let seq = nextSeq(movements, date);
  const out: Movement[] = [];
  for (const [productId, qty] of Object.entries(counted)) {
    if (!Number.isFinite(qty) || qty < 0) continue;
    const diff = r4(qty - levelOf(lv, productId).qty);
    if (diff !== 0) out.push({ id: makeId(), date, seq: seq++, productId, type: "adjust", qty: diff, unitCost: null, reason: "count", ref });
  }
  return out;
}

/** ประวัติของสินค้าหนึ่งตัวพร้อมยอดคงเหลือสะสม (ใหม่สุดก่อน) */
export function ledger(movements: Movement[], productId: string) {
  let bal = 0;
  return movements
    .filter((m) => m.productId === productId)
    .sort(byTime)
    .map((m) => ({ ...m, balance: (bal = r4(bal + m.qty)) }))
    .reverse();
}

export function inventorySummary(products: Product[], movements: Movement[], pos: PurchaseOrder[], today: string) {
  const lv = levels(movements);
  const active = products.filter((p) => p.active);
  const month = today.slice(0, 7);
  const monthMoves = movements.filter((m) => m.date.startsWith(month));
  // ต้นทุนของที่เบิกออก ใช้ต้นทุนเฉลี่ย ณ วันที่เบิก
  const costOfIssues = monthMoves
    .filter((m) => m.type === "issue")
    .reduce((t, m) => t + -m.qty * levelOf(levels(movements.filter((x) => byTime(x, m) < 0)), m.productId).avgCost, 0);
  return {
    skus: active.length,
    value: r2(active.reduce((t, p) => t + levelOf(lv, p.id).value, 0)),
    low: active.filter((p) => stockState(p, levelOf(lv, p.id).qty) === "low").length,
    out: active.filter((p) => stockState(p, levelOf(lv, p.id).qty) === "out").length,
    openPOs: pos.filter((p) => p.status === "ordered" || p.status === "partial").length,
    openPOValue: r2(pos.filter((p) => p.status === "ordered" || p.status === "partial").reduce((t, p) => t + p.lines.reduce((s, l) => s + (l.qty - l.received) * l.unitCost, 0), 0)),
    received: r2(monthMoves.filter((m) => m.type === "receive").reduce((t, m) => t + m.qty * (m.unitCost ?? 0), 0)),
    issuedCost: r2(costOfIssues),
  };
}

/** ของที่ขาย/ใช้มากที่สุด n วันล่าสุด (มูลค่าตามต้นทุนเฉลี่ย) */
export function topMovers(products: Product[], movements: Movement[], today: string, days = 30, n = 5) {
  const from = addDays(today, -days + 1);
  const lv = levels(movements);
  const used = new Map<string, number>();
  for (const m of movements) if (m.type === "issue" && m.date >= from && m.date <= today) used.set(m.productId, (used.get(m.productId) ?? 0) - m.qty);
  return [...used.entries()]
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id)!, qty: r4(qty), value: r2(qty * levelOf(lv, id).avgCost) }))
    .filter((x) => x.product)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function stockCsv(products: Product[], movements: Movement[]): string {
  const lv = levels(movements);
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ["sku", "name", "category", "unit", "qty", "avg_cost", "value", "reorder_point", "status"];
  const rows = products.map((p) => {
    const l = levelOf(lv, p.id);
    return [p.sku, p.name, p.category, p.unit, l.qty, l.avgCost, l.value, p.reorderPoint, stockState(p, l.qty)].map(esc).join(",");
  });
  return "﻿" + [head.join(","), ...rows].join("\n");
}
