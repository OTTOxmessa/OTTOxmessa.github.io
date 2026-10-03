import { eq } from "drizzle-orm";
import { z } from "zod";
import { customers, documentLines, documents, items, organizations, payments } from "../db/schema";
import { conflict } from "../lib/errors";
import { bumpSequence, computeTotals, toSatang, type Tx } from "./billing";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().max(max).default("");
const snapshotSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: text(20),
  branch: text(60),
  address: text(500),
  phone: text(40),
  email: text(254),
});

/** รูปแบบไฟล์สำรองของแอปหน้าเว็บ (หน่วยบาท, id เดิมเป็นข้อความอะไรก็ได้) */
export const importBody = z.object({
  biz: z.record(z.string(), z.unknown()).optional(),
  customers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200),
        taxId: z.string().max(20).default(""),
        branch: z.string().max(60).default(""),
        address: z.string().max(500).default(""),
        phone: z.string().max(40).default(""),
        email: z.string().max(254).default(""),
      }),
    )
    .max(5000),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200),
        unit: z.string().max(30).default(""),
        price: z.number().min(0),
      }),
    )
    .max(5000),
  docs: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["QT", "INV", "RC"]),
        no: z.string().min(1).max(40),
        date: isoDate,
        due: isoDate.nullable(),
        customerId: z.string().default(""),
        customer: snapshotSchema,
        lines: z
          .array(
            z.object({
              description: z.string().max(300),
              qty: z.number().positive(),
              unit: z.string().max(30).default(""),
              price: z.number().min(0),
            }),
          )
          .max(200),
        discount: z.number().min(0),
        vatMode: z.enum(["none", "exclusive", "inclusive"]),
        whtRate: z.number().int(),
        note: z.string().max(2000).default(""),
        refId: z.string().nullable(),
        quoteStatus: z.enum(["draft", "sent", "accepted", "rejected"]),
        voided: z.boolean(),
        adjust: z.number().optional(),
        payments: z.array(
          z.object({
            id: z.string(),
            date: isoDate,
            amount: z.number().positive(),
            method: z.enum(["transfer", "promptpay", "cash", "cheque"]),
            note: z.string().max(300).default(""),
            receiptId: z.string().nullable(),
          }),
        ),
      }),
    )
    .max(5000),
});

export type Backup = z.output<typeof importBody>;

/**
 * นำเข้าข้อมูลทั้งชุดเข้าร้านที่ยังว่าง — ใช้ทั้ง POST /import และบัญชีทดลอง
 * เลขที่เอกสารคงเดิม และดันตัวนับให้เลขถัดไปต่อจากของเดิม
 */
export async function importBackup(tx: Tx, orgId: string, userId: string, b: Backup) {
  const [has] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.orgId, orgId))
    .limit(1);
  if (has)
    throw conflict("ร้านนี้มีเอกสารอยู่แล้ว — นำเข้าได้เฉพาะร้านที่ยังว่าง เพื่อไม่ให้ข้อมูลซ้ำ");
  if (b.biz) {
    const allowed = [
      "name",
      "taxId",
      "branch",
      "address",
      "phone",
      "email",
      "promptpay",
      "vatRegistered",
      "signer",
      "dueDays",
      "validDays",
      "prefixes",
    ];
    const patch = Object.fromEntries(Object.entries(b.biz).filter(([k]) => allowed.includes(k)));
    if (Object.keys(patch).length)
      await tx.update(organizations).set(patch).where(eq(organizations.id, orgId));
  }
  const custMap = new Map<string, string>();
  for (const c of b.customers) {
    const [row] = await tx
      .insert(customers)
      .values({
        orgId,
        name: c.name,
        taxId: c.taxId,
        branch: c.branch,
        address: c.address,
        phone: c.phone,
        email: c.email,
      })
      .returning({ id: customers.id });
    custMap.set(c.id, row!.id);
  }
  if (b.items.length)
    await tx.insert(items).values(
      b.items.map((i) => ({
        orgId,
        name: i.name,
        unit: i.unit,
        priceSatang: toSatang(i.price),
      })),
    );
  const docMap = new Map<string, string>();
  for (const d of b.docs) docMap.set(d.id, crypto.randomUUID());
  const seen = new Set<string>();
  for (const d of b.docs) {
    const key = `${d.type}|${d.no}`;
    if (seen.has(key)) throw conflict(`เลขที่เอกสารซ้ำในไฟล์: ${d.no}`);
    seen.add(key);
    const lines = d.lines.map((l) => ({
      description: l.description || "-",
      qty: l.qty,
      unit: l.unit,
      priceSatang: toSatang(l.price),
    }));
    const wht = [0, 1, 2, 3, 5].includes(d.whtRate) ? d.whtRate : 0;
    const adjust = toSatang(d.adjust ?? 0);
    const t = computeTotals(lines, toSatang(d.discount), d.vatMode, wht, adjust);
    await tx.insert(documents).values({
      id: docMap.get(d.id)!,
      orgId,
      type: d.type,
      no: d.no,
      date: d.date,
      due: d.due && d.due >= d.date ? d.due : null,
      customerId: custMap.get(d.customerId) ?? null,
      customer: d.customer,
      discountSatang: toSatang(d.discount),
      vatMode: d.vatMode,
      whtRate: wht,
      adjustSatang: adjust,
      note: d.note,
      totalSatang: t.total,
      netSatang: t.net,
      quoteStatus: d.quoteStatus,
      voidedAt: d.voided ? new Date() : null,
      createdBy: userId,
    });
    if (lines.length) await insertLines(tx, docMap.get(d.id)!, lines);
    const m = /^(.+)-(\d{6})-(\d+)$/.exec(d.no);
    if (m) await bumpSequence(tx, orgId, d.type, m[2]!, Number(m[3]));
  }
  for (const d of b.docs) {
    if (d.refId && docMap.has(d.refId))
      await tx
        .update(documents)
        .set({ refId: docMap.get(d.refId)! })
        .where(eq(documents.id, docMap.get(d.id)!));
    for (const p of d.payments) {
      await tx.insert(payments).values({
        orgId,
        documentId: docMap.get(d.id)!,
        date: p.date,
        amountSatang: toSatang(p.amount),
        method: p.method,
        note: p.note,
        receiptId: p.receiptId ? (docMap.get(p.receiptId) ?? null) : null,
        createdBy: userId,
      });
    }
  }
  return { customers: b.customers.length, items: b.items.length, docs: b.docs.length };
}

async function insertLines(
  tx: Tx,
  documentId: string,
  lines: { description: string; qty: number; unit: string; priceSatang: number }[],
) {
  await tx
    .insert(documentLines)
    .values(lines.map((l, i) => ({ documentId, position: i + 1, ...l })));
}
