/**
 * บัตรคำทวนสอบแบบ spaced repetition (อัลกอริทึม SM-2 ของ SuperMemo)
 * ยิ่งจำได้ดี ยิ่งเว้นระยะนานก่อนถามซ้ำ — ทบทวนน้อยลงแต่จำได้นานขึ้น
 */
export type SrsCard = {
  id: string;
  front: string;
  back: string;
  ease: number; // ค่าความง่าย เริ่ม 2.5 ต่ำสุด 1.3
  interval: number; // วัน
  reps: number; // ตอบถูกติดกันกี่ครั้ง
  lapses: number; // ลืมกี่ครั้ง
  due: string | null; // null = การ์ดใหม่ยังไม่เคยเรียน
};
export type Deck = { id: string; name: string; cards: SrsCard[]; newPerDay: number };
export type Grade = "again" | "hard" | "good" | "easy";

const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function newCard(id: string, front: string, back: string): SrsCard {
  return { id, front, back, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: null };
}

/** SM-2: คำนวณช่วงห่างครั้งถัดไปจากคะแนนความจำ */
export function review(card: SrsCard, grade: Grade, today: string): SrsCard {
  const q = QUALITY[grade];
  let { ease, interval, reps, lapses } = card;
  if (q < 3) {
    reps = 0;
    interval = 1;
    lapses += card.reps > 0 || card.due !== null ? 1 : 0;
  } else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease);
    if (grade === "hard") interval = Math.max(1, Math.round(interval * 0.8));
    if (grade === "easy") interval = Math.round(interval * 1.3);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ...card, ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: addDays(today, interval) };
}

/** ช่วงห่างที่จะได้ถ้ากดแต่ละปุ่ม (แสดงบนปุ่มให้ผู้ใช้เห็นก่อนเลือก) */
export function preview(card: SrsCard, today: string): Record<Grade, number> {
  return {
    again: review(card, "again", today).interval,
    hard: review(card, "hard", today).interval,
    good: review(card, "good", today).interval,
    easy: review(card, "easy", today).interval,
  };
}

export function isDue(card: SrsCard, today: string) {
  return card.due !== null && card.due <= today;
}

/** คิวทบทวนวันนี้: การ์ดถึงกำหนดก่อน แล้วตามด้วยการ์ดใหม่ไม่เกินโควตา */
export function queue(deck: Deck, today: string, newStudiedToday = 0): SrsCard[] {
  const due = deck.cards.filter((c) => isDue(c, today)).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const fresh = deck.cards.filter((c) => c.due === null).slice(0, Math.max(0, deck.newPerDay - newStudiedToday));
  return [...due, ...fresh];
}

export function deckStats(deck: Deck, today: string) {
  const c = deck.cards;
  return {
    total: c.length,
    fresh: c.filter((x) => x.due === null).length,
    due: c.filter((x) => isDue(x, today)).length,
    learning: c.filter((x) => x.due !== null && x.interval < 21).length,
    mature: c.filter((x) => x.interval >= 21).length,
  };
}

/** จำนวนการ์ดที่จะถึงกำหนดในอีก n วัน */
export function forecast(deck: Deck, today: string, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i);
    return { day, count: deck.cards.filter((c) => c.due !== null && (i === 0 ? c.due <= day : c.due === day)).length };
  });
}

/** นำเข้าจาก CSV/TSV หรือข้อความ "หน้า - หลัง" (ก๊อปจาก Excel/Google Sheets ได้) */
export function parseCards(text: string): { front: string; back: string }[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : lines.every((l) => l.includes(",")) ? "," : lines.every((l) => / [-–=:] /.test(l)) ? "dash" : null;
  const split = (l: string): string[] => {
    if (sep === "\t") return l.split("\t");
    if (sep === "dash") return l.split(/ [-–=:] /);
    if (sep === ",") {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i]!;
        if (q && ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = !q;
        else if (ch === "," && !q) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    }
    return [l];
  };
  return lines
    .map(split)
    .filter((p) => p.length >= 2 && p[0]!.trim() && p.slice(1).join(sep === "," ? "," : " ").trim())
    .map((p) => ({ front: p[0]!.trim(), back: p.slice(1).join(sep === "," ? ", " : " ").trim() }))
    .filter((c, i) => !(i === 0 && /^(front|หน้า|question|คำถาม)$/i.test(c.front)));
}

/** สร้างคำถามแบบเลือกตอบ 4 ตัวเลือกจากคำตอบของการ์ดอื่นในชุด */
export function choices(deck: Deck, card: SrsCard, random: () => number, n = 4): string[] {
  const others = [...new Set(deck.cards.filter((c) => c.id !== card.id && c.back !== card.back).map((c) => c.back))];
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const opts = [card.back, ...others.slice(0, n - 1)];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [opts[i], opts[j]] = [opts[j]!, opts[i]!];
  }
  return opts;
}
