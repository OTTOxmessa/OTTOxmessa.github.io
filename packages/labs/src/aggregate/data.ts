import type { Doc } from "./engine";

/** ตัวอย่างข้อมูลการเล่นบอร์ดเกมในร้าน (สมมติ) — collection "plays" */
const GAMES = [
  { game: "Catan", minutes: 75, maxPlayers: 4 },
  { game: "Ticket to Ride", minutes: 60, maxPlayers: 5 },
  { game: "Azul", minutes: 40, maxPlayers: 4 },
  { game: "Codenames", minutes: 20, maxPlayers: 8 },
  { game: "Splendor", minutes: 30, maxPlayers: 4 },
  { game: "Pandemic", minutes: 50, maxPlayers: 4 },
  { game: "7 Wonders", minutes: 35, maxPlayers: 7 },
  { game: "Carcassonne", minutes: 45, maxPlayers: 5 },
];
const TABLES = ["A1", "A2", "B1", "B2", "C1"];

// ตัวสุ่มแบบกำหนด seed เพื่อให้ข้อมูลเหมือนเดิมทุกครั้ง (ทดสอบได้)
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const PLAYS: Doc[] = (() => {
  const r = rng(42);
  const weights = [5, 4, 4, 5, 3, 2, 2, 3];
  const pool = GAMES.flatMap((g, i) => Array(weights[i]).fill(g));
  return Array.from({ length: 40 }, (_, i) => {
    const g = pool[Math.floor(r() * pool.length)];
    const players = 2 + Math.floor(r() * (g.maxPlayers - 1));
    const day = 1 + Math.floor(r() * 28);
    return {
      _id: i + 1,
      game: g.game,
      table: TABLES[Math.floor(r() * TABLES.length)],
      players,
      minutes: Math.round(g.minutes * (0.8 + r() * 0.5)),
      rating: Math.round((3 + r() * 2) * 10) / 10,
      playedAt: `2026-09-${String(day).padStart(2, "0")}`,
    };
  });
})();

export const PRESETS: { id: string; title: { th: string; en: string }; pipeline: unknown[] }[] = [
  {
    id: "top",
    title: { th: "5 เกมยอดนิยม", en: "Top 5 most-played" },
    pipeline: [
      { $group: { _id: "$game", plays: { $sum: 1 } } },
      { $sort: { plays: -1, _id: 1 } },
      { $limit: 5 },
    ],
  },
  {
    id: "rating",
    title: { th: "คะแนนเฉลี่ยต่อเกม", en: "Average rating per game" },
    pipeline: [
      { $group: { _id: "$game", avgRating: { $avg: "$rating" }, plays: { $sum: 1 } } },
      { $match: { plays: { $gte: 3 } } },
      { $sort: { avgRating: -1 } },
    ],
  },
  {
    id: "long",
    title: { th: "เกมยาวเกิน 60 นาที", en: "Sessions over 60 min" },
    pipeline: [
      { $match: { minutes: { $gt: 60 } } },
      { $project: { _id: 0, game: 1, minutes: 1, players: 1 } },
      { $sort: { minutes: -1 } },
    ],
  },
  {
    id: "tables",
    title: { th: "โต๊ะไหนใช้นานสุด", en: "Busiest tables" },
    pipeline: [
      { $group: { _id: "$table", totalMinutes: { $sum: "$minutes" }, sessions: { $count: {} } } },
      { $sort: { totalMinutes: -1 } },
    ],
  },
];
