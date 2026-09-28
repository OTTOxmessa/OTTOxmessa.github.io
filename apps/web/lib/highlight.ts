/**
 * syntax highlight แบบเบาๆ สำหรับหน้าต่างโค้ด (ทำตอน build ไม่มี JS ส่งไป browser)
 * รองรับ JS/TS, Java, C, YAML พอประมาณ — ไม่ได้ตั้งใจให้สมบูรณ์แบบ
 */
const KEYWORDS = new Set(
  "const let var function return await async export import from new if else for while struct public private static class interface type extends implements true false null undefined void int long".split(
    " ",
  ),
);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TOKEN =
  /(\/\/.*$|#.*$)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?(?:ms|s|kb|%)?\b)|(@[A-Za-z]+)|(\$?[A-Za-z_][\w$]*)(?=\s*\()|(\$?[A-Za-z_][\w$]*)/gm;

export function highlight(code: string, file = ""): string {
  const hashComments = /\.(ya?ml|sh|py)$/.test(file);
  return code
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      let out = "";
      let last = 0;
      for (const m of line.matchAll(TOKEN)) {
        const [text, comment, str, num, anno, fn, ident] = m;
        const at = m.index ?? 0;
        if (comment && comment.startsWith("#") && !hashComments) continue;
        out += esc(line.slice(last, at));
        last = at + text.length;
        if (comment) out += `<span class="tk-c">${esc(comment)}</span>`;
        else if (str) out += `<span class="tk-s">${esc(str)}</span>`;
        else if (num) out += `<span class="tk-n">${esc(num)}</span>`;
        else if (anno) out += `<span class="tk-k">${esc(anno)}</span>`;
        else if (fn) out += KEYWORDS.has(fn) ? `<span class="tk-k">${esc(fn)}</span>` : `<span class="tk-f">${esc(fn)}</span>`;
        else if (ident && KEYWORDS.has(ident)) out += `<span class="tk-k">${esc(ident)}</span>`;
        else out += esc(text);
      }
      return out + esc(line.slice(last));
    })
    .join("\n");
}
