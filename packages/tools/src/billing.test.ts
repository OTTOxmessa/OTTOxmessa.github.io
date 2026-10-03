import { describe, expect, it } from "vitest";
import {
  aging,
  balance,
  blankDoc,
  calc,
  docsCsv,
  invoiceStatus,
  monthSummary,
  nextNumber,
  quoteToInvoice,
  receivePayment,
  statement,
  taxIdError,
  totalsOf,
  type Business,
  type Customer,
  type Doc,
  type Line,
} from "./billing";

let n = 0;
const id = () => `id${++n}`;
const biz: Business = {
  name: "OTTO Studio", taxId: "", branch: "สำนักงานใหญ่", address: "", phone: "", email: "", promptpay: "",
  vatRegistered: true, signer: "", dueDays: 30, validDays: 15, prefixes: { QT: "QT", INV: "INV", RC: "RC" },
};
const cust: Customer = { id: "c1", name: "บริษัท ตัวอย่าง จำกัด", taxId: "", branch: "", address: "", phone: "", email: "" };
const line = (price: number, qty = 1): Line => ({ id: id(), description: "งาน", qty, unit: "งาน", price });

function invoice(lines: Line[], opts: Partial<Doc> = {}, docs: Doc[] = []): Doc {
  return { ...blankDoc("INV", docs, biz, cust, "2026-09-01", id()), lines, ...opts };
}

describe("billing: totals", () => {
  it("adds 7% VAT on top (exclusive) and withholds 3% on the pre-VAT base", () => {
    const t = calc([line(10000)], 0, "exclusive", 3);
    expect(t).toMatchObject({ base: 10000, vat: 700, total: 10700, wht: 300, net: 10400 });
  });
  it("extracts VAT from a VAT-inclusive price", () => {
    const t = calc([line(107)], 0, "inclusive", 0);
    expect(t).toMatchObject({ base: 100, vat: 7, total: 107 });
  });
  it("handles no VAT, discounts, fractional qty and float-prone prices exactly", () => {
    const t = calc([line(0.1, 3), line(19.99, 2.5)], 10, "none", 0);
    expect(t.subtotal).toBe(50.28); // 0.30 + 49.975 → 49.98
    expect(t.afterDiscount).toBe(40.28);
    expect(t.vat).toBe(0);
    expect(calc([line(100)], 500, "none", 0).afterDiscount).toBe(0); // discount capped
  });
});

describe("billing: numbering and conversion", () => {
  it("numbers documents per type and month: QT-202609-001, 002 … and restarts next month", () => {
    const d1 = blankDoc("QT", [], biz, cust, "2026-09-03", id());
    const d2 = blankDoc("QT", [d1], biz, cust, "2026-09-20", id());
    expect([d1.no, d2.no]).toEqual(["QT-202609-001", "QT-202609-002"]);
    expect(nextNumber([d1, d2], "QT", "QT", "2026-10-01")).toBe("QT-202610-001");
    expect(nextNumber([d1, d2], "INV", "INV", "2026-09-30")).toBe("INV-202609-001");
    expect(d1.due).toBe("2026-09-18"); // valid for 15 days
  });
  it("converts a quote into an invoice that references it", () => {
    const q = { ...blankDoc("QT", [], biz, cust, "2026-09-03", id()), lines: [line(5000)], whtRate: 3 };
    const inv = quoteToInvoice(q, [q], biz, "2026-09-10", id(), id);
    expect(inv).toMatchObject({ type: "INV", no: "INV-202609-001", refId: q.id, due: "2026-10-10", whtRate: 3 });
    expect(inv.lines[0]!.id).not.toBe(q.lines[0]!.id);
    expect(totalsOf(inv).net).toBe(totalsOf(q).net);
  });
});

describe("billing: payments", () => {
  it("records partial then full payment, issuing receipts whose net equals the amount received", () => {
    const inv = invoice([line(10000)], { whtRate: 3 }); // net 10,400
    let docs: Doc[] = [inv];
    const r1 = receivePayment(docs, inv.id, { date: "2026-09-05", amount: 4000, method: "transfer", note: "" }, biz, { payment: id(), receipt: id(), line: id });
    docs = r1.docs;
    expect(totalsOf(r1.receipt!).net).toBe(4000);
    expect(r1.receipt!.no).toBe("RC-202609-001");
    expect(invoiceStatus(docs[0]!, "2026-09-06")).toBe("partial");
    expect(balance(docs[0]!)).toBe(6400);
    expect(() => receivePayment(docs, inv.id, { date: "2026-09-07", amount: 7000, method: "cash", note: "" }, biz, { payment: id(), receipt: null, line: id })).toThrow("เกินยอดค้าง");
    const r2 = receivePayment(docs, inv.id, { date: "2026-09-07", amount: 6400, method: "cash", note: "" }, biz, { payment: id(), receipt: id(), line: id });
    expect(invoiceStatus(r2.docs[0]!, "2026-12-01")).toBe("paid");
    expect(totalsOf(r2.receipt!).net).toBe(6400);
  });
  it("a full single payment copies the original lines onto the receipt", () => {
    const inv = invoice([line(1200, 2), line(350)], { discount: 50 });
    const net = totalsOf(inv).net;
    const r = receivePayment([inv], inv.id, { date: "2026-09-02", amount: net, method: "promptpay", note: "" }, biz, { payment: id(), receipt: id(), line: id });
    expect(r.receipt!.lines.map((l) => l.price)).toEqual([1200, 350]);
    expect(totalsOf(r.receipt!).total).toBe(totalsOf(inv).total);
  });
  it("partial receipts stay exact across many awkward amounts and VAT/WHT modes", () => {
    for (const vatMode of ["none", "exclusive", "inclusive"] as const)
      for (const whtRate of [0, 1, 3, 5])
        for (const amount of [0.01, 1, 33.33, 99.99, 1234.56, 777.77]) {
          const inv = invoice([line(5000)], { vatMode, whtRate });
          const r = receivePayment([inv], inv.id, { date: "2026-09-02", amount, method: "cash", note: "" }, biz, { payment: id(), receipt: id(), line: id });
          expect(totalsOf(r.receipt!).net).toBe(amount);
          expect(Math.abs(r.receipt!.adjust ?? 0)).toBeLessThanOrEqual(0.01);
        }
  });
  it("refuses payments on voided invoices or non-positive amounts", () => {
    const inv = invoice([line(100)], { voided: true });
    expect(() => receivePayment([inv], inv.id, { date: "2026-09-02", amount: 10, method: "cash", note: "" }, biz, { payment: id(), receipt: null, line: id })).toThrow();
    const ok = invoice([line(100)]);
    expect(() => receivePayment([ok], ok.id, { date: "2026-09-02", amount: 0, method: "cash", note: "" }, biz, { payment: id(), receipt: null, line: id })).toThrow();
  });
});

describe("billing: reports", () => {
  const today = "2026-12-15";
  const docs = [
    invoice([line(1000)], { vatMode: "none", due: "2026-12-20" }), // current
    invoice([line(2000)], { vatMode: "none", due: "2026-11-30" }), // 15 days late
    invoice([line(3000)], { vatMode: "none", due: "2026-10-01" }), // 75 days late
    invoice([line(4000)], { vatMode: "none", due: "2026-08-01" }), // 136 days late
    invoice([line(9999)], { vatMode: "none", due: "2026-08-01", voided: true }),
  ];
  it("buckets receivables by days overdue", () => {
    expect(aging(docs, today)).toEqual({ current: 1000, d30: 2000, d60: 0, d90: 3000, over90: 4000, total: 10000 });
    expect(invoiceStatus(docs[1]!, today)).toBe("overdue");
    expect(invoiceStatus(docs[4]!, today)).toBe("void");
  });
  it("summarises a month and a customer statement with a running balance", () => {
    const inv = invoice([line(10000)], { whtRate: 3 });
    const paid = receivePayment([inv], inv.id, { date: "2026-09-20", amount: 5000, method: "transfer", note: "" }, biz, { payment: id(), receipt: null, line: id }).docs;
    const q1 = { ...blankDoc("QT", [], biz, cust, "2026-09-02", id()), lines: [line(100)], quoteStatus: "accepted" as const };
    const q2 = { ...blankDoc("QT", [], biz, cust, "2026-09-03", id()), lines: [line(100)], quoteStatus: "rejected" as const };
    const m = monthSummary([...paid, q1, q2], "2026-09");
    expect(m).toMatchObject({ invoiced: 10700, vat: 700, wht: 300, collected: 5000, quoteCount: 2, winRate: 50 });
    const st = statement(paid, "c1");
    expect(st.map((r) => r.balance)).toEqual([10400, 5400]);
  });
  it("validates tax IDs and exports CSV with a BOM", () => {
    expect(taxIdError("")).toBeNull();
    expect(taxIdError("123")).toMatch("13");
    expect(taxIdError("1101700230708")).toBeNull();
    expect(taxIdError("1101700230705")).toMatch("checksum");
    const csv = docsCsv(docs.slice(0, 1), today);
    expect(csv.startsWith("﻿type,no")).toBe(true);
    expect(csv).toContain("INV-202609-001");
  });
});

describe("billing: sample data", () => {
  it("builds a consistent sample: unique numbers, receipts that match payments, nothing overpaid", async () => {
    const { billingSample } = await import("./billing-sample");
    let k = 0;
    const s = billingSample("2026-10-03", () => `s${++k}`);
    const keys = s.docs.map((d) => `${d.type}|${d.no}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const inv of s.docs.filter((d) => d.type === "INV")) expect(balance(inv)).toBeGreaterThanOrEqual(0);
    expect(s.docs.filter((d) => d.type === "RC").length).toBeGreaterThan(5);
    expect(s.customers).toHaveLength(5);
  });
});
