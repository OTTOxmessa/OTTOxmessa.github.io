import { describe, expect, it } from "vitest";
import { rebalance, SAMPLE, validate, type Holding } from "./index";

const two: Holding[] = [
  { id: "a", name: "A", value: 70, target: 50 },
  { id: "b", name: "B", value: 30, target: 50 },
];

describe("validate", () => {
  it("requires targets to add up to 100%", () => {
    expect(validate([{ ...two[0]!, target: 60 }, two[1]!], { cash: 0, allowSell: true })).toEqual([{ kind: "targets", sum: 110 }]);
    expect(validate(two, { cash: 0, allowSell: true })).toEqual([]);
  });
  it("flags negative numbers and empty portfolios", () => {
    expect(validate([], { cash: 0, allowSell: true })).toContainEqual({ kind: "empty" });
    expect(validate([{ ...two[0]!, value: -1 }, two[1]!], { cash: 0, allowSell: true })).toContainEqual({ kind: "negative", id: "a" });
  });
});

describe("rebalance with selling", () => {
  it("brings every holding exactly to target", () => {
    const r = rebalance(two, { cash: 0, allowSell: true });
    expect(r.trades.map((t) => t.delta)).toEqual([-20, 20]);
    expect(r.maxDriftBefore).toBe(20);
    expect(r.maxDriftAfter).toBe(0);
  });
  it("deltas sum to the cash added", () => {
    const r = rebalance(SAMPLE, { cash: 10000, allowSell: true });
    expect(r.trades.reduce((s, t) => s + t.delta, 0)).toBeCloseTo(10000, 1);
  });
});

describe("rebalance buy-only", () => {
  it("never sells", () => {
    const r = rebalance(SAMPLE, { cash: 5000, allowSell: false });
    expect(r.trades.every((t) => t.delta >= 0)).toBe(true);
  });
  it("splits scarce cash by deficit", () => {
    const r = rebalance(two, { cash: 10, allowSell: false });
    expect(r.trades.map((t) => t.delta)).toEqual([0, 10]);
  });
  it("reaches target exactly when nothing is overweight", () => {
    // total 160 → targets 80/80 → A +10, B +50
    const r = rebalance(two, { cash: 60, allowSell: false });
    expect(r.trades.map((t) => t.delta)).toEqual([10, 50]);
    expect(r.maxDriftAfter).toBe(0);
    expect(r.leftoverCash).toBe(0);
  });
  it("spends all the cash", () => {
    const r = rebalance(SAMPLE, { cash: 7777, allowSell: false });
    expect(r.trades.reduce((s, t) => s + t.delta, 0)).toBeCloseTo(7777, 1);
  });
  it("reduces drift compared to before", () => {
    const r = rebalance(SAMPLE, { cash: 20000, allowSell: false });
    expect(r.maxDriftAfter).toBeLessThan(r.maxDriftBefore);
  });
});
