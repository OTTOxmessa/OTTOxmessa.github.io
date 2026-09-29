import { describe, expect, it } from "vitest";
import { allocate, splitBill, summaryText, type BillInput } from "./bill";

const people = [
  { id: "a", name: "เอ" },
  { id: "b", name: "บี" },
  { id: "c", name: "ซี" },
];
const base: BillInput = { people, items: [], discount: 0, servicePct: 0, vatPct: 0, roundUp: false };
const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe("allocate", () => {
  it("always sums to the original total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(allocate(1001, [3, 5, 7]))).toBe(1001);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });
});

describe("splitBill", () => {
  it("splits a shared item evenly and an individual item to its owner", () => {
    const r = splitBill({
      ...base,
      items: [
        { id: "1", name: "หมูกระทะ", price: 300, qty: 1, sharedBy: ["a", "b", "c"] },
        { id: "2", name: "ชาไทย", price: 45, qty: 1, sharedBy: ["b"] },
      ],
    });
    expect(r.shares.map((s) => s.total)).toEqual([100, 145, 100]);
    expect(r.total).toBe(345);
  });

  it("applies service charge before VAT like Thai restaurants", () => {
    const r = splitBill({ ...base, servicePct: 10, vatPct: 7, items: [{ id: "1", name: "x", price: 1000, qty: 1, sharedBy: [] }] });
    expect(r.service).toBe(100);
    expect(r.vat).toBe(77);
    expect(r.total).toBe(1177);
    expect(r.unassigned).toEqual(["x"]);
  });

  it("people's totals always add up to the bill total", () => {
    const r = splitBill({
      ...base,
      servicePct: 10,
      vatPct: 7,
      discount: 33.33,
      items: [
        { id: "1", name: "a", price: 99.99, qty: 3, sharedBy: ["a", "c"] },
        { id: "2", name: "b", price: 17, qty: 1, sharedBy: ["b"] },
        { id: "3", name: "c", price: 250, qty: 1, sharedBy: [] },
      ],
    });
    expect(sum(r.shares.map((s) => s.total))).toBe(r.total);
  });

  it("splits the discount in proportion to what each person ate", () => {
    const r = splitBill({
      ...base,
      discount: 30,
      items: [
        { id: "1", name: "a", price: 200, qty: 1, sharedBy: ["a"] },
        { id: "2", name: "b", price: 100, qty: 1, sharedBy: ["b"] },
      ],
    });
    expect(r.shares.map((s) => s.discount)).toEqual([20, 10, 0]);
  });

  it("can round each person up to whole baht", () => {
    const r = splitBill({ ...base, roundUp: true, items: [{ id: "1", name: "a", price: 100, qty: 1, sharedBy: [] }] });
    expect(r.shares.map((s) => s.total)).toEqual([34, 34, 34]);
  });

  it("builds a LINE-friendly summary", () => {
    const r = splitBill({ ...base, items: [{ id: "1", name: "a", price: 90, qty: 1, sharedBy: [] }] });
    expect(summaryText(r, "เอ")).toContain("โอนให้ เอ");
  });
});
