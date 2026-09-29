import { describe, expect, it } from "vitest";
import { budgetStatus, fromCsv, monthSummary, projectMonth, toCsv, type Entry } from "./money";

let n = 0;
const id = () => String(++n);
const e = (date: string, kind: Entry["kind"], amount: number, category: string, note = ""): Entry => ({ id: id(), date, kind, amount, category, note });

const data = [
  e("2026-09-01", "income", 8000, "เงินเดือน/ค่าขนม"),
  e("2026-09-02", "expense", 120.5, "อาหาร"),
  e("2026-09-02", "expense", 40, "เดินทาง"),
  e("2026-09-10", "expense", 1500, "การเรียน", 'หนังสือ "OS", ปกแข็ง'),
  e("2026-08-30", "expense", 999, "อาหาร"),
];

describe("monthSummary", () => {
  it("totals one month only", () => {
    const s = monthSummary(data, "2026-09");
    expect(s.income).toBe(8000);
    expect(s.expense).toBe(1660.5);
    expect(s.balance).toBe(6339.5);
    expect(s.categories[0]).toEqual({ category: "การเรียน", amount: 1500 });
    expect(s.days[0]![0]).toBe("2026-09-10");
  });
});

describe("budgetStatus", () => {
  it("marks warn at 80% and over past 100%", () => {
    const st = budgetStatus(data, "2026-09", { อาหาร: 150, เดินทาง: 30, บันเทิง: 500 });
    expect(st.find((b) => b.category === "เดินทาง")?.level).toBe("over");
    expect(st.find((b) => b.category === "อาหาร")?.level).toBe("warn");
    expect(st.find((b) => b.category === "บันเทิง")?.level).toBe("ok");
  });
});

describe("projectMonth", () => {
  it("extrapolates from the average per day", () => {
    expect(projectMonth(300, "2026-09", "2026-09-10")).toBe(900);
    expect(projectMonth(300, "2026-08", "2026-09-10")).toBeNull();
  });
});

describe("CSV", () => {
  it("round-trips including commas, quotes and Thai text", () => {
    const csv = toCsv(data);
    expect(csv.startsWith("\uFEFFdate,kind")).toBe(true);
    const back = fromCsv(csv, id);
    expect(back.errors).toEqual([]);
    expect(back.entries.map(({ id: _i, ...rest }) => rest)).toEqual(
      [...data].sort((a, b) => a.date.localeCompare(b.date)).map(({ id: _i, ...rest }) => rest),
    );
  });

  it("reports bad rows by line number", () => {
    const r = fromCsv("date,kind,amount,category,note\n2026-09-01,expense,50,อาหาร,\nnot-a-date,expense,1,x,\n2026-09-02,gift,1,x,", id);
    expect(r.entries).toHaveLength(1);
    expect(r.errors).toEqual([3, 4]);
  });
});
