/**
 * คำนวณการปรับสมดุลพอร์ต (rebalancing)
 * - allowSell = true  → ซื้อ/ขายให้ตรงเป้าทุกตัว
 * - allowSell = false → ใช้เงินสดที่เติมเข้ามาซื้อตัวที่ต่ำกว่าเป้าเท่านั้น (ไม่ต้องขาย = ไม่เสียภาษี/ค่าธรรมเนียมขาย)
 */
export type Holding = { id: string; name: string; value: number; target: number };
export type Options = { cash: number; allowSell: boolean };

export type Trade = {
  id: string;
  name: string;
  current: number;
  delta: number;
  after: number;
  currentPct: number;
  targetPct: number;
  afterPct: number;
};

export type Result = {
  total: number;
  trades: Trade[];
  leftoverCash: number;
  maxDriftBefore: number;
  maxDriftAfter: number;
};

export type Issue =
  | { kind: "targets"; sum: number }
  | { kind: "negative"; id: string }
  | { kind: "empty" }
  | { kind: "cash" };

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export function validate(holdings: Holding[], opts: Options): Issue[] {
  const issues: Issue[] = [];
  if (holdings.length === 0) issues.push({ kind: "empty" });
  for (const h of holdings) {
    if (!(h.value >= 0) || !(h.target >= 0)) issues.push({ kind: "negative", id: h.id });
  }
  const sum = round2(holdings.reduce((s, h) => s + (h.target || 0), 0));
  if (holdings.length && Math.abs(sum - 100) > 0.01) issues.push({ kind: "targets", sum });
  if (!(opts.cash >= 0)) issues.push({ kind: "cash" });
  return issues;
}

export function rebalance(holdings: Holding[], opts: Options): Result {
  const invested = holdings.reduce((s, h) => s + h.value, 0);
  const total = invested + opts.cash;
  const targets = holdings.map((h) => (total * h.target) / 100);

  let deltas: number[];
  let leftover = 0;

  if (opts.allowSell) {
    deltas = holdings.map((h, i) => targets[i]! - h.value);
  } else {
    // ผลรวมของส่วนที่ขาด (deficit) ≥ เงินสดเสมอ เพราะ Σ(เป้า − ปัจจุบัน) = เงินสด
    // จึงแบ่งเงินสดตามสัดส่วนของส่วนที่ขาดได้เลย ไม่มีตัวไหนเกินเป้า
    const deficits = holdings.map((h, i) => Math.max(0, targets[i]! - h.value));
    const need = deficits.reduce((s, d) => s + d, 0);
    deltas = need > 0 ? deficits.map((d) => (opts.cash * d) / need) : holdings.map(() => 0);
    leftover = opts.cash - deltas.reduce((s, d) => s + d, 0);
  }

  const trades: Trade[] = holdings.map((h, i) => {
    const after = h.value + deltas[i]!;
    return {
      id: h.id,
      name: h.name,
      current: round2(h.value),
      delta: round2(deltas[i]!),
      after: round2(after),
      currentPct: round2(pct(h.value, invested)),
      targetPct: h.target,
      afterPct: round2(pct(after, total - leftover)),
    };
  });

  const drift = (key: "currentPct" | "afterPct") =>
    round2(Math.max(0, ...trades.map((t) => Math.abs(t[key] - t.targetPct))));

  return {
    total: round2(total),
    trades,
    leftoverCash: round2(Math.max(0, leftover)),
    maxDriftBefore: drift("currentPct"),
    maxDriftAfter: drift("afterPct"),
  };
}

export const SAMPLE: Holding[] = [
  { id: "set50", name: "SET50 ETF", value: 42000, target: 30 },
  { id: "sp500", name: "S&P 500 Fund", value: 61000, target: 40 },
  { id: "bond", name: "Thai Gov Bond Fund", value: 14000, target: 20 },
  { id: "gold", name: "Gold", value: 9000, target: 10 },
];
