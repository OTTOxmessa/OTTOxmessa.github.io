/**
 * หารบิลร้านอาหาร: แต่ละรายการเลือกได้ว่าใครกินบ้าง
 * ลำดับการคิดแบบร้านอาหารไทย: ส่วนลด → ค่าบริการ (service charge) → VAT 7% ของ (ยอด + ค่าบริการ)
 * ใช้หน่วยสตางค์ (จำนวนเต็ม) ตลอด เพื่อให้ยอดของทุกคนรวมกันเท่ายอดบิลพอดี
 */
export type Person = { id: string; name: string };
export type Item = { id: string; name: string; price: number; qty: number; sharedBy: string[] };
export type BillInput = {
  people: Person[];
  items: Item[];
  discount: number;        // บาท (หักก่อนคิดค่าบริการ)
  servicePct: number;      // เช่น 10
  vatPct: number;          // เช่น 7 (0 = ไม่มี)
  roundUp: boolean;        // ปัดเศษขึ้นเป็นบาทเต็ม
};
export type Share = {
  personId: string;
  name: string;
  food: number;
  discount: number;
  service: number;
  vat: number;
  total: number;
  items: { name: string; amount: number }[];
};
export type BillResult = {
  subtotal: number;
  discount: number;
  service: number;
  vat: number;
  total: number;
  shares: Share[];
  unassigned: string[];
};

const toSatang = (baht: number) => Math.round(baht * 100);
const toBaht = (satang: number) => satang / 100;

/** แบ่งจำนวนเต็มตามน้ำหนัก แล้วแจกเศษที่เหลือให้คนที่เศษมากสุด (largest remainder) — ผลรวมเท่าต้นฉบับเสมอ */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => [r - floors[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest -= 1;
  }
  return floors;
}

export function splitBill(input: BillInput): BillResult {
  const ids = input.people.map((p) => p.id);
  const food = new Map(ids.map((id) => [id, 0]));
  const lines = new Map<string, { name: string; amount: number }[]>(ids.map((id) => [id, []]));
  const unassigned: string[] = [];

  for (const item of input.items) {
    const cost = toSatang(item.price * item.qty);
    if (cost <= 0) continue;
    const eaters = item.sharedBy.filter((id) => food.has(id));
    const who = eaters.length ? eaters : ids; // ไม่ได้เลือกใคร = หารทุกคน
    if (!eaters.length) unassigned.push(item.name);
    const parts = allocate(cost, who.map(() => 1));
    who.forEach((id, i) => {
      food.set(id, food.get(id)! + parts[i]!);
      lines.get(id)!.push({ name: item.name + (who.length > 1 ? ` (÷${who.length})` : ""), amount: toBaht(parts[i]!) });
    });
  }

  const subtotal = [...food.values()].reduce((s, x) => s + x, 0);
  const discount = Math.min(toSatang(input.discount || 0), subtotal);
  const afterDiscount = subtotal - discount;
  const service = Math.round((afterDiscount * (input.servicePct || 0)) / 100);
  const vat = Math.round(((afterDiscount + service) * (input.vatPct || 0)) / 100);

  const weights = ids.map((id) => food.get(id)!);
  const d = allocate(discount, weights);
  const s = allocate(service, weights);
  const v = allocate(vat, weights);

  const shares: Share[] = input.people.map((p, i) => {
    let total = weights[i]! - d[i]! + s[i]! + v[i]!;
    if (input.roundUp) total = Math.ceil(total / 100) * 100;
    return {
      personId: p.id,
      name: p.name,
      food: toBaht(weights[i]!),
      discount: toBaht(d[i]!),
      service: toBaht(s[i]!),
      vat: toBaht(v[i]!),
      total: toBaht(total),
      items: lines.get(p.id)!,
    };
  });

  return {
    subtotal: toBaht(subtotal),
    discount: toBaht(discount),
    service: toBaht(service),
    vat: toBaht(vat),
    total: toBaht(afterDiscount + service + vat),
    shares,
    unassigned,
  };
}

/** ข้อความสรุปสำหรับวางใน LINE */
export function summaryText(result: BillResult, payer?: string): string {
  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = [`🧾 สรุปบิล ${fmt(result.total)} บาท`];
  for (const s of result.shares) lines.push(`• ${s.name}: ${fmt(s.total)} บาท`);
  if (payer) lines.push(`โอนให้ ${payer} ได้เลย 🙏`);
  return lines.join("\n");
}
