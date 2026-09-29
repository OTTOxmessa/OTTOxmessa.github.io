/** บันทึกรายรับรายจ่าย: สรุปรายเดือน งบประมาณ และนำเข้า/ส่งออก CSV */
export type Kind = "expense" | "income";
export type Entry = { id: string; date: string; kind: Kind; amount: number; category: string; note: string };
export type Budgets = Record<string, number>;

export const EXPENSE_CATEGORIES = ["อาหาร", "เดินทาง", "ที่พัก", "ของใช้", "การเรียน", "บันเทิง", "สุขภาพ", "อื่นๆ"];
export const INCOME_CATEGORIES = ["เงินเดือน/ค่าขนม", "งานพิเศษ", "ของขวัญ", "อื่นๆ"];

export const monthOf = (date: string) => date.slice(0, 7);

export function monthSummary(entries: Entry[], month: string) {
  const list = entries.filter((e) => monthOf(e.date) === month);
  const income = list.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
  const expense = list.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of list) if (e.kind === "expense") byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const categories = [...byCategory].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const days = new Map<string, Entry[]>();
  for (const e of [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))) {
    days.set(e.date, [...(days.get(e.date) ?? []), e]);
  }
  return { income: r2(income), expense: r2(expense), balance: r2(income - expense), categories, days: [...days], count: list.length };
}

export type BudgetStatus = { category: string; budget: number; spent: number; ratio: number; level: "ok" | "warn" | "over" };

export function budgetStatus(entries: Entry[], month: string, budgets: Budgets): BudgetStatus[] {
  const { categories } = monthSummary(entries, month);
  return Object.entries(budgets)
    .filter(([, b]) => b > 0)
    .map(([category, budget]) => {
      const spent = categories.find((c) => c.category === category)?.amount ?? 0;
      const ratio = spent / budget;
      return { category, budget, spent: r2(spent), ratio, level: ratio > 1 ? "over" : ratio >= 0.8 ? "warn" : "ok" } as BudgetStatus;
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** คาดการณ์ใช้จ่ายทั้งเดือนจากค่าเฉลี่ยต่อวันที่ผ่านมา */
export function projectMonth(spent: number, month: string, today: string): number | null {
  if (monthOf(today) !== month) return null;
  const day = Number(today.slice(8, 10));
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y!, m!, 0).getDate();
  return day > 0 ? r2((spent / day) * daysInMonth) : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const HEADER = "date,kind,amount,category,note";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries: Entry[]): string {
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.kind, e.amount, e.category, e.note].map(csvCell).join(","));
  return "\uFEFF" + [HEADER, ...rows].join("\r\n"); // BOM ให้ Excel อ่านภาษาไทยถูก
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** แยกบรรทัดโดยไม่ตัดกลางช่องที่มี " ครอบ (หมายเหตุอาจมีขึ้นบรรทัดใหม่) */
function splitRecords(text: string): string[] {
  const records: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    if (ch === '"') quoted = !quoted;
    if (ch === "\n" && !quoted) { records.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur) records.push(cur);
  return records.filter((r) => r.trim() !== "");
}

export function fromCsv(text: string, makeId: () => string): { entries: Entry[]; errors: number[] } {
  const records = splitRecords(text.replace(/^\uFEFF/, ""));
  const entries: Entry[] = [];
  const errors: number[] = [];
  records.forEach((line, i) => {
    if (i === 0 && line.trim().toLowerCase() === HEADER) return;
    const [date = "", kind = "", amount = "", category = "", note = ""] = parseCsvLine(line);
    const n = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (kind !== "expense" && kind !== "income") || !(n > 0)) {
      errors.push(i + 1);
      return;
    }
    entries.push({ id: makeId(), date, kind, amount: n, category: category || "อื่นๆ", note });
  });
  return { entries, errors };
}
