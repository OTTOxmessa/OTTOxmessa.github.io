/**
 * ระบบใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ สำหรับธุรกิจขนาดเล็ก
 * - เงินคำนวณเป็นสตางค์ (จำนวนเต็ม) ทั้งหมด
 * - VAT 7% แบบแยกนอก (exclusive) / รวมใน (inclusive) / ไม่มี VAT
 * - หัก ณ ที่จ่าย คิดจากยอดก่อน VAT (ตามหลักสรรพากร)
 */
import { isValidThaiId } from "./promptpay";

export type DocType = "QT" | "INV" | "RC";
export type VatMode = "none" | "exclusive" | "inclusive";
export type Customer = { id: string; name: string; taxId: string; branch: string; address: string; phone: string; email: string };
export type CatalogItem = { id: string; name: string; unit: string; price: number };
export type Line = { id: string; description: string; qty: number; unit: string; price: number };
export type Payment = { id: string; date: string; amount: number; method: "transfer" | "cash" | "cheque" | "promptpay"; note: string; receiptId: string | null };
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";
export type Doc = {
  id: string;
  type: DocType;
  no: string;
  date: string; // YYYY-MM-DD
  due: string | null; // INV: วันครบกำหนด, QT: ยืนราคาถึง
  customerId: string;
  customer: Omit<Customer, "id">; // snapshot ตอนออกเอกสาร — แก้ข้อมูลลูกค้าภายหลังไม่กระทบเอกสารเก่า
  lines: Line[];
  discount: number; // บาท
  vatMode: VatMode;
  whtRate: number; // % 0,1,2,3,5
  note: string;
  refId: string | null; // เอกสารต้นทาง (QT → INV → RC)
  quoteStatus: QuoteStatus; // ใช้กับ QT
  payments: Payment[]; // ใช้กับ INV
  voided: boolean;
  /** ปัดเศษสตางค์บนใบเสร็จรับชำระบางส่วน ให้ยอดสุทธิตรงกับเงินที่รับจริง */
  adjust?: number;
};
export type Business = {
  name: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  promptpay: string;
  vatRegistered: boolean;
  signer: string;
  dueDays: number;
  validDays: number;
  prefixes: Record<DocType, string>;
};

export const VAT_RATE = 7;
export const WHT_RATES = [0, 1, 2, 3, 5] as const;

const s = (b: number) => Math.round(b * 100);
const b = (x: number) => x / 100;

export function lineAmount(l: Line): number {
  return b(Math.round(l.qty * s(l.price)));
}

export type Totals = {
  subtotal: number; // รวมรายการ
  discount: number;
  afterDiscount: number;
  base: number; // มูลค่าก่อน VAT
  vat: number;
  total: number; // รวมทั้งสิ้น (รวม VAT)
  wht: number; // หัก ณ ที่จ่าย
  net: number; // ยอดที่ลูกค้าต้องจ่ายจริง
};

export function calc(lines: Line[], discount: number, vatMode: VatMode, whtRate: number): Totals {
  const subtotal = lines.reduce((t, l) => t + Math.round(l.qty * s(l.price)), 0);
  const disc = Math.min(Math.max(0, s(discount)), subtotal);
  const after = subtotal - disc;
  let base = after;
  let vat = 0;
  let total = after;
  if (vatMode === "exclusive") {
    vat = Math.round((base * VAT_RATE) / 100);
    total = base + vat;
  } else if (vatMode === "inclusive") {
    base = Math.round((after * 100) / (100 + VAT_RATE));
    vat = after - base;
  }
  const wht = Math.round((base * Math.max(0, whtRate)) / 100);
  return { subtotal: b(subtotal), discount: b(disc), afterDiscount: b(after), base: b(base), vat: b(vat), total: b(total), wht: b(wht), net: b(total - wht) };
}

export function totalsOf(d: Doc): Totals & { adjust: number } {
  const t = calc(d.lines, d.discount, d.vatMode, d.whtRate);
  const adjust = d.adjust ?? 0;
  return { ...t, adjust, net: b(s(t.net) + s(adjust)) };
}

/** เลขที่เอกสารแบบ PREFIX-YYYYMM-001 เริ่มนับใหม่ทุกเดือน แยกตามประเภท */
export function nextNumber(docs: Doc[], type: DocType, prefix: string, date: string): string {
  const ym = date.slice(0, 7).replace("-", "");
  const head = `${prefix}-${ym}-`;
  const max = docs
    .filter((d) => d.type === type && d.no.startsWith(head))
    .reduce((m, d) => Math.max(m, Number(d.no.slice(head.length)) || 0), 0);
  return `${head}${String(max + 1).padStart(3, "0")}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b2: string): number {
  const t = (x: string) => {
    const [y, m, d] = x.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b2) - t(a)) / 86_400_000);
}

export function snapshot(c: Customer): Omit<Customer, "id"> {
  return { name: c.name, taxId: c.taxId, branch: c.branch, address: c.address, phone: c.phone, email: c.email };
}

export function blankDoc(type: DocType, docs: Doc[], biz: Business, customer: Customer | null, date: string, id: string): Doc {
  return {
    id,
    type,
    no: nextNumber(docs, type, biz.prefixes[type], date),
    date,
    due: type === "INV" ? addDays(date, biz.dueDays) : type === "QT" ? addDays(date, biz.validDays) : null,
    customerId: customer?.id ?? "",
    customer: customer ? snapshot(customer) : { name: "", taxId: "", branch: "", address: "", phone: "", email: "" },
    lines: [],
    discount: 0,
    vatMode: biz.vatRegistered ? "exclusive" : "none",
    whtRate: 0,
    note: "",
    refId: null,
    quoteStatus: "draft",
    payments: [],
    voided: false,
  };
}

/** แปลงใบเสนอราคาเป็นใบแจ้งหนี้ (คัดลอกรายการ เงื่อนไข และอ้างอิงเลขที่เดิม) */
export function quoteToInvoice(quote: Doc, docs: Doc[], biz: Business, date: string, id: string, lineId: () => string): Doc {
  if (quote.type !== "QT") throw new Error("ต้องเป็นใบเสนอราคา");
  return {
    ...quote,
    id,
    type: "INV",
    no: nextNumber(docs, "INV", biz.prefixes.INV, date),
    date,
    due: addDays(date, biz.dueDays),
    lines: quote.lines.map((l) => ({ ...l, id: lineId() })),
    refId: quote.id,
    quoteStatus: "draft",
    payments: [],
    voided: false,
  };
}

export function paidAmount(inv: Doc): number {
  return b(inv.payments.reduce((t, p) => t + s(p.amount), 0));
}

export function balance(inv: Doc): number {
  return b(s(totalsOf(inv).net) - s(paidAmount(inv)));
}

export type InvoiceStatus = "void" | "paid" | "partial" | "overdue" | "unpaid";

export function invoiceStatus(inv: Doc, today: string): InvoiceStatus {
  if (inv.voided) return "void";
  const bal = balance(inv);
  if (bal <= 0) return "paid";
  if (inv.due && inv.due < today) return "overdue";
  return paidAmount(inv) > 0 ? "partial" : "unpaid";
}

/**
 * รับชำระเงิน — ห้ามรับเกินยอดค้าง
 * ถ้าต้องการใบเสร็จ จะคืนใบเสร็จ (RC) ที่อ้างอิงใบแจ้งหนี้ พร้อมยอดเท่าที่รับจริง
 */
export function receivePayment(
  docs: Doc[],
  invId: string,
  pay: Omit<Payment, "id" | "receiptId">,
  biz: Business,
  ids: { payment: string; receipt: string | null; line: () => string },
): { docs: Doc[]; receipt: Doc | null } {
  const inv = docs.find((d) => d.id === invId && d.type === "INV");
  if (!inv) throw new Error("ไม่พบใบแจ้งหนี้");
  if (inv.voided) throw new Error("ใบแจ้งหนี้ถูกยกเลิกแล้ว");
  if (!(pay.amount > 0)) throw new Error("ยอดรับชำระต้องมากกว่า 0");
  const bal = balance(inv);
  if (s(pay.amount) > s(bal)) throw new Error("รับชำระเกินยอดค้าง");

  let receipt: Doc | null = null;
  if (ids.receipt) {
    const t = totalsOf(inv);
    const part = partialPrice(pay.amount, inv);
    const full = s(pay.amount) === s(t.net) && inv.payments.length === 0;
    receipt = {
      ...inv,
      id: ids.receipt,
      type: "RC",
      no: nextNumber(docs, "RC", biz.prefixes.RC, pay.date),
      date: pay.date,
      due: null,
      refId: inv.id,
      payments: [],
      // จ่ายเต็มจำนวน → ใช้รายการเดิม, จ่ายบางส่วน → รายการเดียว "รับชำระบางส่วน"
      lines: full
        ? inv.lines.map((l) => ({ ...l, id: ids.line() }))
        : [{ id: ids.line(), description: `รับชำระบางส่วนตามใบแจ้งหนี้ ${inv.no}`, qty: 1, unit: "งวด", price: part.price }],
      discount: full ? inv.discount : 0,
      adjust: full ? 0 : part.adjust,
      note: pay.note,
    };
  }
  const payment: Payment = { ...pay, id: ids.payment, receiptId: receipt?.id ?? null };
  const next = docs.map((d) => (d.id === inv.id ? { ...d, payments: [...d.payments, payment] } : d));
  return { docs: receipt ? [...next, receipt] : next, receipt };
}

/**
 * แปลงยอดที่รับจริง (หลังหัก ณ ที่จ่าย) กลับเป็นมูลค่าก่อน VAT สำหรับใบเสร็จ
 * VAT/หัก ณ ที่จ่ายถูกปัดเป็นสตางค์ บางยอดจึงหาราคาที่ให้ผลตรงเป๊ะไม่ได้ → ใส่ “ปัดเศษ” ไม่เกิน ±1 สตางค์
 */
function partialPrice(received: number, inv: Doc): { price: number; adjust: number } {
  const vatK = inv.vatMode === "exclusive" ? 1 + VAT_RATE / 100 : 1;
  const baseShare = inv.vatMode === "inclusive" ? 100 / (100 + VAT_RATE) : 1;
  const k = vatK - (inv.whtRate / 100) * baseShare;
  const guess = Math.round((received / k) * 100);
  // ปัดเศษอาจคลาด 1–2 สตางค์ → ลองค่าข้างเคียงให้ยอดสุทธิบนใบเสร็จตรงกับที่รับจริง
  for (const delta of [0, -1, 1, -2, 2]) {
    const price = (guess + delta) / 100;
    const t = calc([{ id: "", description: "", qty: 1, unit: "", price }], 0, inv.vatMode, inv.whtRate);
    if (s(t.net) === s(received)) return { price, adjust: 0 };
  }
  const price = guess / 100;
  const t = calc([{ id: "", description: "", qty: 1, unit: "", price }], 0, inv.vatMode, inv.whtRate);
  return { price, adjust: b(s(received) - s(t.net)) };
}

export type Aging = { current: number; d30: number; d60: number; d90: number; over90: number; total: number };

/** อายุลูกหนี้: ยอดค้างแยกตามจำนวนวันที่เลยกำหนด */
export function aging(docs: Doc[], today: string): Aging {
  const a = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, total: 0 };
  for (const d of docs) {
    if (d.type !== "INV" || d.voided) continue;
    const bal = s(balance(d));
    if (bal <= 0) continue;
    const late = d.due ? daysBetween(d.due, today) : 0;
    const key = late <= 0 ? "current" : late <= 30 ? "d30" : late <= 60 ? "d60" : late <= 90 ? "d90" : "over90";
    a[key] += bal;
    a.total += bal;
  }
  return { current: b(a.current), d30: b(a.d30), d60: b(a.d60), d90: b(a.d90), over90: b(a.over90), total: b(a.total) };
}

export function monthSummary(docs: Doc[], month: string) {
  const inv = docs.filter((d) => d.type === "INV" && !d.voided && d.date.startsWith(month));
  const qt = docs.filter((d) => d.type === "QT" && !d.voided && d.date.startsWith(month));
  const sum = (list: Doc[], k: keyof Totals) => b(list.reduce((t, d) => t + s(totalsOf(d)[k]), 0));
  const payments = docs.filter((d) => d.type === "INV" && !d.voided).flatMap((d) => d.payments.filter((p) => p.date.startsWith(month)));
  const decided = qt.filter((q) => q.quoteStatus === "accepted" || q.quoteStatus === "rejected");
  return {
    invoiced: sum(inv, "total"),
    invoiceCount: inv.length,
    vat: sum(inv, "vat"),
    wht: sum(inv, "wht"),
    collected: b(payments.reduce((t, p) => t + s(p.amount), 0)),
    quoted: sum(qt, "total"),
    quoteCount: qt.length,
    winRate: decided.length ? Math.round((decided.filter((q) => q.quoteStatus === "accepted").length / decided.length) * 100) : null,
  };
}

export function topCustomers(docs: Doc[], n = 5) {
  const m = new Map<string, { name: string; total: number; outstanding: number }>();
  for (const d of docs) {
    if (d.type !== "INV" || d.voided) continue;
    const cur = m.get(d.customerId) ?? { name: d.customer.name, total: 0, outstanding: 0 };
    cur.total = b(s(cur.total) + s(totalsOf(d).total));
    cur.outstanding = b(s(cur.outstanding) + Math.max(0, s(balance(d))));
    m.set(d.customerId, cur);
  }
  return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((x, y) => y.total - x.total).slice(0, n);
}

/** รายการเคลื่อนไหวของลูกค้า: ใบแจ้งหนี้ (+) และรับชำระ (−) พร้อมยอดคงค้างสะสม */
export function statement(docs: Doc[], customerId: string) {
  const rows: { date: string; ref: string; label: string; debit: number; credit: number }[] = [];
  for (const d of docs) {
    if (d.type !== "INV" || d.voided || d.customerId !== customerId) continue;
    rows.push({ date: d.date, ref: d.no, label: "ใบแจ้งหนี้", debit: totalsOf(d).net, credit: 0 });
    for (const p of d.payments) rows.push({ date: p.date, ref: d.no, label: "รับชำระ", debit: 0, credit: p.amount });
  }
  rows.sort((a, b2) => (a.date < b2.date ? -1 : a.date > b2.date ? 1 : b2.debit - a.debit));
  let run = 0;
  return rows.map((r) => {
    run += s(r.debit) - s(r.credit);
    return { ...r, balance: b(run) };
  });
}

/** ตรวจเลขผู้เสียภาษี 13 หลัก (checksum เดียวกับเลขบัตรประชาชน) — เว้นว่างได้ */
export function taxIdError(taxId: string): string | null {
  const t = taxId.replace(/\D/g, "");
  if (!t) return null;
  if (t.length !== 13) return "เลขผู้เสียภาษีต้องมี 13 หลัก";
  return isValidThaiId(t) ? null : "เลขผู้เสียภาษีไม่ถูกต้อง (checksum)";
}

export function docsCsv(docs: Doc[], today: string): string {
  const esc = (v: string | number) => {
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = ["type", "no", "date", "due", "customer", "tax_id", "base", "vat", "total", "wht", "net", "paid", "balance", "status"];
  const rows = docs.map((d) => {
    const t = totalsOf(d);
    const st = d.type === "INV" ? invoiceStatus(d, today) : d.type === "QT" ? d.quoteStatus : d.voided ? "void" : "issued";
    return [d.type, d.no, d.date, d.due ?? "", d.customer.name, d.customer.taxId, t.base, t.vat, t.total, t.wht, t.net, d.type === "INV" ? paidAmount(d) : "", d.type === "INV" ? balance(d) : "", st].map(esc).join(",");
  });
  return "﻿" + [head.join(","), ...rows].join("\n");
}
