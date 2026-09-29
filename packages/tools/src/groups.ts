/** สุ่มแบ่งกลุ่ม: สุ่มแบบกำหนด seed ได้ (สุ่มซ้ำได้ผลเดิม), กลุ่มขนาดต่างกันไม่เกิน 1, ตั้งคู่ที่ห้ามอยู่กลุ่มเดียวกันได้ */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const name = raw.replace(/^\s*\d+[.)]\s*/, "").trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

/** mulberry32 — PRNG เล็กและเร็ว */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type SplitBy = { groups: number } | { size: number };

export function groupCount(n: number, by: SplitBy): number {
  const g = "groups" in by ? by.groups : Math.ceil(n / Math.max(1, by.size));
  return Math.max(1, Math.min(n || 1, Math.floor(g)));
}

/** แจกแบบวนทีละคน → ขนาดกลุ่มต่างกันไม่เกิน 1 */
function deal<T>(items: T[], k: number): T[][] {
  const groups: T[][] = Array.from({ length: k }, () => []);
  items.forEach((x, i) => groups[i % k]!.push(x));
  return groups;
}

export function makeGroups(names: string[], by: SplitBy, seed: number, apart: [string, string][] = []) {
  const k = groupCount(names.length, by);
  const random = rng(seed);
  const violations = (gs: string[][]) =>
    apart.filter(([a, b]) => gs.some((g) => g.includes(a) && g.includes(b))).length;
  let best = deal(shuffle(names, random), k);
  let bestV = violations(best);
  for (let tries = 0; tries < 2000 && bestV > 0; tries++) {
    const candidate = deal(shuffle(names, random), k);
    const v = violations(candidate);
    if (v < bestV) {
      best = candidate;
      bestV = v;
    }
  }
  return { groups: best, unmet: bestV };
}

export function groupsText(groups: string[][], label = "กลุ่ม"): string {
  return groups.map((g, i) => `${label} ${i + 1}: ${g.join(", ")}`).join("\n");
}
