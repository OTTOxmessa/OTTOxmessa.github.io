import { describe, expect, it } from "vitest";
import { highlight } from "./highlight";

describe("highlight", () => {
  it("marks keywords, strings, functions and comments", () => {
    const html = highlight("const a = run('x'); // go");
    expect(html).toContain('<span class="tk-k">const</span>');
    expect(html).toContain('<span class="tk-f">run</span>');
    expect(html).toContain(`<span class="tk-s">'x'</span>`);
    expect(html).toContain('<span class="tk-c">// go</span>');
  });

  it("escapes HTML so snippets cannot inject markup", () => {
    expect(highlight("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("only treats # as a comment in YAML-like files", () => {
    expect(highlight("- run: x # hi", "ci.yml")).toContain('<span class="tk-c"># hi</span>');
    expect(highlight("a # b", "x.js")).not.toContain("tk-c");
  });

  it("keeps line count", () => {
    expect(highlight("a\nb\nc\n").split("\n")).toHaveLength(3);
  });
});
