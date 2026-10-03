/**
 * โครงสร้างฐานข้อมูลของระบบเอกสารขาย (ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ)
 *
 * หลักการ
 * - เงินเก็บเป็น "สตางค์" (bigint) ทั้งหมด ไม่มี float
 * - ทุกตารางข้อมูลธุรกิจมี org_id — ข้อมูลของแต่ละร้านแยกกันเด็ดขาด
 * - เอกสารไม่ถูกลบ ใช้ voided_at แทน (ตามแนวทางเอกสารบัญชี)
 * - documents.version ใช้กันการแก้ไขทับกัน (optimistic locking)
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const satang = (name: string) => bigint(name, { mode: "number" });

export const roleEnum = pgEnum("member_role", ["owner", "staff", "viewer"]);
export const docTypeEnum = pgEnum("doc_type", ["QT", "INV", "RC"]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "rejected"]);
export const vatModeEnum = pgEnum("vat_mode", ["none", "exclusive", "inclusive"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "transfer",
  "promptpay",
  "cash",
  "cheque",
]);

/* ------------------------------------------------------------------ ผู้ใช้และร้าน */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

/**
 * refresh token แบบหมุนเวียน (rotation): ใช้ได้ครั้งเดียว แล้วได้ตัวใหม่แทน
 * ถ้ามีคนเอาตัวที่ใช้ไปแล้วมาใช้ซ้ำ = token อาจถูกขโมย → ยกเลิกทั้ง "ตระกูล" (family) ทันที
 * เก็บเฉพาะ SHA-256 ของ token — ฐานข้อมูลหลุดก็เอาไปใช้ไม่ได้
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: uuid("replaced_by"),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("refresh_tokens_hash_idx").on(t.tokenHash),
    index("refresh_tokens_family_idx").on(t.familyId),
  ],
);

export type Prefixes = { QT: string; INV: string; RC: string };

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  taxId: text("tax_id").notNull().default(""),
  branch: text("branch").notNull().default("สำนักงานใหญ่"),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  promptpay: text("promptpay").notNull().default(""),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  signer: text("signer").notNull().default(""),
  dueDays: smallint("due_days").notNull().default(30),
  validDays: smallint("valid_days").notNull().default(15),
  prefixes: jsonb("prefixes")
    .$type<Prefixes>()
    .notNull()
    .default({ QT: "QT", INV: "INV", RC: "RC" }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("staff"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ ลูกค้าและสินค้า/บริการ */

export const customers = pgTable(
  "customers",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    taxId: text("tax_id").notNull().default(""),
    branch: text("branch").notNull().default(""),
    address: text("address").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customers_org_idx").on(t.orgId, t.name)],
);

export const items = pgTable(
  "items",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: text("unit").notNull().default(""),
    priceSatang: satang("price_satang").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("items_org_idx").on(t.orgId, t.name),
    check("items_price_nonneg", sql`${t.priceSatang} >= 0`),
  ],
);

/* ------------------------------------------------------------------ เอกสาร */

export type CustomerSnapshot = {
  name: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
};

export const documents = pgTable(
  "documents",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: docTypeEnum("type").notNull(),
    no: text("no").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    due: date("due", { mode: "string" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customer: jsonb("customer").$type<CustomerSnapshot>().notNull(),
    discountSatang: satang("discount_satang").notNull().default(0),
    vatMode: vatModeEnum("vat_mode").notNull().default("none"),
    whtRate: smallint("wht_rate").notNull().default(0),
    adjustSatang: satang("adjust_satang").notNull().default(0),
    // ยอดที่คำนวณแล้ว (เก็บไว้ให้รายงาน/ค้นหาด้วย SQL ได้เร็ว — คำนวณใหม่ทุกครั้งที่บันทึก)
    totalSatang: satang("total_satang").notNull().default(0),
    netSatang: satang("net_satang").notNull().default(0),
    note: text("note").notNull().default(""),
    refId: uuid("ref_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    quoteStatus: quoteStatusEnum("quote_status").notNull().default("draft"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("documents_org_type_no_idx").on(t.orgId, t.type, t.no),
    index("documents_org_type_date_idx").on(t.orgId, t.type, t.date),
    index("documents_ref_idx").on(t.refId),
    check("documents_wht_rate", sql`${t.whtRate} in (0, 1, 2, 3, 5)`),
    check("documents_discount_nonneg", sql`${t.discountSatang} >= 0`),
    check("documents_due_after_date", sql`${t.due} is null or ${t.due} >= ${t.date}`),
  ],
);

export const documentLines = pgTable(
  "document_lines",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 12, scale: 3, mode: "number" }).notNull(),
    unit: text("unit").notNull().default(""),
    priceSatang: satang("price_satang").notNull(),
  },
  (t) => [
    uniqueIndex("document_lines_doc_pos_idx").on(t.documentId, t.position),
    check("document_lines_qty_pos", sql`${t.qty} > 0`),
    check("document_lines_price_nonneg", sql`${t.priceSatang} >= 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    amountSatang: satang("amount_satang").notNull(),
    method: paymentMethodEnum("method").notNull(),
    note: text("note").notNull().default(""),
    receiptId: uuid("receipt_id").references(() => documents.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_doc_idx").on(t.documentId),
    index("payments_org_date_idx").on(t.orgId, t.date),
    check("payments_amount_pos", sql`${t.amountSatang} > 0`),
  ],
);

/* ------------------------------------------------------------------ กลไกเบื้องหลัง */

/** ตัวนับเลขที่เอกสาร ต่อร้าน × ประเภท × เดือน — เพิ่มค่าแบบ atomic ใน transaction เดียวกับการสร้างเอกสาร */
export const numberSequences = pgTable(
  "number_sequences",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: docTypeEnum("type").notNull(),
    period: char("period", { length: 6 }).notNull(), // YYYYMM
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.type, t.period] })],
);

/** จำผลของคำขอที่มี Idempotency-Key — ส่งซ้ำ (เน็ตหลุด/กดสองที) ได้ผลเดิม ไม่ทำซ้ำ */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    requestHash: text("request_hash").notNull(),
    statusCode: smallint("status_code"),
    response: jsonb("response"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // เช่น document.create, payment.create, document.void
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_at_idx").on(t.orgId, t.at)],
);
