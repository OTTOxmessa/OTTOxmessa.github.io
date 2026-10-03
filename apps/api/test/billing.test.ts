import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearer, makeApp, resetDatabase, signup } from "./helpers";

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  await resetDatabase();
  ctx = await makeApp();
});
afterAll(() => ctx.close());

type S = Awaited<ReturnType<typeof signup>>;
const cust = {
  name: "บริษัท ขอนแก่นเบเกอรี่ จำกัด",
  taxId: "",
  branch: "",
  address: "ขอนแก่น",
  phone: "",
  email: "",
};
const line = (priceSatang: number, qty = 1, description = "ออกแบบเว็บไซต์") => ({
  description,
  qty,
  unit: "งาน",
  priceSatang,
});

async function api(
  s: S,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return ctx.app.inject({
    method,
    url: `/orgs/${s.orgId}${path}`,
    headers: { ...bearer(s.token), ...headers },
    payload: payload as object,
  });
}
const createInvoice = (s: S, extra: Record<string, unknown> = {}) =>
  api(s, "POST", "/documents", {
    type: "INV",
    date: "2026-10-01",
    due: "2026-10-31",
    customer: cust,
    lines: [line(10_000_00)],
    vatMode: "exclusive",
    whtRate: 3,
    ...extra,
  });

describe("documents", () => {
  let s: S;
  beforeAll(async () => {
    s = await signup(ctx.app);
  });

  it("creates an invoice with server-computed totals in satang and saves the new customer", async () => {
    const res = await createInvoice(s);
    expect(res.statusCode).toBe(201);
    const d = res.json();
    expect(d.no).toBe("INV-202610-001");
    expect(d.totals).toMatchObject({
      base: 1_000_000,
      vat: 70_000,
      total: 1_070_000,
      wht: 30_000,
      net: 1_040_000,
    });
    expect(d.status).toMatch(/unpaid|overdue/);
    const customers = (await api(s, "GET", "/customers")).json();
    expect(customers.map((c: { name: string }) => c.name)).toEqual([cust.name]);
    // ออกใบที่สองให้ลูกค้าเดิม (ชื่อเดียวกัน) → ไม่สร้างลูกค้าซ้ำ
    await createInvoice(s);
    expect((await api(s, "GET", "/customers")).json()).toHaveLength(1);
  });

  it("validates input: empty lines, bad dates, bad tax id, unknown withholding rate", async () => {
    expect((await createInvoice(s, { lines: [] })).statusCode).toBe(400);
    expect((await createInvoice(s, { due: "2026-09-01" })).json().error.details[0].message).toMatch(
      "ครบกำหนด",
    );
    expect(
      (await createInvoice(s, { customer: { ...cust, taxId: "1234567890123" } })).statusCode,
    ).toBe(400);
    expect((await createInvoice(s, { whtRate: 4 })).statusCode).toBe(400);
    expect((await createInvoice(s, { lines: [line(-1)] })).statusCode).toBe(400);
  });

  it("issues unique, gap-free numbers even when 30 invoices are created at the same time", async () => {
    const fresh = await signup(ctx.app);
    const res = await Promise.all(
      Array.from({ length: 30 }, () => createInvoice(fresh, { date: "2026-11-05", due: null })),
    );
    expect(res.every((r) => r.statusCode === 201)).toBe(true);
    const nos = res.map((r) => r.json().no).sort();
    expect(nos).toEqual(
      Array.from({ length: 30 }, (_, i) => `INV-202611-${String(i + 1).padStart(3, "0")}`),
    );
  });

  it("rejects stale edits with 409 (optimistic locking)", async () => {
    const d = (await createInvoice(s)).json();
    const a = await api(s, "PATCH", `/documents/${d.id}`, { version: d.version, note: "แก้โดย A" });
    expect(a.statusCode).toBe(200);
    expect(a.json().version).toBe(d.version + 1);
    const b = await api(s, "PATCH", `/documents/${d.id}`, {
      version: d.version,
      note: "แก้โดย B (ข้อมูลเก่า)",
    });
    expect(b.statusCode).toBe(409);
    expect(b.json().error.details.currentVersion).toBe(d.version + 1);
  });

  it("recomputes totals when lines change", async () => {
    const d = (await createInvoice(s)).json();
    const res = await api(s, "PATCH", `/documents/${d.id}`, {
      version: d.version,
      lines: [line(500_00, 2), line(99_50)],
      vatMode: "none",
      whtRate: 0,
      discountSatang: 50_00,
    });
    expect(res.json().totals).toMatchObject({
      subtotal: 1_099_50,
      discount: 50_00,
      total: 1_049_50,
      net: 1_049_50,
    });
    expect(res.json().lines).toHaveLength(2);
  });

  it("converts a quote to an invoice exactly once", async () => {
    const q = (
      await api(s, "POST", "/documents", {
        type: "QT",
        date: "2026-10-02",
        customer: cust,
        lines: [line(25_000_00)],
        vatMode: "exclusive",
      })
    ).json();
    expect(q.no).toBe("QT-202610-001");
    const sent = await api(s, "POST", `/documents/${q.id}/status`, { quoteStatus: "sent" });
    expect(sent.json().quoteStatus).toBe("sent");
    const [a, b] = await Promise.all(
      [1, 2].map(() => api(s, "POST", `/documents/${q.id}/convert`, { date: "2026-10-10" })),
    );
    expect([a!.statusCode, b!.statusCode].sort()).toEqual([201, 409]);
    const inv = [a, b].find((r) => r!.statusCode === 201)!.json();
    expect(inv).toMatchObject({
      type: "INV",
      refId: q.id,
      due: "2026-11-09",
      totals: { total: 2_675_000 },
    });
    const after = (await api(s, "GET", `/documents/${q.id}`)).json();
    expect(after.quoteStatus).toBe("accepted");
    expect(after.children).toEqual([{ id: inv.id, type: "INV", no: inv.no, voided: false }]);
  });

  it("voids documents and keeps them out of totals", async () => {
    const d = (await createInvoice(s)).json();
    const v = await api(s, "POST", `/documents/${d.id}/void`);
    expect(v.json()).toMatchObject({ voided: true, status: "void", balanceSatang: 0 });
    expect(
      (await api(s, "PATCH", `/documents/${d.id}`, { version: v.json().version, note: "x" }))
        .statusCode,
    ).toBe(409);
  });

  it("keeps each shop's data private", async () => {
    const other = await signup(ctx.app);
    const mine = (await createInvoice(s)).json();
    expect(
      (
        await ctx.app.inject({
          method: "GET",
          url: `/orgs/${s.orgId}/documents/${mine.id}`,
          headers: bearer(other.token),
        })
      ).statusCode,
    ).toBe(404);
    expect((await api(other, "GET", `/documents/${mine.id}`)).statusCode).toBe(404);
    expect((await api(other, "GET", "/documents")).json()).toEqual([]);
  });

  it("viewers can read but not write", async () => {
    const viewer = await signup(ctx.app);
    await ctx.app.inject({
      method: "POST",
      url: `/orgs/${s.orgId}/members`,
      headers: bearer(s.token),
      payload: { email: viewer.email, role: "viewer" },
    });
    const asViewer = { ...viewer, orgId: s.orgId };
    expect((await api(asViewer, "GET", "/documents")).statusCode).toBe(200);
    expect((await createInvoice(asViewer)).statusCode).toBe(403);
  });
});

describe("payments", () => {
  let s: S;
  beforeAll(async () => {
    s = await signup(ctx.app);
  });
  const pay = (
    id: string,
    amountSatang: number,
    key: string,
    extra: Record<string, unknown> = {},
  ) =>
    api(
      s,
      "POST",
      `/documents/${id}/payments`,
      { date: "2026-10-05", amountSatang, method: "transfer", ...extra },
      { "idempotency-key": key },
    );

  it("records partial payments with receipts whose net equals the money received", async () => {
    const inv = (await createInvoice(s)).json(); // net 10,400.00
    const p1 = await pay(inv.id, 4_000_00, "pay-partial-0001");
    expect(p1.statusCode).toBe(201);
    expect(p1.json().receiptNo).toBe("RC-202610-001");
    expect(p1.json().invoice).toMatchObject({
      paidSatang: 4_000_00,
      balanceSatang: 6_400_00,
      status: "partial",
    });
    const rc = (await api(s, "GET", `/documents/${p1.json().receiptId}`)).json();
    expect(rc.totals.net).toBe(4_000_00);
    const p2 = await pay(inv.id, 6_400_00, "pay-partial-0002");
    expect(p2.json().invoice).toMatchObject({ balanceSatang: 0, status: "paid" });
    expect((await pay(inv.id, 1, "pay-partial-0003")).statusCode).toBe(409);
    // ใบแจ้งหนี้ที่รับเงินแล้วแก้ไขไม่ได้
    expect(
      (
        await api(s, "PATCH", `/documents/${inv.id}`, {
          version: p2.json().invoice.version,
          note: "x",
        })
      ).statusCode,
    ).toBe(409);
  });

  it("replays the same response for a repeated Idempotency-Key and refuses a different body", async () => {
    const inv = (await createInvoice(s)).json();
    const a = await pay(inv.id, 1_000_00, "same-key-123456");
    const b = await pay(inv.id, 1_000_00, "same-key-123456");
    expect(b.statusCode).toBe(201);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.json().paymentId).toBe(a.json().paymentId);
    expect(b.json().invoice.paidSatang).toBe(1_000_00);
    expect((await pay(inv.id, 2_000_00, "same-key-123456")).statusCode).toBe(422);
    expect(
      (
        await api(s, "POST", `/documents/${inv.id}/payments`, {
          date: "2026-10-05",
          amountSatang: 1,
          method: "cash",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("20 simultaneous payments never exceed the balance", async () => {
    const inv = (await createInvoice(s)).json(); // ค้าง 10,400.00
    const res = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        pay(inv.id, 1_000_00, `race-${inv.id.slice(0, 8)}-${i}`, { issueReceipt: false }),
      ),
    );
    const ok = res.filter((r) => r.statusCode === 201).length;
    expect(ok).toBe(10); // 10 × 1,000 = 10,000 ≤ 10,400 · ใบที่ 11 จะเกิน
    expect(res.filter((r) => r.statusCode === 409).length).toBe(10);
    const final = (await api(s, "GET", `/documents/${inv.id}`)).json();
    expect(final.paidSatang).toBe(10_000_00);
    expect(final.balanceSatang).toBe(400_00);
  });

  it("the same key sent twice at the same moment is processed once", async () => {
    const inv = (await createInvoice(s)).json();
    const res = await Promise.all([1, 2, 3].map(() => pay(inv.id, 500_00, "concurrent-same-key")));
    expect(res.every((r) => r.statusCode === 201)).toBe(true);
    expect(new Set(res.map((r) => r.json().paymentId)).size).toBe(1);
    expect((await api(s, "GET", `/documents/${inv.id}`)).json().paidSatang).toBe(500_00);
  });
});

describe("reports, snapshot, import, audit", () => {
  it("summarises the month, ages receivables and exports CSV", async () => {
    const s = await signup(ctx.app);
    await createInvoice(s, { date: "2026-10-01", due: "2026-10-02" });
    const sum = (await api(s, "GET", "/reports/summary?month=2026-10")).json();
    expect(sum.summary).toMatchObject({
      invoiced: 1_070_000,
      vat: 70_000,
      wht: 30_000,
      invoiceCount: 1,
    });
    expect(sum.aging.total).toBe(1_040_000);
    expect(sum.topCustomers[0].name).toBe(cust.name);
    const csv = await api(s, "GET", "/export.csv");
    expect(csv.headers["content-type"]).toMatch("text/csv");
    expect(csv.body.startsWith("﻿type,no")).toBe(true);
  });

  it("imports a local backup into an empty shop, keeping numbers, links and payments", async () => {
    const s = await signup(ctx.app);
    const backup = {
      biz: { name: "OTTO Studio", vatRegistered: true },
      customers: [
        {
          id: "c1",
          name: "ร้านกาแฟบ้านสวน",
          taxId: "",
          branch: "",
          address: "",
          phone: "",
          email: "",
        },
      ],
      items: [{ id: "i1", name: "ดูแลเว็บไซต์รายเดือน", unit: "เดือน", price: 3500 }],
      docs: [
        {
          id: "q1",
          type: "QT",
          no: "QT-202609-004",
          date: "2026-09-01",
          due: "2026-09-16",
          customerId: "c1",
          customer: {
            name: "ร้านกาแฟบ้านสวน",
            taxId: "",
            branch: "",
            address: "",
            phone: "",
            email: "",
          },
          lines: [{ id: "l1", description: "ดูแลเว็บ", qty: 1, unit: "เดือน", price: 3500 }],
          discount: 0,
          vatMode: "none",
          whtRate: 0,
          note: "",
          refId: null,
          quoteStatus: "accepted",
          payments: [],
          voided: false,
        },
        {
          id: "v1",
          type: "INV",
          no: "INV-202609-007",
          date: "2026-09-02",
          due: "2026-10-02",
          customerId: "c1",
          customer: {
            name: "ร้านกาแฟบ้านสวน",
            taxId: "",
            branch: "",
            address: "",
            phone: "",
            email: "",
          },
          lines: [{ id: "l2", description: "ดูแลเว็บ", qty: 1, unit: "เดือน", price: 3500 }],
          discount: 0,
          vatMode: "none",
          whtRate: 0,
          note: "",
          refId: "q1",
          quoteStatus: "draft",
          payments: [
            {
              id: "p1",
              date: "2026-09-10",
              amount: 1000,
              method: "cash",
              note: "",
              receiptId: null,
            },
          ],
          voided: false,
        },
      ],
    };
    const res = await api(s, "POST", "/import", backup);
    expect(res.statusCode).toBe(201);
    expect(res.json().imported).toEqual({ customers: 1, items: 1, docs: 2 });
    const snap = (await api(s, "GET", "/snapshot")).json();
    expect(snap.org).toMatchObject({ name: "OTTO Studio", vatRegistered: true, role: "owner" });
    const inv = snap.docs.find((d: { no: string }) => d.no === "INV-202609-007");
    expect(inv.refId).toBe(snap.docs.find((d: { no: string }) => d.no === "QT-202609-004").id);
    expect(inv.payments[0].amount).toBe(1000);
    expect(snap.items[0]).toMatchObject({ name: "ดูแลเว็บไซต์รายเดือน", price: 3500 });
    // เลขถัดไปต่อจากที่นำเข้ามา ไม่ชนของเดิม
    const next = await createInvoice(s, { date: "2026-09-20", due: null });
    expect(next.json().no).toBe("INV-202609-008");
    // นำเข้าซ้ำไม่ได้
    expect((await api(s, "POST", "/import", backup)).statusCode).toBe(409);
    const log = (await api(s, "GET", "/audit")).json();
    expect(log.map((x: { action: string }) => x.action)).toEqual(
      expect.arrayContaining(["org.import", "document.create"]),
    );
  });
});
