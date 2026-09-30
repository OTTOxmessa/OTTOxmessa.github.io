import { describe, expect, it } from "vitest";
import {
  closePO,
  dailyUsage,
  daysOfCover,
  draftPOs,
  inventorySummary,
  issue,
  ledger,
  levelOf,
  levels,
  nextPoNumber,
  onOrder,
  poTotal,
  receive,
  receivePO,
  stockCount,
  stockCsv,
  stockState,
  suggestions,
  type Movement,
  type Product,
  type PurchaseOrder,
  type Supplier,
} from "./inventory";

let n = 0;
const id = () => `id${++n}`;
const prod = (over: Partial<Product> = {}): Product => ({
  id: id(), sku: "A-1", name: "เมล็ดกาแฟ 1kg", category: "วัตถุดิบ", unit: "ถุง", price: 0,
  reorderPoint: 5, reorderQty: 10, supplierId: "s1", lastCost: 400, active: true, ...over,
});
const sup: Supplier = { id: "s1", name: "โรงคั่วดอยช้าง", contact: "", phone: "", email: "", leadDays: 3, note: "" };

describe("inventory: levels and moving-average cost", () => {
  it("averages cost across receipts and keeps it on issues", () => {
    const p = prod();
    let mv: Movement[] = [];
    mv = [...mv, receive(mv, p.id, 10, 400, "2026-09-01", "purchase", "", id())];
    mv = [...mv, receive(mv, p.id, 10, 460, "2026-09-02", "purchase", "", id())];
    expect(levelOf(levels(mv), p.id)).toEqual({ qty: 20, avgCost: 430, value: 8600 });
    mv = [...mv, issue(mv, p.id, 5, "2026-09-03", "use", "", id())];
    expect(levelOf(levels(mv), p.id)).toEqual({ qty: 15, avgCost: 430, value: 6450 });
    mv = [...mv, receive(mv, p.id, 5, 490, "2026-09-04", "purchase", "", id())];
    expect(levelOf(levels(mv), p.id).avgCost).toBe(445); // (15×430 + 5×490) / 20
    expect(levelOf(levels(mv, "2026-09-02"), p.id).qty).toBe(20); // as of a past date
  });
  it("refuses to issue more than on hand, and orders same-day moves by sequence", () => {
    const p = prod();
    let mv: Movement[] = [receive([], p.id, 3, 100, "2026-09-01", "opening", "", id())];
    expect(mv[0]!.type).toBe("opening");
    expect(() => issue(mv, p.id, 4, "2026-09-01", "sale", "", id())).toThrow("สต็อกไม่พอ");
    mv = [...mv, issue(mv, p.id, 3, "2026-09-01", "sale", "", id())];
    expect(mv.map((m) => m.seq)).toEqual([1, 2]);
    expect(ledger(mv, p.id).map((r) => r.balance)).toEqual([0, 3]);
  });
  it("counts stock and creates adjustments only where the count differs", () => {
    const a = prod(), b = prod({ sku: "B" });
    const mv: Movement[] = [receive([], a.id, 10, 50, "2026-09-01", "purchase", "", id()), receive([], b.id, 4, 20, "2026-09-01", "purchase", "", id())];
    const adj = stockCount(mv, { [a.id]: 8, [b.id]: 4 }, "2026-09-05", id);
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ productId: a.id, qty: -2, type: "adjust", reason: "count" });
  });
});

describe("inventory: reorder and purchase orders", () => {
  it("states stock as out / low / ok / inactive", () => {
    const p = prod();
    expect([stockState(p, 0), stockState(p, 5), stockState(p, 6), stockState({ ...p, active: false }, 0)]).toEqual(["out", "low", "ok", "inactive"]);
  });
  it("suggests reorders counting stock already on order, rounded up to the pack size", () => {
    const p = prod({ reorderPoint: 12, reorderQty: 10 });
    const mv = [receive([], p.id, 4, 400, "2026-09-01", "purchase", "", id())];
    const s1 = suggestions([p], levels(mv), []);
    expect(s1[0]).toMatchObject({ onHand: 4, onOrder: 0, suggest: 10 }); // need 9 → 1 pack
    const po: PurchaseOrder = { id: id(), no: "PO-1", supplierId: "s1", date: "2026-09-01", expected: null, status: "ordered", lines: [{ productId: p.id, qty: 10, unitCost: 400, received: 0 }], note: "" };
    expect(onOrder([po]).get(p.id)).toBe(10);
    expect(suggestions([p], levels(mv), [po])).toHaveLength(0); // 4 + 10 > 12
    const big = prod({ reorderPoint: 30, reorderQty: 12 });
    expect(suggestions([big], levels([]), [])[0]!.suggest).toBe(36); // need 31 → 3 packs
  });
  it("drafts one PO per supplier with running numbers and expected dates", () => {
    const a = prod(), b = prod({ supplierId: "s2" }), c = prod({ supplierId: null });
    const drafts = draftPOs(suggestions([a, b, c], levels([]), []), [], [sup, { ...sup, id: "s2", leadDays: 7 }], "2026-09-10", id);
    expect(drafts.map((d) => d.no)).toEqual(["PO-202609-001", "PO-202609-002"]);
    expect(drafts.map((d) => d.expected)).toEqual(["2026-09-13", "2026-09-17"]);
    expect(nextPoNumber(drafts, "2026-10-01")).toBe("PO-202610-001");
    expect(poTotal(drafts[0]!)).toBe(4000);
  });
  it("receives POs partially then fully, at PO cost, never over the ordered qty", () => {
    const a = prod(), b = prod();
    let po: PurchaseOrder = { id: id(), no: "PO-202609-001", supplierId: "s1", date: "2026-09-01", expected: null, status: "draft", lines: [{ productId: a.id, qty: 10, unitCost: 400, received: 0 }, { productId: b.id, qty: 5, unitCost: 99.5, received: 0 }], note: "" };
    expect(() => receivePO(po, { [a.id]: 1 }, "2026-09-02", [], id)).toThrow();
    po = { ...po, status: "ordered" };
    const r1 = receivePO(po, { [a.id]: 6 }, "2026-09-03", [], id);
    expect(r1.po.status).toBe("partial");
    expect(r1.moves[0]).toMatchObject({ qty: 6, unitCost: 400, ref: "PO-202609-001" });
    expect(() => receivePO(r1.po, { [a.id]: 5 }, "2026-09-04", r1.moves, id)).toThrow("เกิน");
    const r2 = receivePO(r1.po, { [a.id]: 4, [b.id]: 5 }, "2026-09-04", r1.moves, id);
    expect(r2.po.status).toBe("received");
    expect(levelOf(levels([...r1.moves, ...r2.moves]), b.id)).toEqual({ qty: 5, avgCost: 99.5, value: 497.5 });
    const partial = receivePO(po, { [a.id]: 2 }, "2026-09-03", [], id).po;
    expect(closePO(partial)).toMatchObject({ status: "received" });
    expect(onOrder([closePO(partial)]).get(a.id)).toBeUndefined();
  });
});

describe("inventory: reports", () => {
  it("computes usage, days of cover, summary value and CSV", () => {
    const p = prod({ reorderPoint: 2 });
    let mv: Movement[] = [receive([], p.id, 30, 100, "2026-09-01", "purchase", "", id())];
    for (let d = 1; d <= 10; d++) mv = [...mv, issue(mv, p.id, 1, `2026-09-${String(d + 1).padStart(2, "0")}`, "use", "", id())];
    const u = dailyUsage(mv, p.id, "2026-09-30", 10); // nothing in the last 10 days
    expect(u).toBe(0);
    const u30 = dailyUsage(mv, p.id, "2026-09-30", 30);
    expect(u30).toBeCloseTo(10 / 30, 4);
    expect(daysOfCover(20, u30)).toBe(60);
    expect(daysOfCover(20, 0)).toBeNull();
    const s = inventorySummary([p], mv, [], "2026-09-30");
    expect(s).toMatchObject({ skus: 1, value: 2000, low: 0, out: 0, received: 3000, issuedCost: 1000 });
    expect(stockCsv([p], mv)).toContain("A-1,เมล็ดกาแฟ 1kg,วัตถุดิบ,ถุง,20,100,2000,2,ok");
  });
});
