/**
 * ตัวกลางระหว่างฐานข้อมูล (สตางค์, แถวในตาราง) กับ logic ใน @portfolio/tools/billing (บาท, object Doc)
 * — ใช้ logic ชุดเดียวกับหน้าเว็บ ยอดเงินจึงตรงกันทุกสตางค์ทั้งสองฝั่ง
 */
import * as billing from "@portfolio/tools/billing";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  documentLines,
  documents,
  numberSequences,
  organizations,
  payments,
  type CustomerSnapshot,
} from "../db/schema";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

export const toSatang = (baht: number) => Math.round(baht * 100);
export const toBaht = (satang: number) => satang / 100;

/** วันนี้ตามเวลาประเทศไทย (YYYY-MM-DD) — ใช้ตัดสินว่าเลยกำหนดชำระหรือยัง */
export function bangkokToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type LineInput = { description: string; qty: number; unit: string; priceSatang: number };

/** คำนวณยอดด้วย logic ร่วม แล้วแปลงกลับเป็นสตางค์ */
export function computeTotals(
  lines: LineInput[],
  discountSatang: number,
  vatMode: billing.VatMode,
  whtRate: number,
  adjustSatang = 0,
) {
  const t = billing.calc(
    lines.map((l, i) => ({
      id: String(i),
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      price: toBaht(l.priceSatang),
    })),
    toBaht(discountSatang),
    vatMode,
    whtRate,
  );
  return {
    subtotal: toSatang(t.subtotal),
    discount: toSatang(t.discount),
    base: toSatang(t.base),
    vat: toSatang(t.vat),
    total: toSatang(t.total),
    wht: toSatang(t.wht),
    adjust: adjustSatang,
    net: toSatang(t.net) + adjustSatang,
  };
}

/**
 * ออกเลขที่เอกสารถัดไปแบบ atomic: INSERT … ON CONFLICT DO UPDATE SET last = last + 1 RETURNING last
 * แถวตัวนับถูกล็อกจนจบ transaction — สร้างพร้อมกันกี่คำขอก็ได้เลขไม่ซ้ำและไม่ข้าม
 */
export async function nextDocNumber(
  tx: DbLike,
  orgId: string,
  type: billing.DocType,
  date: string,
) {
  const period = date.slice(0, 7).replace("-", "");
  const [org] = await tx
    .select({ prefixes: organizations.prefixes })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const [seq] = await tx
    .insert(numberSequences)
    .values({ orgId, type, period, last: 1 })
    .onConflictDoUpdate({
      target: [numberSequences.orgId, numberSequences.type, numberSequences.period],
      set: { last: sql`${numberSequences.last} + 1` },
    })
    .returning({ last: numberSequences.last });
  return `${org!.prefixes[type]}-${period}-${String(seq!.last).padStart(3, "0")}`;
}

/** ดันตัวนับให้ไม่ต่ำกว่าเลขที่มีอยู่แล้ว (ใช้ตอนนำเข้าข้อมูลเก่า) */
export async function bumpSequence(
  tx: DbLike,
  orgId: string,
  type: billing.DocType,
  period: string,
  atLeast: number,
) {
  await tx
    .insert(numberSequences)
    .values({ orgId, type, period, last: atLeast })
    .onConflictDoUpdate({
      target: [numberSequences.orgId, numberSequences.type, numberSequences.period],
      set: { last: sql`greatest(${numberSequences.last}, ${atLeast})` },
    });
}

type DocRow = typeof documents.$inferSelect;
type LineRow = typeof documentLines.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

/** แถวในฐานข้อมูล → Doc ของ logic ร่วม (หน่วยบาท) */
export function toToolsDoc(d: DocRow, lines: LineRow[], pays: PaymentRow[]): billing.Doc {
  return {
    id: d.id,
    type: d.type,
    no: d.no,
    date: d.date,
    due: d.due,
    customerId: d.customerId ?? "",
    customer: d.customer,
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      price: toBaht(l.priceSatang),
    })),
    discount: toBaht(d.discountSatang),
    vatMode: d.vatMode,
    whtRate: d.whtRate,
    note: d.note,
    refId: d.refId,
    quoteStatus: d.quoteStatus,
    payments: pays.map((p) => ({
      id: p.id,
      date: p.date,
      amount: toBaht(p.amountSatang),
      method: p.method,
      note: p.note,
      receiptId: p.receiptId,
    })),
    voided: d.voidedAt !== null,
    adjust: toBaht(d.adjustSatang),
  };
}

/** โหลดเอกสาร (พร้อมรายการและการรับชำระ) ตาม id — ใช้ร่วมทั้ง list, detail, snapshot */
export async function loadDocs(db: DbLike, orgId: string, where?: ReturnType<typeof eq>) {
  const rows = await db
    .select()
    .from(documents)
    .where(where ? and(eq(documents.orgId, orgId), where) : eq(documents.orgId, orgId))
    .orderBy(asc(documents.date), asc(documents.no));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [lines, pays] = await Promise.all([
    db
      .select()
      .from(documentLines)
      .where(inArray(documentLines.documentId, ids))
      .orderBy(asc(documentLines.position)),
    db
      .select()
      .from(payments)
      .where(inArray(payments.documentId, ids))
      .orderBy(asc(payments.date), asc(payments.createdAt)),
  ]);
  const byDoc = <T extends { documentId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.documentId, [...(m.get(x.documentId) ?? []), x]);
    return m;
  };
  const L = byDoc(lines);
  const P = byDoc(pays);
  return rows.map((r) => ({ row: r, doc: toToolsDoc(r, L.get(r.id) ?? [], P.get(r.id) ?? []) }));
}

/** รูปแบบที่ API ส่งให้ client: เงินเป็นสตางค์ + สถานะและยอดค้างที่คำนวณแล้ว */
export function presentDoc(
  row: DocRow,
  doc: billing.Doc,
  today: string,
  children: { id: string; type: string; no: string; voided: boolean }[] = [],
) {
  const t = billing.totalsOf(doc);
  const status = doc.voided
    ? "void"
    : doc.type === "INV"
      ? billing.invoiceStatus(doc, today)
      : doc.type === "QT"
        ? doc.quoteStatus !== "accepted" &&
          doc.quoteStatus !== "rejected" &&
          doc.due &&
          doc.due < today
          ? "expired"
          : doc.quoteStatus
        : "issued";
  return {
    id: row.id,
    type: row.type,
    no: row.no,
    date: row.date,
    due: row.due,
    customerId: row.customerId,
    customer: row.customer as CustomerSnapshot,
    lines: doc.lines.map((l, i) => ({
      id: l.id,
      position: i + 1,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      priceSatang: toSatang(l.price),
    })),
    discountSatang: row.discountSatang,
    vatMode: row.vatMode,
    whtRate: row.whtRate,
    note: row.note,
    refId: row.refId,
    quoteStatus: row.quoteStatus,
    voided: doc.voided,
    status,
    totals: {
      subtotal: toSatang(t.subtotal),
      discount: toSatang(t.discount),
      base: toSatang(t.base),
      vat: toSatang(t.vat),
      total: toSatang(t.total),
      wht: toSatang(t.wht),
      adjust: toSatang(t.adjust),
      net: toSatang(t.net),
    },
    paidSatang: row.type === "INV" ? toSatang(billing.paidAmount(doc)) : 0,
    balanceSatang:
      row.type === "INV" && !doc.voided ? Math.max(0, toSatang(billing.balance(doc))) : 0,
    payments: doc.payments.map((p) => ({
      id: p.id,
      date: p.date,
      amountSatang: toSatang(p.amount),
      method: p.method,
      note: p.note,
      receiptId: p.receiptId,
    })),
    children,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
