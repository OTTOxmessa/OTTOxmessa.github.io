import { describe, expect, it } from "vitest";
import * as dorm from "./dorm";
import * as kb from "./kanban";
import * as pos from "./pos";
import * as srs from "./srs";

let n = 0;
const id = () => `id${++n}`;

/* ---------------------------------- POS ---------------------------------- */
describe("POS", () => {
  const products: pos.Product[] = [
    { id: "latte", name: "ลาเต้", price: 55, category: "กาแฟ", stock: null, lowStock: 0 },
    { id: "cake", name: "เค้กช็อก", price: 65.5, category: "เบเกอรี่", stock: 5, lowStock: 2 },
  ];

  it("adds to cart, merges lines and sets qty", () => {
    let cart = pos.addToCart([], products[0]!);
    cart = pos.addToCart(cart, products[0]!);
    cart = pos.addToCart(cart, products[1]!);
    expect(cart.map((l) => l.qty)).toEqual([2, 1]);
    expect(pos.setQty(cart, "latte", 0).map((l) => l.productId)).toEqual(["cake"]);
  });

  it("computes totals with amount or percent discounts without float drift", () => {
    const cart = [{ productId: "cake", name: "x", price: 65.5, qty: 3 }];
    expect(pos.totals(cart)).toMatchObject({ subtotal: 196.5, total: 196.5, items: 3 });
    expect(pos.totals(cart, { type: "percent", value: 10 })).toMatchObject({ discount: 19.65, total: 176.85 });
    expect(pos.totals(cart, { type: "amount", value: 999 }).total).toBe(0);
  });

  it("suggests quick cash amounts and computes change", () => {
    expect(pos.quickCash(176.85)).toEqual([177, 180, 200, 500, 1000]);
    expect(pos.change(176.85, 200)).toBe(23.15);
    expect(pos.change(176.85, 100)).toBeNull();
  });

  it("checks out: numbers bills, deducts stock, refuses short cash", () => {
    const cart = [{ productId: "cake", name: "เค้ก", price: 65.5, qty: 2 }, { productId: "latte", name: "ลาเต้", price: 55, qty: 1 }];
    const { products: after, sale } = pos.checkout(products, [], cart, { type: "amount", value: 0 }, "cash", 200, "s1", new Date(2026, 8, 29, 10, 15));
    expect(sale.no).toBe(1);
    expect(sale.total).toBe(186);
    expect(sale.change).toBe(14);
    expect(after.find((p) => p.id === "cake")!.stock).toBe(3);
    expect(after.find((p) => p.id === "latte")!.stock).toBeNull();
    expect(() => pos.checkout(products, [], cart, { type: "amount", value: 0 }, "cash", 100, "s2", new Date())).toThrow();
  });

  it("warns about insufficient stock", () => {
    expect(pos.stockProblems(products, [{ productId: "cake", name: "x", price: 1, qty: 9 }])).toEqual([{ name: "เค้กช็อก", want: 9, have: 5 }]);
  });

  it("voiding restores stock and excludes the bill from reports", () => {
    const cart = [{ productId: "cake", name: "เค้ก", price: 65.5, qty: 2 }];
    const a = pos.checkout(products, [], cart, { type: "amount", value: 0 }, "promptpay", null, "s1", new Date(2026, 8, 29, 9, 5));
    const b = pos.checkout(a.products, [a.sale], [{ productId: "latte", name: "ลาเต้", price: 55, qty: 1 }], { type: "amount", value: 0 }, "cash", 55, "s2", new Date(2026, 8, 29, 14, 0));
    const sales = [a.sale, b.sale];
    const v = pos.voidSale(b.products, sales, "s1");
    expect(v.products.find((p) => p.id === "cake")!.stock).toBe(5);
    const sum = pos.daySummary(v.sales, "2026-09-29");
    expect(sum).toMatchObject({ count: 1, total: 55, voided: 1, byMethod: { cash: 55, promptpay: 0 } });
    expect(sum.hourly[14]).toBe(55);
    expect(b.sale.no).toBe(2);
  });

  it("lists low stock and exports CSV with a BOM", () => {
    expect(pos.lowStock([{ ...products[1]!, stock: 1 }]).map((p) => p.id)).toEqual(["cake"]);
    expect(pos.salesCsv([]).startsWith("﻿no,")).toBe(true);
  });
});

/* ---------------------------------- Dorm ---------------------------------- */
describe("Dorm", () => {
  const st: dorm.Settings = { name: "หอ", waterRate: 18, waterMin: 100, electricRate: 8, dueDay: 5, promptpay: "", note: "" };
  const room: dorm.Room = { id: "r1", number: "101", rent: 3500, tenant: { name: "ก", phone: "" }, extras: [{ name: "อินเทอร์เน็ต", amount: 200 }] };
  const readings: dorm.Reading[] = [
    { roomId: "r1", month: "2026-08", water: 120, electric: 5400 },
    { roomId: "r1", month: "2026-09", water: 128, electric: 5530 },
  ];

  it("computes usage and flags a lower reading", () => {
    expect(dorm.units(120, 128)).toEqual({ units: 8, error: null });
    expect(dorm.units(120, 110).error).toBeTruthy();
    expect(dorm.units(null, 5).error).toBeTruthy();
  });

  it("builds an invoice: rent + water (with minimum) + electricity + extras", () => {
    const inv = dorm.buildInvoice(room, readings[0]!, readings[1]!, st, "2026-09", "i1");
    expect(inv.lines.map((l) => l.amount)).toEqual([3500, 144, 1040, 200]);
    expect(inv.total).toBe(4884);
    const low = dorm.buildInvoice(room, readings[0]!, { ...readings[1]!, water: 121 }, st, "2026-09", "i2");
    expect(low.lines[1]).toMatchObject({ amount: 100 });
    expect(low.lines[1]!.detail).toContain("ขั้นต่ำ");
  });

  it("generates invoices only for occupied rooms and never overwrites paid ones", () => {
    const vacant: dorm.Room = { ...room, id: "r2", number: "102", tenant: null };
    const first = dorm.generateInvoices([room, vacant], readings, [], st, "2026-09", id);
    expect(first.created).toBe(1);
    expect(first.problems).toEqual([]);
    const paid = first.invoices.map((i) => ({ ...i, status: "paid" as const }));
    const again = dorm.generateInvoices([room], readings, paid, st, "2026-09", id, true);
    expect(again.created).toBe(0);
  });

  it("reports missing meter readings", () => {
    const r = dorm.generateInvoices([room], [readings[0]!], [], st, "2026-09", id);
    expect(r.problems.map((p) => p.message)).toEqual(["น้ำ: ยังไม่ได้จด", "ไฟ: ยังไม่ได้จด"]);
  });

  it("counts overdue days after the due day of the next month", () => {
    const inv: dorm.Invoice = { id: "x", roomId: "r1", month: "2026-09", lines: [], total: 1, status: "unpaid", paidAt: null };
    expect(dorm.daysOverdue(inv, st, "2026-10-05")).toBe(0);
    expect(dorm.daysOverdue(inv, st, "2026-10-12")).toBe(7);
    expect(dorm.daysOverdue({ ...inv, status: "paid" }, st, "2026-12-01")).toBe(0);
  });

  it("summarises a month", () => {
    const { invoices } = dorm.generateInvoices([room, { ...room, id: "r2", number: "102", tenant: null }], readings, [], st, "2026-09", id);
    const rep = dorm.monthReport([room, { ...room, id: "r2", tenant: null }], invoices, "2026-09");
    expect(rep).toMatchObject({ occupancy: 50, billed: 4884, collected: 0, outstanding: 4884, water: 144, electric: 1040 });
  });

  it("walks months backwards across years", () => {
    expect(dorm.prevMonth("2027-01")).toBe("2026-12");
    expect(dorm.lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

/* ---------------------------------- Kanban ---------------------------------- */
describe("Kanban", () => {
  const card = (cid: string, extra: Partial<kb.Card> = {}): kb.Card => ({ id: cid, title: cid, description: "", labelIds: [], due: null, checklist: [], createdAt: "2026-09-29", ...extra });
  function sample() {
    let b = kb.newBoard("b", "งาน", id);
    const [todo, doing] = b.columns;
    b = kb.addCard(b, todo!.id, card("A"));
    b = kb.addCard(b, todo!.id, card("B"));
    b = kb.addCard(b, doing!.id, card("C"));
    return b;
  }

  it("moves cards across columns and clamps the index", () => {
    const b = sample();
    const moved = kb.moveCard(b, "A", b.columns[1]!.id, 99);
    expect(moved.columns[0]!.cardIds).toEqual(["B"]);
    expect(moved.columns[1]!.cardIds).toEqual(["C", "A"]);
    expect(b.columns[0]!.cardIds).toEqual(["A", "B"]); // immutable
  });

  it("nudges with the keyboard", () => {
    let b = sample();
    b = kb.nudge(b, "B", "up");
    expect(b.columns[0]!.cardIds).toEqual(["B", "A"]);
    b = kb.nudge(b, "B", "right");
    expect(b.columns[1]!.cardIds).toEqual(["B", "C"]);
    expect(kb.nudge(b, "B", "up")).toEqual(b);
  });

  it("deletes cards and columns (with their cards)", () => {
    const b = sample();
    expect(Object.keys(kb.deleteCard(b, "A").cards)).toEqual(["B", "C"]);
    const noTodo = kb.deleteColumn(b, b.columns[0]!.id);
    expect(noTodo.columns).toHaveLength(2);
    expect(Object.keys(noTodo.cards)).toEqual(["C"]);
    expect(kb.moveColumn(b, b.columns[0]!.id, 1).columns[1]!.name).toBe("ต้องทำ");
  });

  it("classifies due dates, ignoring the done column", () => {
    expect(kb.dueState(card("x", { due: "2026-09-28" }), "2026-09-29", false)).toBe("overdue");
    expect(kb.dueState(card("x", { due: "2026-09-29" }), "2026-09-29", false)).toBe("today");
    expect(kb.dueState(card("x", { due: "2026-10-01" }), "2026-09-29", false)).toBe("soon");
    expect(kb.dueState(card("x", { due: "2026-09-01" }), "2026-09-29", true)).toBeNull();
  });

  it("filters by text, labels and due", () => {
    const c = card("x", { title: "ทำ API login", labelIds: ["l1"], due: "2026-09-30", checklist: [{ id: "1", text: "JWT", done: false }] });
    const f = (p: Partial<kb.Filter>) => kb.matches(c, { query: "", labelIds: [], due: "all", ...p }, "2026-09-29");
    expect(f({ query: "jwt" })).toBe(true);
    expect(f({ query: "css" })).toBe(false);
    expect(f({ labelIds: ["l1"] })).toBe(true);
    expect(f({ labelIds: ["l2"] })).toBe(false);
    expect(f({ due: "week" })).toBe(true);
    expect(f({ due: "overdue" })).toBe(false);
  });

  it("computes progress and board stats, and validates imports", () => {
    expect(kb.progress(card("x", { checklist: [{ id: "1", text: "a", done: true }, { id: "2", text: "b", done: false }] }))).toEqual({ done: 1, total: 2 });
    const b = sample();
    expect(kb.boardStats(b, "2026-09-29")).toMatchObject({ total: 3, done: 0, percent: 0 });
    expect(kb.isBoard(b)).toBe(true);
    expect(kb.isBoard({ id: "x" })).toBe(false);
  });
});

/* ---------------------------------- SRS ---------------------------------- */
describe("Flashcards (SM-2)", () => {
  const today = "2026-09-29";

  it("follows the SM-2 interval ladder 1 → 6 → interval × ease", () => {
    let c = srs.newCard("c", "apple", "แอปเปิล");
    c = srs.review(c, "good", today);
    expect([c.interval, c.due]).toEqual([1, "2026-09-30"]);
    c = srs.review(c, "good", c.due!);
    expect(c.interval).toBe(6);
    c = srs.review(c, "good", c.due!);
    expect(c.interval).toBe(15); // 6 × 2.5
  });

  it("resets on 'again' and lowers ease, never below 1.3", () => {
    let c = srs.newCard("c", "a", "b");
    c = srs.review(srs.review(c, "good", today), "good", today);
    const lapsed = srs.review(c, "again", today);
    expect(lapsed).toMatchObject({ reps: 0, interval: 1, lapses: 1 });
    expect(lapsed.ease).toBeLessThan(c.ease);
    let hard = c;
    for (let i = 0; i < 20; i++) hard = srs.review(hard, "again", today);
    expect(hard.ease).toBe(1.3);
  });

  it("easy grows faster than good, hard slower", () => {
    const base = srs.review(srs.review(srs.newCard("c", "a", "b"), "good", today), "good", today);
    const p = srs.preview(base, today);
    expect(p.hard).toBeLessThan(p.good);
    expect(p.easy).toBeGreaterThan(p.good);
    expect(p.again).toBe(1);
  });

  it("builds today's queue: due first, then a limited number of new cards", () => {
    const deck: srs.Deck = {
      id: "d",
      name: "d",
      newPerDay: 2,
      cards: [
        srs.newCard("n1", "a", "1"), srs.newCard("n2", "b", "2"), srs.newCard("n3", "c", "3"),
        { ...srs.newCard("d1", "d", "4"), due: "2026-09-28", interval: 3, reps: 1 },
        { ...srs.newCard("f1", "e", "5"), due: "2026-10-10", interval: 20, reps: 3 },
      ],
    };
    expect(srs.queue(deck, today).map((c) => c.id)).toEqual(["d1", "n1", "n2"]);
    expect(srs.queue(deck, today, 2).map((c) => c.id)).toEqual(["d1"]);
    expect(srs.deckStats(deck, today)).toMatchObject({ total: 5, fresh: 3, due: 1 });
    expect(srs.forecast(deck, today, 12).at(-1)).toEqual({ day: "2026-10-10", count: 1 });
  });

  it("imports tab, comma (with quotes) and dash separated text", () => {
    expect(srs.parseCards("cat\tแมว\ndog\tสุนัข")).toEqual([{ front: "cat", back: "แมว" }, { front: "dog", back: "สุนัข" }]);
    expect(srs.parseCards('front,back\n"fork()","สร้าง process, ลูก"')).toEqual([{ front: "fork()", back: "สร้าง process, ลูก" }]);
    expect(srs.parseCards("TCP - เชื่อถือได้\nUDP - เร็ว")).toHaveLength(2);
  });

  it("makes multiple-choice options that include the answer once", () => {
    const deck: srs.Deck = { id: "d", name: "d", newPerDay: 10, cards: ["1", "2", "3", "4", "5"].map((x) => srs.newCard(x, `q${x}`, `a${x}`)) };
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const opts = srs.choices(deck, deck.cards[0]!, random);
    expect(opts).toHaveLength(4);
    expect(opts.filter((o) => o === "a1")).toHaveLength(1);
    expect(new Set(opts).size).toBe(4);
  });
});
