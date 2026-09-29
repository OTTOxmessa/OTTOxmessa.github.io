import { describe, expect, it } from "vitest";
import { annuityPayment, byYear, effectiveRate, flatLoan, flatSchedule, reducingSchedule, summarize } from "./loan";

describe("flat rate", () => {
  it("charges interest on the full principal", () => {
    // ผ่อนรถ 500,000 ดอก 2.5% 60 งวด
    expect(flatLoan(500_000, 2.5, 60)).toEqual({ payment: 9375, totalInterest: 62_500, totalPaid: 562_500 });
  });
  it("schedule pays off exactly and interest sums to the total", () => {
    const rows = flatSchedule(500_000, 2.5, 60);
    expect(rows.at(-1)!.balance).toBe(0);
    expect(summarize(rows).totalInterest).toBe(62_500);
    expect(rows[0]!.interest).toBeGreaterThan(rows.at(-1)!.interest); // ตัดดอกหนักช่วงแรก
  });
});

describe("reducing balance", () => {
  it("matches the standard annuity formula", () => {
    expect(annuityPayment(1_000_000, 6, 360)).toBeCloseTo(5995.51, 2);
    expect(annuityPayment(12_000, 0, 12)).toBe(1000);
  });
  it("schedule ends at zero and principal sums to the loan", () => {
    const rows = reducingSchedule(1_000_000, 6, 360);
    expect(rows.at(-1)!.balance).toBe(0);
    expect(Math.round(rows.reduce((s, r) => s + r.principal, 0))).toBe(1_000_000);
    expect(summarize(rows).totalInterest).toBeCloseTo(1_158_381, -2);
  });
});

describe("effective rate", () => {
  it("shows a flat rate is roughly double as an effective rate", () => {
    const { payment } = flatLoan(500_000, 2.5, 60);
    const apr = effectiveRate(500_000, payment, 60);
    expect(apr).toBeGreaterThan(4.6);
    expect(apr).toBeLessThan(4.8);
  });
  it("round-trips with the annuity formula", () => {
    expect(effectiveRate(1_000_000, annuityPayment(1_000_000, 6, 360), 360)).toBeCloseTo(6, 6);
  });
  it("is zero for interest-free plans", () => {
    expect(effectiveRate(10_000, 1000, 10)).toBe(0);
  });
});

describe("byYear", () => {
  it("groups months into years", () => {
    const y = byYear(reducingSchedule(120_000, 5, 24));
    expect(y).toHaveLength(2);
    expect(y[0]!.interest).toBeGreaterThan(y[1]!.interest);
  });
});
