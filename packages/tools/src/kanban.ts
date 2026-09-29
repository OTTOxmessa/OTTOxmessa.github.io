/**
 * ระบบจัดการงานแบบ Kanban — ข้อมูลเป็น immutable ทุกฟังก์ชันคืน board ใหม่
 */
export type Label = { id: string; name: string; color: number };
export type CheckItem = { id: string; text: string; done: boolean };
export type Card = {
  id: string;
  title: string;
  description: string;
  labelIds: string[];
  due: string | null; // YYYY-MM-DD
  checklist: CheckItem[];
  createdAt: string;
};
export type Column = { id: string; name: string; wip: number | null; cardIds: string[] };
export type Board = { id: string; name: string; columns: Column[]; cards: Record<string, Card>; labels: Label[] };

export function newBoard(id: string, name: string, ids: () => string): Board {
  return {
    id,
    name,
    columns: [
      { id: ids(), name: "ต้องทำ", wip: null, cardIds: [] },
      { id: ids(), name: "กำลังทำ", wip: 3, cardIds: [] },
      { id: ids(), name: "เสร็จแล้ว", wip: null, cardIds: [] },
    ],
    cards: {},
    labels: [
      { id: ids(), name: "ด่วน", color: 4 },
      { id: ids(), name: "Frontend", color: 0 },
      { id: ids(), name: "Backend", color: 2 },
    ],
  };
}

export function addCard(board: Board, columnId: string, card: Card): Board {
  return {
    ...board,
    cards: { ...board.cards, [card.id]: card },
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, cardIds: [...c.cardIds, card.id] } : c)),
  };
}

export function updateCard(board: Board, card: Card): Board {
  return { ...board, cards: { ...board.cards, [card.id]: card } };
}

export function deleteCard(board: Board, cardId: string): Board {
  const cards = { ...board.cards };
  delete cards[cardId];
  return { ...board, cards, columns: board.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((x) => x !== cardId) })) };
}

export function findCard(board: Board, cardId: string) {
  const ci = board.columns.findIndex((c) => c.cardIds.includes(cardId));
  return ci === -1 ? null : { columnIndex: ci, index: board.columns[ci]!.cardIds.indexOf(cardId) };
}

/** ย้ายการ์ดไปคอลัมน์/ตำแหน่งที่ต้องการ (index ถูกจำกัดให้อยู่ในช่วง) */
export function moveCard(board: Board, cardId: string, toColumnId: string, toIndex: number): Board {
  const from = findCard(board, cardId);
  if (!from) return board;
  const columns = board.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((x) => x !== cardId) }));
  const target = columns.find((c) => c.id === toColumnId);
  if (!target) return board;
  const idx = Math.max(0, Math.min(toIndex, target.cardIds.length));
  target.cardIds.splice(idx, 0, cardId);
  return { ...board, columns };
}

/** ย้ายด้วยคีย์บอร์ด: ซ้าย/ขวา = เปลี่ยนคอลัมน์, ขึ้น/ลง = เปลี่ยนลำดับ */
export function nudge(board: Board, cardId: string, dir: "left" | "right" | "up" | "down"): Board {
  const pos = findCard(board, cardId);
  if (!pos) return board;
  const { columnIndex, index } = pos;
  if (dir === "up" || dir === "down") {
    const col = board.columns[columnIndex]!;
    const to = index + (dir === "up" ? -1 : 1);
    if (to < 0 || to >= col.cardIds.length) return board;
    return moveCard(board, cardId, col.id, to);
  }
  const ci = columnIndex + (dir === "left" ? -1 : 1);
  const target = board.columns[ci];
  if (!target) return board;
  return moveCard(board, cardId, target.id, Math.min(index, target.cardIds.length));
}

export function addColumn(board: Board, id: string, name: string): Board {
  return { ...board, columns: [...board.columns, { id, name, wip: null, cardIds: [] }] };
}

export function deleteColumn(board: Board, columnId: string): Board {
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) return board;
  let next = { ...board, columns: board.columns.filter((c) => c.id !== columnId) };
  for (const id of col.cardIds) next = { ...next, cards: Object.fromEntries(Object.entries(next.cards).filter(([k]) => k !== id)) };
  return next;
}

export function moveColumn(board: Board, columnId: string, dir: -1 | 1): Board {
  const i = board.columns.findIndex((c) => c.id === columnId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= board.columns.length) return board;
  const columns = [...board.columns];
  [columns[i], columns[j]] = [columns[j]!, columns[i]!];
  return { ...board, columns };
}

export type DueState = "overdue" | "today" | "soon" | "later" | null;

export function dueState(card: Card, today: string, doneColumn: boolean): DueState {
  if (!card.due || doneColumn) return null;
  const d = (a: string) => {
    const [y, m, dd] = a.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, dd);
  };
  const diff = Math.round((d(card.due) - d(today)) / 86_400_000);
  return diff < 0 ? "overdue" : diff === 0 ? "today" : diff <= 3 ? "soon" : "later";
}

export function progress(card: Card) {
  const done = card.checklist.filter((c) => c.done).length;
  return { done, total: card.checklist.length };
}

export type Filter = { query: string; labelIds: string[]; due: "all" | "overdue" | "week" };

export function matches(card: Card, f: Filter, today: string): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && !`${card.title} ${card.description} ${card.checklist.map((c) => c.text).join(" ")}`.toLowerCase().includes(q)) return false;
  if (f.labelIds.length && !f.labelIds.every((l) => card.labelIds.includes(l))) return false;
  if (f.due !== "all") {
    const st = dueState(card, today, false);
    if (f.due === "overdue" && st !== "overdue") return false;
    if (f.due === "week" && !(st === "overdue" || st === "today" || st === "soon" || (st === "later" && withinDays(card.due!, today, 7)))) return false;
  }
  return true;
}

function withinDays(due: string, today: string, n: number) {
  const t = (a: string) => {
    const [y, m, d] = a.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return (t(due) - t(today)) / 86_400_000 <= n;
}

export function boardStats(board: Board, today: string) {
  const last = board.columns.at(-1);
  const cards = Object.values(board.cards);
  const done = last ? last.cardIds.length : 0;
  return {
    total: cards.length,
    done,
    overdue: board.columns.flatMap((c, i) => c.cardIds.map((id) => dueState(board.cards[id]!, today, i === board.columns.length - 1))).filter((x) => x === "overdue").length,
    percent: cards.length ? Math.round((done / cards.length) * 100) : 0,
  };
}

/** ตรวจโครงสร้างไฟล์ที่นำเข้า (ป้องกันไฟล์เสียทำให้แอปพัง) */
export function isBoard(x: unknown): x is Board {
  if (!x || typeof x !== "object") return false;
  const b = x as Board;
  return typeof b.id === "string" && typeof b.name === "string" && Array.isArray(b.columns) && typeof b.cards === "object" && Array.isArray(b.labels) &&
    b.columns.every((c) => Array.isArray(c.cardIds) && c.cardIds.every((id) => typeof b.cards[id] === "object"));
}
