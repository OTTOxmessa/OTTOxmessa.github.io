import { describe, expect, it } from "vitest";
import { SCENARIOS, simulate } from "./index";

describe("sandbox simulation", () => {
  it("every scenario starts with fork → limits → seccomp → execve", () => {
    for (const s of SCENARIOS) {
      const calls = simulate(s.id).steps.map((x) => x.call);
      const order = ["fork()", "setrlimit(RLIMIT_CPU", "setrlimit(RLIMIT_AS", "seccomp_load", "execve"].map((c) =>
        calls.findIndex((x) => x.startsWith(c)),
      );
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });

  it("always ends with wait4 collecting the child", () => {
    for (const s of SCENARIOS) expect(simulate(s.id).steps.at(-1)?.call).toMatch(/^wait4/);
  });

  it.each([
    ["ok", "AC"],
    ["tle", "TLE"],
    ["mle", "MLE"],
    ["socket", "SV"],
    ["forkbomb", "SV"],
  ] as const)("%s → %s", (id, code) => {
    expect(simulate(id).verdict.code).toBe(code);
  });

  it("blocked scenarios are killed by SIGSYS", () => {
    expect(simulate("socket").verdict.status).toContain("SIGSYS");
    expect(simulate("forkbomb").steps.some((s) => s.outcome === "blocked")).toBe(true);
  });
});
