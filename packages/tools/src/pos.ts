/**
 * ระบบขายหน้าร้าน (POS) — logic ล้วน ไม่ผูกกับ UI
 * ใช้หน่วยสตางค์ภายในเพื่อเลี่ยงปัญหาทศนิยมของ floating point
 */
export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number | null; // null = ไม่นับสต็อก (เช่น เครื่องดื่มชงสด)
  lowStock: number;
};
export type CartLine = { productId: string; name: string; price: number; qty: number };
export type Discount = { type: "amount" | "percent"; value: number };
export type Method = "cash" | "promptpay";
export type Sale = {
  id: string;
  no: number;
  at: string; // ISO datetime
  lines: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  method: Method;
  received: number | null;
  change: number | null;
  voided: boolean;
};

const s = (b: number) => Math.round(b * 100);
const b = (x: number) => x / 100;

export function addToCart(cart: CartLine[], p: Product, qty = 1): CartLine[] {
  const i = cart.findIndex((l) => l.productId === p.id);
  if (i === -1) return [...cart, { productId: p.id, name: p.name, price: p.price, qty }];
  return cart.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
}

export function setQty(cart: CartLine[], productId: string, qty: number): CartLine[] {
  if (qty <= 0) return cart.filter((l) => l.productId !== productId);
  return cart.map((l) => (l.productId === productId ? { ...l, qty } : l));
}

export function totals(cart: CartLine[], discount: Discount = { type: "amount", value: 0 }) {
  const subtotal = cart.reduce((t, l) => t + s(l.price) * l.qty, 0);
  let d = discount.type === "percent" ? Math.round((subtotal * Math.min(100, Math.max(0, discount.value))) / 100) : s(Math.max(0, discount.value));
  d = Math.min(d, subtotal);
  return { subtotal: b(subtotal), discount: b(d), total: b(subtotal - d), items: cart.reduce((t, l) => t + l.qty, 0) };
}

/** ปุ่มรับเงินสดด่วน: พอดี, และแบงก์/เหรียญที่ลูกค้ามักยื่นให้ */
export function quickCash(total: number): number[] {
  const out = new Set<number>([Math.ceil(total)]);
  for (const note of [20, 50, 100, 500, 1000]) {
    const v = Math.ceil(total / note) * note;
    if (v >= total) out.add(v);
  }
  return [...out].filter((v) => v > 0).sort((x, y) => x - y).slice(0, 5);
}

export function change(total: number, received: number): number | null {
  const c = s(received) - s(total);
  return c < 0 ? null : b(c);
}

/** ตรวจสต็อกก่อนขาย — คืนรายการที่มีไม่พอ */
export function stockProblems(products: Product[], cart: CartLine[]) {
  return cart
    .map((l) => {
      const p = products.find((x) => x.id === l.productId);
      return p && p.stock !== null && p.stock < l.qty ? { name: p.name, want: l.qty, have: p.stock } : null;
    })
    .filter((x): x is { name: string; want: number; have: number } => x !== null);
}

export function checkout(
  products: Product[],
  sales: Sale[],
  cart: CartLine[],
  discount: Discount,
  method: Method,
  received: number | null,
  id: string,
  at: Date,
): { products: Product[]; sale: Sale } {
  if (!cart.length) throw new Error("ตะกร้าว่าง");
  const t = totals(cart, discount);
  if (method === "cash" && (received === null || change(t.total, received) === null)) throw new Error("รับเงินไม่พอ");
  const sale: Sale = {
    id,
    no: (sales.reduce((m, x) => Math.max(m, x.no), 0) || 0) + 1,
    at: at.toISOString(),
    lines: cart.map((l) => ({ ...l })),
    subtotal: t.subtotal,
    discount: t.discount,
    total: t.total,
    method,
    received: method === "cash" ? received : null,
    change: method === "cash" ? change(t.total, received!) : null,
    voided: false,
  };
  return { products: adjustStock(products, cart, -1), sale };
}

function adjustStock(products: Product[], lines: CartLine[], sign: 1 | -1): Product[] {
  return products.map((p) => {
    if (p.stock === null) return p;
    const qty = lines.filter((l) => l.productId === p.id).reduce((t, l) => t + l.qty, 0);
    return qty ? { ...p, stock: p.stock + sign * qty } : p;
  });
}

/** ยกเลิกบิล: คืนสต็อก และทำเครื่องหมายว่ายกเลิก (ไม่ลบ เพื่อเก็บหลักฐาน) */
export function voidSale(products: Product[], sales: Sale[], saleId: string) {
  const sale = sales.find((x) => x.id === saleId);
  if (!sale || sale.voided) return { products, sales };
  return {
    products: adjustStock(products, sale.lines, 1),
    sales: sales.map((x) => (x.id === saleId ? { ...x, voided: true } : x)),
  };
}

export const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function daySummary(sales: Sale[], date: string) {
  const list = sales.filter((x) => !x.voided && localDate(x.at) === date);
  const hourly = Array.from({ length: 24 }, () => 0);
  const byProduct = new Map<string, { name: string; qty: number; amount: number }>();
  const byMethod: Record<Method, number> = { cash: 0, promptpay: 0 };
  let total = 0;
  for (const x of list) {
    total += s(x.total);
    byMethod[x.method] += s(x.total);
    hourly[new Date(x.at).getHours()]! += s(x.total);
    for (const l of x.lines) {
      const cur = byProduct.get(l.productId) ?? { name: l.name, qty: 0, amount: 0 };
      cur.qty += l.qty;
      cur.amount += s(l.price) * l.qty;
      byProduct.set(l.productId, cur);
    }
  }
  return {
    count: list.length,
    total: b(total),
    average: list.length ? b(Math.round(total / list.length)) : 0,
    byMethod: { cash: b(byMethod.cash), promptpay: b(byMethod.promptpay) },
    hourly: hourly.map(b),
    top: [...byProduct.values()].map((p) => ({ ...p, amount: b(p.amount) })).sort((x, y) => y.qty - x.qty || y.amount - x.amount),
    voided: sales.filter((x) => x.voided && localDate(x.at) === date).length,
  };
}

export function lowStock(products: Product[]) {
  return products.filter((p) => p.stock !== null && p.stock <= p.lowStock).sort((x, y) => (x.stock ?? 0) - (y.stock ?? 0));
}

export function salesCsv(sales: Sale[]): string {
  const rows = sales.flatMap((x) =>
    x.lines.map((l) => [x.no, x.at, x.voided ? "void" : "ok", x.method, `"${l.name.replace(/"/g, '""')}"`, l.qty, l.price, l.qty * l.price, x.discount, x.total].join(",")),
  );
  return "﻿" + ["no,datetime,status,method,item,qty,price,line_total,bill_discount,bill_total", ...rows].join("\r\n");
}
