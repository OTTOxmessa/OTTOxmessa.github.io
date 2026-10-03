import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/db/migrate";
import { resetDatabase, TEST_DATABASE_URL } from "./helpers";

let sql: postgres.Sql;
beforeAll(async () => {
  await resetDatabase();
  sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
});
afterAll(() => sql.end());

async function seedOrg() {
  const [org] = await sql`insert into organizations (name) values ('ร้านทดสอบ') returning id`;
  return org!.id as string;
}
const snapshot = JSON.stringify({
  name: "ลูกค้า",
  taxId: "",
  branch: "",
  address: "",
  phone: "",
  email: "",
});

describe("migrations", () => {
  it("create every table and can be re-run safely", async () => {
    const rows =
      await sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    expect(rows.map((r) => r.table_name)).toEqual([
      "audit_log",
      "customers",
      "document_lines",
      "documents",
      "idempotency_keys",
      "items",
      "memberships",
      "number_sequences",
      "organizations",
      "payments",
      "refresh_tokens",
      "users",
    ]);
    await expect(runMigrations(TEST_DATABASE_URL)).resolves.toBeUndefined();
  });
});

describe("constraints protect the data even if the app has a bug", () => {
  it("emails are unique regardless of case", async () => {
    await sql`insert into users (email, password_hash) values ('Otto@Example.com', 'x')`;
    await expect(
      sql`insert into users (email, password_hash) values ('otto@example.com', 'x')`,
    ).rejects.toThrow(/users_email_lower_idx/);
  });

  it("document numbers are unique per org and type, but may repeat across orgs", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    await sql`insert into documents (org_id, type, no, date, customer) values (${a}, 'INV', 'INV-202610-001', '2026-10-01', ${snapshot}::jsonb)`;
    await expect(
      sql`insert into documents (org_id, type, no, date, customer) values (${a}, 'INV', 'INV-202610-001', '2026-10-02', ${snapshot}::jsonb)`,
    ).rejects.toThrow(/documents_org_type_no_idx/);
    await sql`insert into documents (org_id, type, no, date, customer) values (${a}, 'QT', 'INV-202610-001', '2026-10-01', ${snapshot}::jsonb)`;
    await sql`insert into documents (org_id, type, no, date, customer) values (${b}, 'INV', 'INV-202610-001', '2026-10-01', ${snapshot}::jsonb)`;
  });

  it("rejects invalid tax/withholding values, bad dates and non-positive payments", async () => {
    const org = await seedOrg();
    await expect(
      sql`insert into documents (org_id, type, no, date, customer, wht_rate) values (${org}, 'INV', 'X1', '2026-10-01', ${snapshot}::jsonb, 4)`,
    ).rejects.toThrow(/documents_wht_rate/);
    await expect(
      sql`insert into documents (org_id, type, no, date, due, customer) values (${org}, 'INV', 'X2', '2026-10-10', '2026-10-01', ${snapshot}::jsonb)`,
    ).rejects.toThrow(/documents_due_after_date/);
    const [doc] =
      await sql`insert into documents (org_id, type, no, date, customer) values (${org}, 'INV', 'X3', '2026-10-01', ${snapshot}::jsonb) returning id`;
    await expect(
      sql`insert into payments (org_id, document_id, date, amount_satang, method) values (${org}, ${doc!.id}, '2026-10-02', 0, 'cash')`,
    ).rejects.toThrow(/payments_amount_pos/);
    await expect(
      sql`insert into document_lines (document_id, position, description, qty, price_satang) values (${doc!.id}, 1, 'x', 0, 100)`,
    ).rejects.toThrow(/document_lines_qty_pos/);
  });

  it("deleting an organization removes all of its data", async () => {
    const org = await seedOrg();
    const [doc] =
      await sql`insert into documents (org_id, type, no, date, customer) values (${org}, 'INV', 'D1', '2026-10-01', ${snapshot}::jsonb) returning id`;
    await sql`insert into document_lines (document_id, position, description, qty, price_satang) values (${doc!.id}, 1, 'x', 1, 100)`;
    await sql`delete from organizations where id = ${org}`;
    const [row] =
      await sql`select count(*)::int as n from document_lines where document_id = ${doc!.id}`;
    expect(row!.n).toBe(0);
  });

  it("stores money as integer satang without float drift", async () => {
    const org = await seedOrg();
    await sql`insert into items (org_id, name, price_satang) values (${org}, 'big', ${900719925474099})`;
    const [row] = await sql`select price_satang from items where org_id = ${org}`;
    expect(BigInt(row!.price_satang)).toBe(900719925474099n);
  });
});
