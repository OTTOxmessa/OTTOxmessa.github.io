import { describe, expect, it } from "vitest";
import { cumulative, formatGpa, honors, requiredAverage, termStats } from "./gpa";

const c = (credits: number, grade: string) => ({ id: grade + credits + Math.random(), code: "X", credits, grade });

describe("GPA", () => {
  it("weights by credits", () => {
    const s = termStats([c(3, "A"), c(3, "B"), c(1, "C")]);
    expect(s.gpa).toBeCloseTo((12 + 9 + 2) / 7);
    expect(formatGpa(s.gpa)).toBe("3.28");
  });

  it("ignores S/U/W/I in the average", () => {
    const s = termStats([c(3, "A"), c(1, "S"), c(3, "W")]);
    expect(s.gpa).toBe(4);
    expect(s.gradedCredits).toBe(3);
    expect(s.earnedCredits).toBe(4);
  });

  it("F counts in the average but not in earned credits", () => {
    const s = termStats([c(3, "A"), c(3, "F")]);
    expect(s.gpa).toBe(2);
    expect(s.earnedCredits).toBe(3);
  });

  it("truncates instead of rounding", () => {
    expect(formatGpa(3.249)).toBe("3.24");
    expect(formatGpa(null)).toBe("–");
  });

  it("combines terms", () => {
    expect(cumulative([{ id: "1", name: "1/67", courses: [c(3, "A")] }, { id: "2", name: "2/67", courses: [c(3, "C")] }]).gpa).toBe(3);
  });
});

describe("requiredAverage", () => {
  const now = termStats([c(60, "B")]); // 60 หน่วยกิต เกรด 3.00
  it("computes the average needed", () => {
    expect(requiredAverage(now, 3.25, 60)?.need).toBeCloseTo(3.5);
  });
  it("flags impossible targets", () => {
    expect(requiredAverage(now, 3.9, 20)?.possible).toBe(false);
  });
  it("detects targets already reached", () => {
    expect(requiredAverage(now, 2.5, 30)?.alreadyThere).toBe(false);
    expect(requiredAverage(termStats([c(100, "A")]), 2, 10)?.alreadyThere).toBe(true);
  });
});

describe("honors", () => {
  it("uses the common thresholds", () => {
    expect(honors(3.6)).toBe("first");
    expect(honors(3.599)).toBe("second");
    expect(honors(3.1)).toBeNull();
  });
});
