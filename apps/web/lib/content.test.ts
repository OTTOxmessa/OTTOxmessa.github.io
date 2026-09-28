import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, getProfile, getSkillGroups, getStats, loadProjects } from "./content";

describe("real content in /content", () => {
  it("every project file passes the schema", () => {
    const projects = loadProjects();
    expect(projects.length).toBeGreaterThan(0);
    expect(new Set(projects.map((p) => p.slug)).size).toBe(projects.length);
  });

  it("profile and skills are valid", () => {
    expect(getProfile().email).toContain("@");
    expect(getSkillGroups().length).toBeGreaterThan(0);
  });

  it("stats are derived from published projects", () => {
    const s = getStats();
    expect(s.projects).toBeGreaterThanOrEqual(s.shipped);
    expect(s.layers).toBeGreaterThan(0);
  });

  it("CONTENT_DIR points at the repo content folder", () => {
    expect(fs.existsSync(path.join(CONTENT_DIR, "profile.json"))).toBe(true);
  });
});

describe("loadProjects", () => {
  function tmpContent(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-"));
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
  }

  const fm = (extra = "", status = "done") =>
    `---\ntitle: T\nsummary: S\nrole: R\nyear: 2026\nstatus: ${status}\nlayers: [backend]\nstack: [Go]\n${extra}---\nเนื้อหา`;

  it("falls back to Thai body when en.md is missing and sorts by order", () => {
    const dir = tmpContent({
      "projects/b-proj/index.md": fm("order: 2\n"),
      "projects/a-proj/index.md": fm("order: 1\n"),
    });
    const [first, second] = loadProjects(dir);
    expect(first?.slug).toBe("a-proj");
    expect(second?.content.en).toBe("เนื้อหา");
  });

  it("reports which file and field is invalid", () => {
    const dir = tmpContent({ "projects/bad/index.md": fm("", "finished") });
    expect(() => loadProjects(dir)).toThrow(/projects\/bad\/index\.md[\s\S]*status/);
  });

  it("reports YAML syntax errors with the file name", () => {
    const dir = tmpContent({ "projects/broken/index.md": fm("title: again\n") });
    expect(() => loadProjects(dir)).toThrow(/projects\/broken\/index\.md/);
  });

  it("rejects folder names that are not valid slugs", () => {
    const dir = tmpContent({ "projects/Bad_Name/index.md": fm() });
    expect(() => loadProjects(dir)).toThrow(/Bad_Name/);
  });
});

describe("renderMarkdown", () => {
  it("makes code blocks keyboard-focusable", async () => {
    const { renderMarkdown } = await import("./content");
    expect(renderMarkdown("```\nx\n```")).toContain('<pre tabindex="0">');
  });
});
