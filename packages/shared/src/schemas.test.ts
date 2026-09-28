import { describe, expect, it } from "vitest";
import { contactSchema, localizedSchema, projectMetaSchema, slugSchema } from "./index";

const base = {
  title: "ระบบจอง",
  summary: { th: "สรุป", en: "Summary" },
  role: "Backend",
  year: 2026,
  status: "done",
  layers: ["backend"],
  stack: ["Express"],
};

describe("localizedSchema", () => {
  it("uses Thai text as English fallback", () => {
    expect(localizedSchema.parse("สวัสดี")).toEqual({ th: "สวัสดี", en: "สวัสดี" });
    expect(localizedSchema.parse({ th: "ก" })).toEqual({ th: "ก", en: "ก" });
  });
});

describe("projectMetaSchema", () => {
  it("applies defaults", () => {
    const p = projectMetaSchema.parse(base);
    expect(p.published).toBe(true);
    expect(p.featured).toBe(false);
    expect(p.links).toEqual({});
  });

  it("rejects unknown layers", () => {
    expect(projectMetaSchema.safeParse({ ...base, layers: ["mobile"] }).success).toBe(false);
  });

  it("rejects summaries over 200 characters", () => {
    expect(projectMetaSchema.safeParse({ ...base, summary: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects invalid links", () => {
    expect(projectMetaSchema.safeParse({ ...base, links: { github: "not a url" } }).success).toBe(false);
  });
});

describe("slugSchema", () => {
  it.each(["resort-booking", "a1"])("accepts %s", (s) => expect(slugSchema.safeParse(s).success).toBe(true));
  it.each(["Resort", "a_b", "-a", "a--b"])("rejects %s", (s) => expect(slugSchema.safeParse(s).success).toBe(false));
});

describe("contactSchema", () => {
  it("validates email and body length", () => {
    expect(contactSchema.safeParse({ name: "A", email: "x", body: "hello world!" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "A", email: "a@b.co", body: "hello world!" }).success).toBe(true);
  });
});

describe("snippet & metric", () => {
  it("accepts optional snippet and metric", () => {
    const p = projectMetaSchema.parse({
      ...base,
      snippet: { file: "a.ts", code: "x()" },
      metric: { label: "TEAM", value: "6" },
    });
    expect(p.metric?.value).toBe("6");
  });

  it("rejects metric values that would overflow the badge", () => {
    expect(projectMetaSchema.safeParse({ ...base, metric: { label: "TEAM", value: "123456789" } }).success).toBe(false);
  });
});

describe("lab path", () => {
  it("accepts /lab/<slug>/ only", () => {
    expect(projectMetaSchema.safeParse({ ...base, lab: "/lab/rebalancer/" }).success).toBe(true);
    expect(projectMetaSchema.safeParse({ ...base, lab: "https://x.com" }).success).toBe(false);
  });
});
