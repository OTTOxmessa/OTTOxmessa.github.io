import { describe, expect, it } from "vitest";
import { groupCount, makeGroups, parseNames, rng, shuffle } from "./groups";

const names = Array.from({ length: 23 }, (_, i) => `คน${i + 1}`);

describe("parseNames", () => {
  it("trims, drops numbering and duplicates", () => {
    expect(parseNames("1. แพร\n2) บอส\n\nแพร\nมิ้นท์, ต้น ")).toEqual(["แพร", "บอส", "มิ้นท์", "ต้น"]);
  });
});

describe("makeGroups", () => {
  it("keeps group sizes within 1 of each other and uses everyone once", () => {
    const { groups } = makeGroups(names, { groups: 5 }, 1);
    const sizes = groups.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(groups.flat().sort()).toEqual([...names].sort());
  });
  it("can split by group size", () => {
    expect(groupCount(23, { size: 4 })).toBe(6);
    expect(makeGroups(names, { size: 4 }, 1).groups).toHaveLength(6);
  });
  it("is reproducible with the same seed", () => {
    expect(makeGroups(names, { groups: 4 }, 42)).toEqual(makeGroups(names, { groups: 4 }, 42));
    expect(makeGroups(names, { groups: 4 }, 42)).not.toEqual(makeGroups(names, { groups: 4 }, 43));
  });
  it("respects keep-apart pairs", () => {
    const apart: [string, string][] = [["คน1", "คน2"], ["คน3", "คน4"], ["คน1", "คน5"]];
    const { groups, unmet } = makeGroups(names, { groups: 3 }, 7, apart);
    expect(unmet).toBe(0);
    for (const [a, b] of apart) expect(groups.some((g) => g.includes(a) && g.includes(b))).toBe(false);
  });
  it("reports constraints that cannot be met", () => {
    expect(makeGroups(["a", "b"], { groups: 1 }, 1, [["a", "b"]]).unmet).toBe(1);
  });
});

describe("shuffle", () => {
  it("is a permutation", () => {
    expect(shuffle([1, 2, 3, 4], rng(3)).sort()).toEqual([1, 2, 3, 4]);
  });
});
