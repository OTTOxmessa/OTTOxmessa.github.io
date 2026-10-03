import { createHash } from "node:crypto";
import * as billing from "@portfolio/tools/billing";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app";
import {
  customers,
  documentLines,
  documents,
  idempotencyKeys,
  items,
  organizations,
  payments,
} from "../db/schema";
import { audit } from "../lib/audit";
import { importBackup, importBody } from "../services/import";
import { badRequest, conflict, HttpError, notFound } from "../lib/errors";
import { requireAuth, requireOrg } from "../plugins/auth";
import {
  bangkokToday,
  computeTotals,
  type DbLike,
  loadDocs,
  nextDocNumber,
  presentDoc,
  toBaht,
  toSatang,
  type Tx,
} from "../services/billing";

/* ------------------------------------------------------------------ schemas */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD");
const satang = z.number().int().min(0).max(1e13);
const text = (max: number) => z.string().trim().max(max).default("");
const orgParams = z.object({ orgId: z.uuid() });
const idParams = z.object({ orgId: z.uuid(), id: z.uuid() });

const customerBody = z.object({
  name: z.string().trim().min(1, "ใส่ชื่อลูกค้า").max(200),
  taxId: text(20),
  branch: text(60),
  address: text(500),
  phone: text(40),
  email: text(254),
});
const snapshotSchema = customerBody;
const itemBody = z.object({
  name: z.string().trim().min(1).max(200),
  unit: text(30),
  priceSatang: satang.default(0),
});
const lineSchema = z.object({
  description: z.string().trim().min(1, "ทุกรายการต้องมีชื่อ").max(300),
  qty: z.number().positive("จำนวนต้องมากกว่า 0").max(1e6),
  unit: text(30),
  priceSatang: satang,
});

const docFields = {
  date: isoDate,
  due: isoDate.nullable().default(null),
  customerId: z.uuid().nullable().default(null),
  customer: snapshotSchema,
  lines: z.array(lineSchema).min(1, "ใส่อย่างน้อย 1 รายการ").max(200),
  discountSatang: satang.default(0),
  vatMode: z.enum(["none", "exclusive", "inclusive"]).default("none"),
  whtRate: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(5)])
    .default(0),
  note: text(2000),
};
const dueAfterDate = (d: { date?: string; due?: string | null }) =>
  !d.date || !d.due || d.due >= d.date;
const createDocBody = z
  .object({ type: z.enum(["QT", "INV"]), ...docFields })
  .refine(dueAfterDate, { message: "วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร", path: ["due"] });
const patchDocBody = z
  .object({ version: z.number().int().min(1), ...docFields })
  .partial({
    date: true,
    due: true,
    customerId: true,
    customer: true,
    lines: true,
    discountSatang: true,
    vatMode: true,
    whtRate: true,
    note: true,
  })
  .refine(dueAfterDate, { message: "วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร", path: ["due"] });
const paymentBody = z.object({
  date: isoDate,
  amountSatang: z.number().int().positive().max(1e13),
  method: z.enum(["transfer", "promptpay", "cash", "cheque"]),
  note: text(300),
  issueReceipt: z.boolean().default(true),
});

/* ------------------------------------------------------------------ helpers */

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function bizOf(o: typeof organizations.$inferSelect): billing.Business {
  return {
    name: o.name,
    taxId: o.taxId,
    branch: o.branch,
    address: o.address,
    phone: o.phone,
    email: o.email,
    promptpay: o.promptpay,
    vatRegistered: o.vatRegistered,
    signer: o.signer,
    dueDays: o.dueDays,
    validDays: o.validDays,
    prefixes: o.prefixes,
  };
}

function checkTaxId(taxId: string) {
  const err = billing.taxIdError(taxId);
  if (err) throw badRequest(err);
}

/** หา/สร้างลูกค้าจาก snapshot ถ้าไม่ได้เลือกลูกค้าเดิม (พฤติกรรมเดียวกับหน้าเว็บ) */
async function resolveCustomer(
  tx: Tx,
  orgId: string,
  customerId: string | null,
  snap: z.output<typeof snapshotSchema>,
) {
  if (customerId) {
    const [c] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)));
    if (!c) throw badRequest("ไม่พบลูกค้าที่เลือก");
    return customerId;
  }
  const [same] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.orgId, orgId), eq(customers.name, snap.name), isNull(customers.archivedAt)),
    );
  if (same) return same.id;
  const [created] = await tx
    .insert(customers)
    .values({ orgId, ...snap })
    .returning({ id: customers.id });
  return created!.id;
}

async function insertLines(tx: Tx, documentId: string, lines: z.output<typeof lineSchema>[]) {
  await tx.insert(documentLines).values(
    lines.map((l, i) => ({
      documentId,
      position: i + 1,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      priceSatang: l.priceSatang,
    })),
  );
}

async function lockDoc(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)))
    .for("update");
  if (!row) throw notFound("ไม่พบเอกสาร");
  return row;
}

async function getDoc(db: DbLike, orgId: string, id: string) {
  const [found] = await loadDocs(db, orgId, eq(documents.id, id));
  if (!found) throw notFound("ไม่พบเอกสาร");
  const children = await db
    .select({
      id: documents.id,
      type: documents.type,
      no: documents.no,
      voidedAt: documents.voidedAt,
    })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.refId, id)))
    .orderBy(asc(documents.createdAt));
  return presentDoc(
    found.row,
    found.doc,
    bangkokToday(),
    children.map((c) => ({ id: c.id, type: c.type, no: c.no, voided: c.voidedAt !== null })),
  );
}

/**
 * Idempotency-Key: คำขอเดิมส่งซ้ำ (กดสองที / เน็ตหลุดแล้ว retry) → ได้ผลลัพธ์เดิม ไม่ทำซ้ำ
 * ทำใน transaction เดียวกับงานจริง: บันทึก key → ทำงาน → เก็บผลลัพธ์ แล้ว commit พร้อมกัน
 * ถ้าสองคำขอใช้ key เดียวกันพร้อมกัน คำขอที่สองจะรอที่ unique index จนคำขอแรก commit แล้วได้ผลเดียวกัน
 */
async function idempotent<T>(
  tx: Tx,
  req: FastifyRequest,
  body: unknown,
  work: () => Promise<{ status: number; body: T }>,
) {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[\w-]{8,100}$/.test(key))
    throw badRequest("ต้องส่ง header Idempotency-Key (8–100 ตัวอักษร)");
  const requestHash = sha({ url: req.routeOptions.url, params: req.params, body });
  const inserted = await tx
    .insert(idempotencyKeys)
    .values({ orgId: req.org!.id, key, userId: req.userId, requestHash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (!inserted.length) {
    const [prev] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.orgId, req.org!.id), eq(idempotencyKeys.key, key)));
    if (prev!.requestHash !== requestHash)
      throw new HttpError(
        422,
        "idempotency_mismatch",
        "Idempotency-Key นี้ถูกใช้กับคำขออื่นไปแล้ว",
      );
    if (prev!.statusCode === null) throw conflict("คำขอเดียวกันกำลังทำงานอยู่ กรุณาลองใหม่");
    return { status: prev!.statusCode, body: prev!.response as T, replayed: true };
  }
  const result = await work();
  await tx
    .update(idempotencyKeys)
    .set({ statusCode: result.status, response: result.body as object })
    .where(and(eq(idempotencyKeys.orgId, req.org!.id), eq(idempotencyKeys.key, key)));
  return { ...result, replayed: false };
}

/* ------------------------------------------------------------------ routes */

export async function billingRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = requireAuth(config);
  const read = [auth, requireOrg(db, "viewer")];
  const write = [auth, requireOrg(db, "staff")];
  const owner = [auth, requireOrg(db, "owner")];
  const sec = [{ bearer: [] }];
  const tags = ["billing"];

  /* ---------- ลูกค้า ---------- */
  r.get(
    "/orgs/:orgId/customers",
    {
      schema: {
        tags,
        security: sec,
        summary: "รายชื่อลูกค้า",
        params: orgParams,
        querystring: z.object({
          q: z.string().max(100).optional(),
          archived: z.enum(["true", "false"]).default("false"),
        }),
      },
      preHandler: read,
    },
    async (req) => {
      const conds = [eq(customers.orgId, req.org!.id)];
      if (req.query.archived === "false") conds.push(isNull(customers.archivedAt));
      if (req.query.q)
        conds.push(
          sql`(${customers.name} ilike ${"%" + req.query.q + "%"} or ${customers.taxId} like ${req.query.q + "%"} or ${customers.phone} like ${"%" + req.query.q + "%"})`,
        );
      return db
        .select()
        .from(customers)
        .where(and(...conds))
        .orderBy(asc(customers.name));
    },
  );

  r.post(
    "/orgs/:orgId/customers",
    {
      schema: {
        tags,
        security: sec,
        summary: "เพิ่มลูกค้า",
        params: orgParams,
        body: customerBody,
      },
      preHandler: write,
    },
    async (req, reply) => {
      checkTaxId(req.body.taxId);
      const [c] = await db
        .insert(customers)
        .values({ orgId: req.org!.id, ...req.body })
        .returning();
      await audit(db, req, "customer.create", "customer", c!.id, req.body);
      return reply.code(201).send(c);
    },
  );

  r.patch(
    "/orgs/:orgId/customers/:id",
    {
      schema: {
        tags,
        security: sec,
        summary: "แก้ข้อมูลลูกค้า (ไม่กระทบเอกสารที่ออกไปแล้ว)",
        params: idParams,
        body: customerBody.partial(),
      },
      preHandler: write,
    },
    async (req) => {
      if (req.body.taxId) checkTaxId(req.body.taxId);
      const [c] = await db
        .update(customers)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(customers.id, req.params.id), eq(customers.orgId, req.org!.id)))
        .returning();
      if (!c) throw notFound("ไม่พบลูกค้า");
      await audit(db, req, "customer.update", "customer", c.id, req.body);
      return c;
    },
  );

  r.delete(
    "/orgs/:orgId/customers/:id",
    {
      schema: {
        tags,
        security: sec,
        summary: "ลบลูกค้า (ถ้ามีเอกสารจะเก็บเข้าคลังแทน)",
        params: idParams,
      },
      preHandler: write,
    },
    async (req, reply) => {
      const [used] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.orgId, req.org!.id), eq(documents.customerId, req.params.id)))
        .limit(1);
      const res = used
        ? await db
            .update(customers)
            .set({ archivedAt: new Date() })
            .where(and(eq(customers.id, req.params.id), eq(customers.orgId, req.org!.id)))
            .returning({ id: customers.id })
        : await db
            .delete(customers)
            .where(and(eq(customers.id, req.params.id), eq(customers.orgId, req.org!.id)))
            .returning({ id: customers.id });
      if (!res.length) throw notFound("ไม่พบลูกค้า");
      await audit(
        db,
        req,
        used ? "customer.archive" : "customer.delete",
        "customer",
        req.params.id,
        null,
      );
      return reply.code(204).send();
    },
  );

  r.get(
    "/orgs/:orgId/customers/:id/statement",
    {
      schema: {
        tags,
        security: sec,
        summary: "รายการเคลื่อนไหวของลูกค้า (ยอดหนี้ / รับชำระ / คงค้าง)",
        params: idParams,
      },
      preHandler: read,
    },
    async (req) => {
      const docs = (await loadDocs(db, req.org!.id, eq(documents.customerId, req.params.id))).map(
        (d) => d.doc,
      );
      return billing.statement(docs, req.params.id).map((x) => ({
        ...x,
        debit: toSatang(x.debit),
        credit: toSatang(x.credit),
        balance: toSatang(x.balance),
      }));
    },
  );

  /* ---------- สินค้า/บริการ ---------- */
  r.get(
    "/orgs/:orgId/items",
    {
      schema: { tags, security: sec, summary: "สินค้า/บริการ", params: orgParams },
      preHandler: read,
    },
    async (req) =>
      db
        .select()
        .from(items)
        .where(and(eq(items.orgId, req.org!.id), isNull(items.archivedAt)))
        .orderBy(asc(items.name)),
  );
  r.post(
    "/orgs/:orgId/items",
    {
      schema: {
        tags,
        security: sec,
        summary: "เพิ่มสินค้า/บริการ",
        params: orgParams,
        body: itemBody,
      },
      preHandler: write,
    },
    async (req, reply) => {
      const [i] = await db
        .insert(items)
        .values({ orgId: req.org!.id, ...req.body })
        .returning();
      return reply.code(201).send(i);
    },
  );
  r.patch(
    "/orgs/:orgId/items/:id",
    {
      schema: {
        tags,
        security: sec,
        summary: "แก้สินค้า/บริการ",
        params: idParams,
        body: itemBody.partial(),
      },
      preHandler: write,
    },
    async (req) => {
      const [i] = await db
        .update(items)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(items.id, req.params.id), eq(items.orgId, req.org!.id)))
        .returning();
      if (!i) throw notFound("ไม่พบสินค้า");
      return i;
    },
  );
  r.delete(
    "/orgs/:orgId/items/:id",
    {
      schema: { tags, security: sec, summary: "ลบสินค้า/บริการ", params: idParams },
      preHandler: write,
    },
    async (req, reply) => {
      const res = await db
        .update(items)
        .set({ archivedAt: new Date() })
        .where(and(eq(items.id, req.params.id), eq(items.orgId, req.org!.id)))
        .returning({ id: items.id });
      if (!res.length) throw notFound("ไม่พบสินค้า");
      return reply.code(204).send();
    },
  );

  /* ---------- เอกสาร ---------- */
  r.get(
    "/orgs/:orgId/documents",
    {
      schema: {
        tags,
        security: sec,
        summary: "รายการเอกสาร",
        params: orgParams,
        querystring: z.object({
          type: z.enum(["QT", "INV", "RC"]).optional(),
          status: z.string().max(20).optional(),
          q: z.string().max(100).optional(),
          from: isoDate.optional(),
          to: isoDate.optional(),
        }),
      },
      preHandler: read,
    },
    async (req) => {
      const today = bangkokToday();
      const q = req.query.q?.toLowerCase();
      return (await loadDocs(db, req.org!.id))
        .filter(
          ({ row }) =>
            (!req.query.type || row.type === req.query.type) &&
            (!req.query.from || row.date >= req.query.from) &&
            (!req.query.to || row.date <= req.query.to),
        )
        .map(({ row, doc }) => presentDoc(row, doc, today))
        .filter(
          (d) =>
            (!req.query.status || d.status === req.query.status) &&
            (!q || `${d.no} ${d.customer.name}`.toLowerCase().includes(q)),
        )
        .reverse();
    },
  );

  r.get(
    "/orgs/:orgId/documents/:id",
    {
      schema: {
        tags,
        security: sec,
        summary: "เอกสารพร้อมรายการ การรับชำระ และเอกสารที่ออกต่อ",
        params: idParams,
      },
      preHandler: read,
    },
    async (req) => getDoc(db, req.org!.id, req.params.id),
  );

  r.post(
    "/orgs/:orgId/documents",
    {
      schema: {
        tags,
        security: sec,
        summary: "สร้างใบเสนอราคา / ใบแจ้งหนี้ (ออกเลขที่ให้อัตโนมัติ)",
        params: orgParams,
        body: createDocBody,
      },
      preHandler: write,
    },
    async (req, reply) => {
      const b = req.body;
      if (b.customer.taxId) checkTaxId(b.customer.taxId);
      const id = await db.transaction(async (tx) => {
        const customerId = await resolveCustomer(tx, req.org!.id, b.customerId, b.customer);
        const t = computeTotals(b.lines, b.discountSatang, b.vatMode, b.whtRate);
        const no = await nextDocNumber(tx, req.org!.id, b.type, b.date);
        const [d] = await tx
          .insert(documents)
          .values({
            orgId: req.org!.id,
            type: b.type,
            no,
            date: b.date,
            due: b.due,
            customerId,
            customer: b.customer,
            discountSatang: b.discountSatang,
            vatMode: b.vatMode,
            whtRate: b.whtRate,
            note: b.note,
            totalSatang: t.total,
            netSatang: t.net,
            createdBy: req.userId,
          })
          .returning({ id: documents.id });
        await insertLines(tx, d!.id, b.lines);
        await audit(tx as unknown as typeof db, req, "document.create", "document", d!.id, {
          no,
          type: b.type,
          total: t.total,
        });
        return d!.id;
      });
      return reply.code(201).send(await getDoc(db, req.org!.id, id));
    },
  );

  r.patch(
    "/orgs/:orgId/documents/:id",
    {
      schema: {
        tags,
        security: sec,
        summary: "แก้ไขเอกสาร — ต้องส่ง version ล่าสุด (กันแก้ทับกัน)",
        params: idParams,
        body: patchDocBody,
      },
      preHandler: write,
    },
    async (req) => {
      const b = req.body;
      if (b.customer?.taxId) checkTaxId(b.customer.taxId);
      await db.transaction(async (tx) => {
        const row = await lockDoc(tx, req.org!.id, req.params.id);
        if (row.version !== b.version)
          throw conflict("เอกสารนี้ถูกแก้ไขโดยคนอื่นแล้ว — โหลดใหม่ก่อนแก้", {
            currentVersion: row.version,
          });
        if (row.voidedAt) throw conflict("เอกสารถูกยกเลิกแล้ว แก้ไขไม่ได้");
        if (row.type === "RC") throw conflict("ใบเสร็จแก้ไขไม่ได้ — ยกเลิกแล้วออกใหม่แทน");
        const [paid] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.documentId, row.id))
          .limit(1);
        if (paid) throw conflict("ใบแจ้งหนี้ที่รับชำระแล้วแก้ไขไม่ได้");
        const date = b.date ?? row.date;
        const due = b.due === undefined ? row.due : b.due;
        if (due && due < date) throw badRequest("วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร");
        let lines = b.lines;
        if (!lines)
          lines = (
            await tx
              .select()
              .from(documentLines)
              .where(eq(documentLines.documentId, row.id))
              .orderBy(asc(documentLines.position))
          ).map((l) => ({
            description: l.description,
            qty: Number(l.qty),
            unit: l.unit,
            priceSatang: l.priceSatang,
          }));
        const discount = b.discountSatang ?? row.discountSatang;
        const vatMode = b.vatMode ?? row.vatMode;
        const whtRate = b.whtRate ?? row.whtRate;
        const t = computeTotals(lines, discount, vatMode, whtRate);
        const customerId =
          b.customer || b.customerId !== undefined
            ? await resolveCustomer(
                tx,
                req.org!.id,
                b.customerId ?? null,
                b.customer ?? (row.customer as z.output<typeof snapshotSchema>),
              )
            : row.customerId;
        await tx
          .update(documents)
          .set({
            date,
            due,
            customerId,
            customer: b.customer ?? row.customer,
            discountSatang: discount,
            vatMode,
            whtRate,
            note: b.note ?? row.note,
            totalSatang: t.total,
            netSatang: t.net,
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, row.id));
        if (b.lines) {
          await tx.delete(documentLines).where(eq(documentLines.documentId, row.id));
          await insertLines(tx, row.id, b.lines);
        }
        await audit(tx as unknown as typeof db, req, "document.update", "document", row.id, {
          version: row.version + 1,
        });
      });
      return getDoc(db, req.org!.id, req.params.id);
    },
  );

  r.post(
    "/orgs/:orgId/documents/:id/status",
    {
      schema: {
        tags,
        security: sec,
        summary: "เปลี่ยนสถานะใบเสนอราคา",
        params: idParams,
        body: z.object({ quoteStatus: z.enum(["draft", "sent", "accepted", "rejected"]) }),
      },
      preHandler: write,
    },
    async (req) => {
      await db.transaction(async (tx) => {
        const row = await lockDoc(tx, req.org!.id, req.params.id);
        if (row.type !== "QT") throw badRequest("เปลี่ยนสถานะได้เฉพาะใบเสนอราคา");
        if (row.voidedAt) throw conflict("เอกสารถูกยกเลิกแล้ว");
        await tx
          .update(documents)
          .set({
            quoteStatus: req.body.quoteStatus,
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, row.id));
        await audit(
          tx as unknown as typeof db,
          req,
          "document.status",
          "document",
          row.id,
          req.body,
        );
      });
      return getDoc(db, req.org!.id, req.params.id);
    },
  );

  r.post(
    "/orgs/:orgId/documents/:id/convert",
    {
      schema: {
        tags,
        security: sec,
        summary: "แปลงใบเสนอราคาเป็นใบแจ้งหนี้",
        params: idParams,
        body: z.object({ date: isoDate.optional() }).default({}),
      },
      preHandler: write,
    },
    async (req, reply) => {
      const id = await db.transaction(async (tx) => {
        const row = await lockDoc(tx, req.org!.id, req.params.id);
        if (row.type !== "QT") throw badRequest("แปลงได้เฉพาะใบเสนอราคา");
        if (row.voidedAt) throw conflict("ใบเสนอราคาถูกยกเลิกแล้ว");
        if (row.quoteStatus === "rejected") throw conflict("ใบเสนอราคานี้ถูกปฏิเสธแล้ว");
        const [existing] = await tx
          .select({ no: documents.no })
          .from(documents)
          .where(
            and(eq(documents.refId, row.id), eq(documents.type, "INV"), isNull(documents.voidedAt)),
          );
        if (existing) throw conflict(`ออกใบแจ้งหนี้ไปแล้ว (${existing.no})`);
        const [org] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, req.org!.id));
        const lines = await tx
          .select()
          .from(documentLines)
          .where(eq(documentLines.documentId, row.id))
          .orderBy(asc(documentLines.position));
        const date = req.body.date ?? bangkokToday();
        const no = await nextDocNumber(tx, req.org!.id, "INV", date);
        const [d] = await tx
          .insert(documents)
          .values({
            orgId: row.orgId,
            type: "INV",
            no,
            date,
            due: billing.addDays(date, org!.dueDays),
            customerId: row.customerId,
            customer: row.customer,
            discountSatang: row.discountSatang,
            vatMode: row.vatMode,
            whtRate: row.whtRate,
            note: row.note,
            totalSatang: row.totalSatang,
            netSatang: row.netSatang,
            refId: row.id,
            createdBy: req.userId,
          })
          .returning({ id: documents.id });
        await insertLines(
          tx,
          d!.id,
          lines.map((l) => ({
            description: l.description,
            qty: Number(l.qty),
            unit: l.unit,
            priceSatang: l.priceSatang,
          })),
        );
        await tx
          .update(documents)
          .set({ quoteStatus: "accepted", version: row.version + 1, updatedAt: new Date() })
          .where(eq(documents.id, row.id));
        await audit(tx as unknown as typeof db, req, "document.convert", "document", d!.id, {
          from: row.no,
          no,
        });
        return d!.id;
      });
      return reply.code(201).send(await getDoc(db, req.org!.id, id));
    },
  );

  r.post(
    "/orgs/:orgId/documents/:id/void",
    {
      schema: {
        tags,
        security: sec,
        summary: "ยกเลิกเอกสาร (เก็บเลขที่ไว้ ไม่นับยอด)",
        params: idParams,
      },
      preHandler: write,
    },
    async (req) => {
      await db.transaction(async (tx) => {
        const row = await lockDoc(tx, req.org!.id, req.params.id);
        if (row.voidedAt) return;
        await tx
          .update(documents)
          .set({ voidedAt: new Date(), version: row.version + 1, updatedAt: new Date() })
          .where(eq(documents.id, row.id));
        await audit(tx as unknown as typeof db, req, "document.void", "document", row.id, {
          no: row.no,
        });
      });
      return getDoc(db, req.org!.id, req.params.id);
    },
  );

  /* ---------- รับชำระ ---------- */
  r.post(
    "/orgs/:orgId/documents/:id/payments",
    {
      schema: {
        tags,
        security: sec,
        summary: "รับชำระ (ต้องส่ง Idempotency-Key) — ออกใบเสร็จอัตโนมัติ",
        params: idParams,
        body: paymentBody,
        headers: z.object({ "idempotency-key": z.string().optional() }).passthrough(),
      },
      preHandler: write,
    },
    async (req, reply) => {
      const result = await db.transaction(async (tx) =>
        idempotent(tx, req, req.body, async () => {
          // ล็อกใบแจ้งหนี้ — คำขอรับชำระพร้อมกันจะเข้าคิว เห็นยอดค้างล่าสุดเสมอ จึงรับเกินยอดไม่ได้
          const row = await lockDoc(tx, req.org!.id, req.params.id);
          if (row.type !== "INV") throw badRequest("รับชำระได้เฉพาะใบแจ้งหนี้");
          const [found] = await loadDocs(tx, req.org!.id, eq(documents.id, row.id));
          const [org] = await tx
            .select()
            .from(organizations)
            .where(eq(organizations.id, req.org!.id));
          const p = req.body;
          let out: ReturnType<typeof billing.receivePayment>;
          try {
            let n = 0;
            out = billing.receivePayment(
              [found!.doc],
              row.id,
              { date: p.date, amount: toBaht(p.amountSatang), method: p.method, note: p.note },
              bizOf(org!),
              {
                payment: "new-payment",
                receipt: p.issueReceipt ? "new-receipt" : null,
                line: () => `l${n++}`,
              },
            );
          } catch (e) {
            throw conflict((e as Error).message);
          }
          let receiptId: string | null = null;
          let receiptNo: string | null = null;
          if (out.receipt) {
            const rc = out.receipt;
            receiptNo = await nextDocNumber(tx, req.org!.id, "RC", p.date);
            const lines = rc.lines.map((l) => ({
              description: l.description,
              qty: l.qty,
              unit: l.unit,
              priceSatang: toSatang(l.price),
            }));
            const adjust = toSatang(rc.adjust ?? 0);
            const t = computeTotals(lines, toSatang(rc.discount), rc.vatMode, rc.whtRate, adjust);
            const [d] = await tx
              .insert(documents)
              .values({
                orgId: row.orgId,
                type: "RC",
                no: receiptNo,
                date: p.date,
                customerId: row.customerId,
                customer: row.customer,
                discountSatang: toSatang(rc.discount),
                vatMode: rc.vatMode,
                whtRate: rc.whtRate,
                adjustSatang: adjust,
                note: p.note,
                totalSatang: t.total,
                netSatang: t.net,
                refId: row.id,
                createdBy: req.userId,
              })
              .returning({ id: documents.id });
            await insertLines(tx, d!.id, lines);
            receiptId = d!.id;
          }
          const [pay] = await tx
            .insert(payments)
            .values({
              orgId: row.orgId,
              documentId: row.id,
              date: p.date,
              amountSatang: p.amountSatang,
              method: p.method,
              note: p.note,
              receiptId,
              createdBy: req.userId,
            })
            .returning({ id: payments.id });
          await tx
            .update(documents)
            .set({ version: row.version + 1, updatedAt: new Date() })
            .where(eq(documents.id, row.id));
          await audit(tx as unknown as typeof db, req, "payment.create", "document", row.id, {
            amount: p.amountSatang,
            receiptNo,
          });
          return { status: 201, body: { paymentId: pay!.id, receiptId, receiptNo } };
        }),
      );
      if (result.replayed) reply.header("idempotent-replayed", "true");
      return reply
        .code(result.status)
        .send({ ...result.body, invoice: await getDoc(db, req.org!.id, req.params.id) });
    },
  );

  /* ---------- รายงาน ---------- */
  const tagsR = ["reports"];
  r.get(
    "/orgs/:orgId/reports/summary",
    {
      schema: {
        tags: tagsR,
        security: sec,
        summary: "สรุปรายเดือน + อายุลูกหนี้ + ลูกค้าหลัก (สตางค์)",
        params: orgParams,
        querystring: z.object({
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        }),
      },
      preHandler: read,
    },
    async (req) => {
      const today = bangkokToday();
      const month = req.query.month ?? today.slice(0, 7);
      const docs = (await loadDocs(db, req.org!.id)).map((d) => d.doc);
      const m = billing.monthSummary(docs, month);
      const a = billing.aging(docs, today);
      const S = (o: Record<string, number | null>) =>
        Object.fromEntries(
          Object.entries(o).map(([k, v]) => [
            k,
            v === null || k === "invoiceCount" || k === "quoteCount" || k === "winRate"
              ? v
              : toSatang(v),
          ]),
        );
      return {
        month,
        today,
        summary: S(m),
        aging: S(a),
        topCustomers: billing.topCustomers(docs, 5).map((c) => ({
          id: c.id,
          name: c.name,
          total: toSatang(c.total),
          outstanding: toSatang(c.outstanding),
        })),
      };
    },
  );

  r.get(
    "/orgs/:orgId/export.csv",
    {
      schema: {
        tags: tagsR,
        security: sec,
        summary: "ส่งออกเอกสารทั้งหมดเป็น CSV (สำหรับนักบัญชี)",
        params: orgParams,
      },
      preHandler: read,
    },
    async (req, reply) => {
      const docs = (await loadDocs(db, req.org!.id)).map((d) => d.doc);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="documents-${bangkokToday()}.csv"`)
        .send(billing.docsCsv(docs, bangkokToday()));
    },
  );

  r.get(
    "/orgs/:orgId/audit",
    {
      schema: {
        tags: tagsR,
        security: sec,
        summary: "ประวัติการเปลี่ยนแปลงล่าสุด (เจ้าของร้าน)",
        params: orgParams,
      },
      preHandler: owner,
    },
    async (req) =>
      db.execute(
        sql`select a.id, a.action, a.entity, a.entity_id as "entityId", a.data, a.at, u.email from audit_log a left join users u on u.id = a.user_id where a.org_id = ${req.org!.id} order by a.id desc limit 200`,
      ),
  );

  /* ---------- snapshot + นำเข้า (ใช้กับหน้าเว็บ) ---------- */
  r.get(
    "/orgs/:orgId/snapshot",
    {
      schema: {
        tags,
        security: sec,
        summary: "ข้อมูลทั้งร้านในรูปแบบเดียวกับแอปหน้าเว็บ (หน่วยบาท)",
        params: orgParams,
      },
      preHandler: read,
    },
    async (req) => {
      const [[org], cs, its, docs] = await Promise.all([
        db.select().from(organizations).where(eq(organizations.id, req.org!.id)),
        db
          .select()
          .from(customers)
          .where(and(eq(customers.orgId, req.org!.id), isNull(customers.archivedAt)))
          .orderBy(asc(customers.name)),
        db
          .select()
          .from(items)
          .where(and(eq(items.orgId, req.org!.id), isNull(items.archivedAt)))
          .orderBy(asc(items.name)),
        loadDocs(db, req.org!.id),
      ]);
      return {
        org: { id: org!.id, role: req.org!.role, ...bizOf(org!) },
        customers: cs.map((c) => ({
          id: c.id,
          name: c.name,
          taxId: c.taxId,
          branch: c.branch,
          address: c.address,
          phone: c.phone,
          email: c.email,
        })),
        items: its.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          price: toBaht(i.priceSatang),
        })),
        docs: docs.map(({ row, doc }) => ({ ...doc, version: row.version })),
      };
    },
  );

  r.post(
    "/orgs/:orgId/import",
    {
      schema: {
        tags,
        security: sec,
        summary: "นำเข้าข้อมูลจากไฟล์สำรองของแอปหน้าเว็บ (ร้านที่ยังไม่มีเอกสารเท่านั้น)",
        params: orgParams,
        body: importBody,
      },
      preHandler: owner,
      bodyLimit: 20_000_000,
    },
    async (req, reply) => {
      const counts = await db.transaction(async (tx) => {
        const c = await importBackup(tx, req.org!.id, req.userId!, req.body);
        await audit(tx as unknown as typeof db, req, "org.import", "organization", req.org!.id, c);
        return c;
      });
      return reply.code(201).send({ imported: counts });
    },
  );
}
