"use client";

import {
  addCard,
  addColumn,
  boardStats,
  deleteCard,
  deleteColumn,
  dueState,
  findCard,
  isBoard,
  matches,
  moveCard,
  moveColumn,
  newBoard,
  nudge,
  progress,
  updateCard,
  type Board,
  type Card,
  type Filter,
} from "@portfolio/tools/kanban";
import { useEffect, useId, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { ConfirmButton, download, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { Modal, Tabs, useHashView } from "./ui";

type Store = { boards: Board[]; activeId: string | null };
type View = "board" | "list" | "setup";
const VIEWS = ["board", "list", "setup"] as const;
const COLORS = 6;
const COLOR_NAMES: [string, string][] = [["น้ำเงิน", "Blue"], ["เขียว", "Green"], ["ม่วง", "Purple"], ["ส้ม", "Orange"], ["แดง", "Red"], ["เทา", "Grey"]];

type TFn = (th: string, en: string) => string;

function offset(today: string, n: number) {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function sampleBoard(today: string): Board {
  let b = newBoard(uid(), "เว็บร้านกาแฟ OTTO Café", uid);
  const [urgent, fe, be] = b.labels.map((l) => l.id) as [string, string, string];
  b = { ...b, labels: [...b.labels, { id: uid(), name: "ออกแบบ", color: 3 }] };
  const design = b.labels[3]!.id;
  const [todo, doing, done] = b.columns.map((c) => c.id) as [string, string, string];
  const card = (title: string, labelIds: string[], due: number | null, checklist: [string, boolean][] = [], description = ""): Card => ({
    id: uid(),
    title,
    description,
    labelIds,
    due: due === null ? null : offset(today, due),
    checklist: checklist.map(([text, isDone]) => ({ id: uid(), text, done: isDone })),
    createdAt: today,
  });
  const put: [string, Card][] = [
    [todo, card("หน้าเมนูเครื่องดื่ม + ราคา", [fe], 5, [["ดึงข้อมูลเมนูจาก Sheet", false], ["รูปสินค้า", false], ["ฟิลเตอร์ร้อน/เย็น", false]])],
    [todo, card("ระบบสั่งล่วงหน้า (pre-order)", [be], 12, [], "ลูกค้าสั่งผ่านเว็บแล้วมารับที่ร้าน แจ้งเตือนผ่าน LINE")],
    [todo, card("ทำ favicon และรูปแชร์ (OG image)", [design], null)],
    [todo, card("แก้ contrast ปุ่มสีส้มไม่ผ่าน WCAG", [urgent, fe], 0)],
    [doing, card("ออกแบบหน้าแรก (hero + โปรโมชัน)", [design, fe], 2, [["wireframe มือถือ", true], ["wireframe เดสก์ท็อป", true], ["เลือกฟอนต์ไทย", false]])],
    [doing, card("API รายการสินค้า", [be], -1, [["schema", true], ["endpoint GET", true], ["แคช", false]], "เลยกำหนดมาแล้ว 1 วัน ต้องเร่ง")],
    [done, card("ตั้งค่า repo + CI", [be], -6, [["lint", true], ["test", true], ["deploy", true]])],
    [done, card("เก็บ requirement กับเจ้าของร้าน", [], -9)],
  ];
  for (const [col, c] of put) b = addCard(b, col, c);
  return b;
}

const DUE_TEXT: Record<Exclude<ReturnType<typeof dueState>, null>, [string, string]> = {
  overdue: ["เลยกำหนด", "Overdue"],
  today: ["วันนี้", "Today"],
  soon: ["ใกล้ถึง", "Soon"],
  later: ["", ""],
};

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function KanbanApp() {
  const lang = useLang();
  const T: TFn = (th, en) => (lang === "th" ? th : en);
  const fid = useId();
  const [store, setStore, ready] = useStoredState<Store>("tool-kanban-v1", { boards: [], activeId: null });
  const [view, setViewRaw] = useState<View>("board");
  const setView = useHashView(VIEWS, "board", setViewRaw);
  const [toast, show] = useToast();
  const [today, setToday] = useState("");
  const [filter, setFilter] = useState<Filter>({ query: "", labelIds: [], due: "all" });
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [focusCard, setFocusCard] = useState<string | null>(null);
  useEffect(() => setToday(todayIso()), []);

  const board = store.boards.find((b) => b.id === store.activeId) ?? store.boards[0] ?? null;
  const setBoard = (f: (b: Board) => Board) =>
    setStore((s) => {
      const id = s.activeId ?? s.boards[0]?.id;
      return { ...s, boards: s.boards.map((b) => (b.id === id ? f(b) : b)) };
    });

  // คืนโฟกัสให้การ์ดหลังย้ายด้วยคีย์บอร์ด (DOM ถูกสร้างใหม่ตอนเปลี่ยนคอลัมน์)
  useEffect(() => {
    if (!focusCard) return;
    document.querySelector<HTMLElement>(`[data-card="${focusCard}"]`)?.focus();
    setFocusCard(null);
  }, [focusCard, store]);

  function createBoard(name: string, sample = false) {
    const b = sample && today ? sampleBoard(today) : newBoard(uid(), name, uid);
    setStore((s) => ({ boards: [...s.boards, b], activeId: b.id }));
    show(T(`สร้างบอร์ด “${b.name}” แล้ว`, `Created board “${b.name}”`));
  }

  if (!ready) return <div className="bigapp kanban" aria-busy="true" />;

  if (!board) {
    return (
      <div className="bigapp kanban">
        {toast}
        <div className="panel empty-state">
          <p>{T("ยังไม่มีบอร์ด สร้างบอร์ดใหม่ หรือเปิดบอร์ดตัวอย่าง (โปรเจกต์ทำเว็บร้านกาแฟ มีการ์ด ป้ายกำกับ กำหนดส่ง และเช็กลิสต์ให้ลองเล่น)", "No boards yet. Create one, or open the sample project board with labels, due dates and checklists.")}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => createBoard("", true)}>{T("เปิดบอร์ดตัวอย่าง", "Open sample board")}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => createBoard(T("บอร์ดใหม่", "New board"))}>{T("สร้างบอร์ดเปล่า", "Blank board")}</button>
          </div>
        </div>
      </div>
    );
  }

  const stats = boardStats(board, today || "1970-01-01");
  const filtering = filter.query.trim() !== "" || filter.labelIds.length > 0 || filter.due !== "all";
  const tabs = [
    { id: "board" as const, label: T("บอร์ด", "Board") },
    { id: "list" as const, label: T("รายการ", "List"), badge: stats.overdue || undefined },
    { id: "setup" as const, label: T("ตั้งค่าบอร์ด", "Board setup") },
  ];

  return (
    <div className="bigapp kanban">
      {toast}
      <div className="bigapp-bar">
        <div className="field field--inline board-pick">
          <label htmlFor={`${fid}-b`}>{T("บอร์ด", "Board")}</label>
          <select id={`${fid}-b`} value={board.id} onChange={(e) => setStore((s) => ({ ...s, activeId: e.target.value }))}>
            {store.boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <Tabs tabs={tabs} value={view} onChange={setView} label={T("มุมมองบอร์ด", "Board views")} />
      </div>

      <dl className="money-kpis kpis-4 kb-kpis">
        <div><dt>{T("การ์ดทั้งหมด", "Cards")}</dt><dd>{stats.total}</dd></div>
        <div><dt>{T("เสร็จแล้ว", "Done")}</dt><dd>{stats.done} <small>({stats.percent}%)</small></dd></div>
        <div><dt>{T("เลยกำหนด", "Overdue")}</dt><dd className={stats.overdue ? "neg" : ""}>{stats.overdue}</dd></div>
        <div><dt>{T("ความคืบหน้า", "Progress")}</dt><dd><span className="progress-bar" role="img" aria-label={`${stats.percent}%`}><i style={{ width: `${stats.percent}%` }} /></span></dd></div>
      </dl>

      {view !== "setup" && <FilterBar board={board} filter={filter} setFilter={setFilter} T={T} />}

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === view)!.label}>
        {view === "board" && (
          <BoardView board={board} setBoard={setBoard} filter={filter} filtering={filtering} today={today} T={T} show={show} onOpen={setOpenCard} onFocus={setFocusCard} />
        )}
        {view === "list" && <ListView board={board} filter={filter} today={today} T={T} onOpen={setOpenCard} />}
        {view === "setup" && <SetupView store={store} setStore={setStore} board={board} setBoard={setBoard} T={T} show={show} createBoard={createBoard} />}
      </div>

      <Modal open={openCard !== null && Boolean(board.cards[openCard])} onClose={() => setOpenCard(null)} title={T("รายละเอียดการ์ด", "Card details")} wide>
        {openCard && board.cards[openCard] && (
          <CardEditor
            key={openCard}
            board={board}
            card={board.cards[openCard]!}
            T={T}
            onSave={(c) => setBoard((b) => updateCard(b, c))}
            onMove={(col) => setBoard((b) => moveCard(b, openCard, col, Infinity))}
            onDelete={() => {
              setBoard((b) => deleteCard(b, openCard));
              setOpenCard(null);
              show(T("ลบการ์ดแล้ว", "Card deleted"));
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ FILTER */
function FilterBar({ board, filter, setFilter, T }: { board: Board; filter: Filter; setFilter: (f: Filter) => void; T: TFn }) {
  const fid = useId();
  const on = filter.query.trim() !== "" || filter.labelIds.length > 0 || filter.due !== "all";
  return (
    <div className="kb-filter" role="search" aria-label={T("กรองการ์ด", "Filter cards")}>
      <div className="field field--inline">
        <label htmlFor={`${fid}-q`}>{T("ค้นหา", "Search")}</label>
        <input id={`${fid}-q`} type="search" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} placeholder={T("ชื่อ รายละเอียด เช็กลิสต์", "title, notes, checklist")} />
      </div>
      <div className="chip-row" role="group" aria-label={T("กรองตามป้าย", "Filter by label")}>
        {board.labels.map((l) => {
          const pressed = filter.labelIds.includes(l.id);
          return (
            <button key={l.id} type="button" className={`chip lbl-chip lbl-${l.color}`} aria-pressed={pressed} onClick={() => setFilter({ ...filter, labelIds: pressed ? filter.labelIds.filter((x) => x !== l.id) : [...filter.labelIds, l.id] })}>
              {l.name}
            </button>
          );
        })}
      </div>
      <div className="field field--inline">
        <label htmlFor={`${fid}-d`}>{T("กำหนดส่ง", "Due")}</label>
        <select id={`${fid}-d`} value={filter.due} onChange={(e) => setFilter({ ...filter, due: e.target.value as Filter["due"] })}>
          <option value="all">{T("ทั้งหมด", "All")}</option>
          <option value="overdue">{T("เลยกำหนด", "Overdue")}</option>
          <option value="week">{T("ภายใน 7 วัน", "Within 7 days")}</option>
        </select>
      </div>
      {on && <button type="button" className="text-link" onClick={() => setFilter({ query: "", labelIds: [], due: "all" })}>{T("ล้างตัวกรอง", "Clear filters")}</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ CARD CHIP */
function CardFace({ board, card, today, done, T }: { board: Board; card: Card; today: string; done: boolean; T: TFn }) {
  const st = today ? dueState(card, today, done) : null;
  const pr = progress(card);
  return (
    <>
      {card.labelIds.length > 0 && (
        <span className="kb-labels">
          {card.labelIds.map((id) => board.labels.find((l) => l.id === id)).filter(Boolean).map((l) => <span key={l!.id} className={`lbl lbl-${l!.color}`}>{l!.name}</span>)}
        </span>
      )}
      <span className="kb-title">{card.title}</span>
      {(card.due || pr.total > 0 || card.description) && (
        <span className="kb-meta">
          {card.due && (
            <span className={`kb-due${st ? ` due-${st}` : ""}${done ? " due-done" : ""}`}>
              {fmtDate(card.due)}
              {st && st !== "later" && <> · {T(...DUE_TEXT[st])}</>}
            </span>
          )}
          {pr.total > 0 && <span className={`kb-check${pr.done === pr.total ? " is-full" : ""}`}>☑ {pr.done}/{pr.total}</span>}
          {card.description && <span aria-hidden="true" title={T("มีรายละเอียด", "Has notes")}>≡</span>}
        </span>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ BOARD */
function BoardView({
  board, setBoard, filter, filtering, today, T, show, onOpen, onFocus,
}: {
  board: Board; setBoard: (f: (b: Board) => Board) => void; filter: Filter; filtering: boolean; today: string; T: TFn; show: (m: string) => void; onOpen: (id: string) => void; onFocus: (id: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fid = useId();
  const last = board.columns.length - 1;

  function announceMove(b: Board, id: string) {
    const pos = findCard(b, id);
    if (!pos) return;
    const col = b.columns[pos.columnIndex]!;
    show(T(`ย้าย “${b.cards[id]!.title}” ไป ${col.name} ลำดับที่ ${pos.index + 1} จาก ${col.cardIds.length}`, `Moved “${b.cards[id]!.title}” to ${col.name}, position ${pos.index + 1} of ${col.cardIds.length}`));
  }

  function onCardKey(e: React.KeyboardEvent, id: string) {
    if (!e.altKey) return;
    const dir = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const)[e.key as "ArrowLeft"];
    if (!dir) return;
    e.preventDefault();
    const next = nudge(board, id, dir);
    if (next === board) return;
    setBoard(() => next);
    onFocus(id);
    announceMove(next, id);
  }

  function drop(colId: string) {
    if (!dragId || !over) return;
    const pos = findCard(board, dragId);
    let index = over.index;
    // ถ้าลากลงคอลัมน์เดิมที่ตำแหน่งหลังตัวเอง ต้องลบ 1 เพราะตัวเองถูกดึงออกก่อน
    if (pos && board.columns[pos.columnIndex]!.id === colId && pos.index < index) index -= 1;
    const next = moveCard(board, dragId, colId, index);
    setBoard(() => next);
    announceMove(next, dragId);
    setDragId(null);
    setOver(null);
  }

  function submitCard(colId: string) {
    const t = title.trim();
    if (!t) return;
    const c: Card = { id: uid(), title: t, description: "", labelIds: [], due: null, checklist: [], createdAt: today };
    setBoard((b) => addCard(b, colId, c));
    setTitle("");
    show(T(`เพิ่มการ์ด “${t}” แล้ว`, `Added “${t}”`));
  }

  return (
    <>
      <p className="hint kb-hint">
        {T("ลากการ์ดเพื่อย้าย หรือโฟกัสการ์ดแล้วกด ", "Drag cards to move them, or focus a card and press ")}
        <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd>{T(" เปลี่ยนคอลัมน์ ", " to change column, ")}<kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd>{T(" เปลี่ยนลำดับ", " to reorder")}
      </p>
      <div className="kb-board" style={{ ["--cols" as string]: board.columns.length }}>
        {board.columns.map((col, ci) => {
          const visible = col.cardIds.filter((id) => !filtering || matches(board.cards[id]!, filter, today || "1970-01-01"));
          const overWip = col.wip !== null && col.cardIds.length > col.wip;
          const headId = `${fid}-h-${col.id}`;
          return (
            <section
              key={col.id}
              className={`kb-col${overWip ? " is-over" : ""}${over?.col === col.id ? " is-target" : ""}`}
              aria-labelledby={headId}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")];
                let index = col.cardIds.length;
                for (const el of items) {
                  const r = el.getBoundingClientRect();
                  if (e.clientY < r.top + r.height / 2) {
                    index = col.cardIds.indexOf(el.dataset.card!);
                    break;
                  }
                }
                if (over?.col !== col.id || over.index !== index) setOver({ col: col.id, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col.id);
              }}
            >
              <header className="kb-col-head">
                <h2 id={headId}>{col.name}</h2>
                <span className={`kb-count${overWip ? " neg" : ""}`}>
                  {filtering ? `${visible.length}/` : ""}{col.cardIds.length}{col.wip !== null && ` / ${col.wip}`}
                  {col.wip !== null && <span className="sr-only">{T(" (จำกัดงานพร้อมกัน)", " (WIP limit)")}</span>}
                </span>
              </header>
              {overWip && <p className="kb-warn">{T("งานค้างเกินจำนวนที่ตั้งไว้ — ปิดงานเก่าก่อนเริ่มใหม่", "Over the WIP limit — finish something first")}</p>}
              <ul className="kb-cards">
                {visible.map((id) => {
                  const card = board.cards[id]!;
                  const showLine = over?.col === col.id && over.index === col.cardIds.indexOf(id) && dragId !== id;
                  return (
                    <li key={id} className={showLine ? "drop-before" : ""}>
                      <button
                        type="button"
                        className={`kb-card${dragId === id ? " is-drag" : ""}`}
                        data-card={id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", id);
                          setDragId(id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onClick={() => onOpen(id)}
                        onKeyDown={(e) => onCardKey(e, id)}
                        aria-describedby={`${fid}-kbh`}
                      >
                        <CardFace board={board} card={card} today={today} done={ci === last} T={T} />
                      </button>
                    </li>
                  );
                })}
                {over?.col === col.id && over.index >= col.cardIds.length && <li className="drop-end" aria-hidden="true" />}
              </ul>
              {filtering && visible.length === 0 && col.cardIds.length > 0 && <p className="hint">{T("ไม่มีการ์ดที่ตรงตัวกรอง", "No matching cards")}</p>}
              {adding === col.id ? (
                <form
                  className="kb-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitCard(col.id);
                  }}
                >
                  <label className="sr-only" htmlFor={`${fid}-n-${col.id}`}>{T(`ชื่อการ์ดใหม่ใน ${col.name}`, `New card title in ${col.name}`)}</label>
                  <textarea
                    id={`${fid}-n-${col.id}`}
                    rows={2}
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitCard(col.id);
                      }
                      if (e.key === "Escape") setAdding(null);
                    }}
                    placeholder={T("พิมพ์แล้วกด Enter", "Type and press Enter")}
                  />
                  <div className="side-actions">
                    <button type="submit" className="btn btn-primary btn-sm">{T("เพิ่ม", "Add")}</button>
                    <button type="button" className="text-link" onClick={() => setAdding(null)}>{T("ปิด", "Close")}</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="kb-add-btn" onClick={() => { setAdding(col.id); setTitle(""); }}>
                  + {T("เพิ่มการ์ด", "Add card")}<span className="sr-only"> {T("ใน", "to")} {col.name}</span>
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p id={`${fid}-kbh`} hidden>{T("กด Enter เพื่อเปิด, Alt+ลูกศรเพื่อย้าย", "Press Enter to open, Alt+arrows to move")}</p>
    </>
  );
}

/* ------------------------------------------------------------------ LIST */
function ListView({ board, filter, today, T, onOpen }: { board: Board; filter: Filter; today: string; T: TFn; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<"column" | "due">("column");
  const fid = useId();
  const last = board.columns.length - 1;
  let rows = board.columns.flatMap((col, ci) => col.cardIds.map((id) => ({ card: board.cards[id]!, col, done: ci === last, order: ci })));
  rows = rows.filter((r) => matches(r.card, filter, today || "1970-01-01"));
  if (sort === "due") rows = [...rows].sort((a, b) => (a.card.due ?? "9999") < (b.card.due ?? "9999") ? -1 : (a.card.due ?? "9999") > (b.card.due ?? "9999") ? 1 : a.order - b.order);
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("การ์ดทั้งหมด", "All cards")} <span className="muted-count">({rows.length})</span></h2>
        <div className="field field--inline">
          <label htmlFor={`${fid}-s`}>{T("เรียงตาม", "Sort by")}</label>
          <select id={`${fid}-s`} value={sort} onChange={(e) => setSort(e.target.value as "column" | "due")}>
            <option value="column">{T("คอลัมน์", "Column")}</option>
            <option value="due">{T("กำหนดส่ง", "Due date")}</option>
          </select>
        </div>
      </div>
      {rows.length === 0 ? <p className="hint">{T("ไม่มีการ์ด", "No cards")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางการ์ด", "Cards table")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("การ์ด", "Card")}</th><th scope="col">{T("สถานะ", "Status")}</th><th scope="col">{T("ป้าย", "Labels")}</th><th scope="col">{T("กำหนดส่ง", "Due")}</th><th scope="col">{T("เช็กลิสต์", "Checklist")}</th></tr></thead>
            <tbody>
              {rows.map(({ card, col, done }) => {
                const st = today ? dueState(card, today, done) : null;
                const pr = progress(card);
                return (
                  <tr key={card.id}>
                    <th scope="row"><button type="button" className="text-link" onClick={() => onOpen(card.id)}>{card.title}</button></th>
                    <td>{col.name}</td>
                    <td>{card.labelIds.map((id) => board.labels.find((l) => l.id === id)).filter(Boolean).map((l) => <span key={l!.id} className={`lbl lbl-${l!.color}`}>{l!.name}</span>)}</td>
                    <td>{card.due ? <span className={`kb-due${st ? ` due-${st}` : ""}`}>{fmtDate(card.due)}{st && st !== "later" && ` · ${T(...DUE_TEXT[st])}`}</span> : "—"}</td>
                    <td>{pr.total ? `${pr.done}/${pr.total}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ CARD EDITOR */
function CardEditor({ board, card, T, onSave, onMove, onDelete }: { board: Board; card: Card; T: TFn; onSave: (c: Card) => void; onMove: (col: string) => void; onDelete: () => void }) {
  const fid = useId();
  const [item, setItem] = useState("");
  const pos = findCard(board, card.id);
  const set = (p: Partial<Card>) => onSave({ ...card, ...p });
  const pr = progress(card);
  return (
    <div className="card-editor">
      <div className="stack-form">
        <div className="field"><label htmlFor={`${fid}-t`}>{T("ชื่องาน", "Title")}</label><input id={`${fid}-t`} value={card.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${fid}-d`}>{T("รายละเอียด", "Description")}</label><textarea id={`${fid}-d`} rows={3} value={card.description} onChange={(e) => set({ description: e.target.value })} /></div>
        <div className="form-grid-2">
          <div className="field">
            <label htmlFor={`${fid}-c`}>{T("คอลัมน์", "Column")}</label>
            <select id={`${fid}-c`} value={pos ? board.columns[pos.columnIndex]!.id : ""} onChange={(e) => onMove(e.target.value)}>
              {board.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fid}-due`}>{T("กำหนดส่ง", "Due date")}</label>
            <input id={`${fid}-due`} type="date" value={card.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} />
          </div>
        </div>
      </div>
      <fieldset className="lbl-pick">
        <legend>{T("ป้ายกำกับ", "Labels")}</legend>
        {board.labels.map((l) => (
          <label key={l.id} className={`lbl-toggle lbl-${l.color}`}>
            <input type="checkbox" checked={card.labelIds.includes(l.id)} onChange={(e) => set({ labelIds: e.target.checked ? [...card.labelIds, l.id] : card.labelIds.filter((x) => x !== l.id) })} />
            {l.name}
          </label>
        ))}
      </fieldset>
      <div className="checklist">
        <p className="mini-title">{T("เช็กลิสต์", "Checklist")} {pr.total > 0 && <span className="muted-count">({pr.done}/{pr.total})</span>}</p>
        {pr.total > 0 && <span className="progress-bar" role="img" aria-label={`${Math.round((pr.done / pr.total) * 100)}%`}><i style={{ width: `${(pr.done / pr.total) * 100}%` }} /></span>}
        <ul>
          {card.checklist.map((c) => (
            <li key={c.id}>
              <label className="check-row">
                <input type="checkbox" checked={c.done} onChange={(e) => set({ checklist: card.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })} />
                <span className={c.done ? "is-done" : ""}>{c.text}</span>
              </label>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={T(`ลบ ${c.text}`, `Remove ${c.text}`)} onClick={() => set({ checklist: card.checklist.filter((x) => x.id !== c.id) })}>✕</button>
            </li>
          ))}
        </ul>
        <form
          className="inline-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!item.trim()) return;
            set({ checklist: [...card.checklist, { id: uid(), text: item.trim(), done: false }] });
            setItem("");
          }}
        >
          <label className="sr-only" htmlFor={`${fid}-i`}>{T("เพิ่มรายการเช็กลิสต์", "Add checklist item")}</label>
          <input id={`${fid}-i`} value={item} onChange={(e) => setItem(e.target.value)} placeholder={T("เพิ่มรายการ…", "Add an item…")} />
          <button type="submit" className="btn btn-outline btn-sm">{T("เพิ่ม", "Add")}</button>
        </form>
      </div>
      <div className="side-actions modal-foot">
        <ConfirmButton label={T("ลบการ์ด", "Delete card")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again to delete")} onConfirm={onDelete} />
        <span className="hint">{T("บันทึกอัตโนมัติ", "Saved automatically")}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ SETUP */
function SetupView({
  store, setStore, board, setBoard, T, show, createBoard,
}: {
  store: Store; setStore: (f: (s: Store) => Store) => void; board: Board; setBoard: (f: (b: Board) => Board) => void; T: TFn; show: (m: string) => void; createBoard: (name: string, sample?: boolean) => void;
}) {
  const fid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [colName, setColName] = useState("");
  const [lblName, setLblName] = useState("");
  const [boardName, setBoardName] = useState("");
  return (
    <div className="report-grid">
      <section className="panel">
        <h2 className="panel-title">{T("บอร์ดนี้", "This board")}</h2>
        <div className="field"><label htmlFor={`${fid}-bn`}>{T("ชื่อบอร์ด", "Board name")}</label><input id={`${fid}-bn`} value={board.name} onChange={(e) => setBoard((b) => ({ ...b, name: e.target.value }))} /></div>

        <p className="mini-title">{T("คอลัมน์ (ซ้าย → ขวา)", "Columns (left → right)")}</p>
        <p className="hint">{T("คอลัมน์ขวาสุดถือเป็น “เสร็จแล้ว” · จำกัดงาน (WIP) เว้นว่าง = ไม่จำกัด", "The right-most column counts as done · leave WIP empty for no limit")}</p>
        <ul className="setup-list">
          {board.columns.map((c, i) => (
            <li key={c.id}>
              <label className="sr-only" htmlFor={`${fid}-cn-${c.id}`}>{T("ชื่อคอลัมน์", "Column name")} {i + 1}</label>
              <input id={`${fid}-cn-${c.id}`} value={c.name} onChange={(e) => setBoard((b) => ({ ...b, columns: b.columns.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) }))} />
              <label className="sr-only" htmlFor={`${fid}-cw-${c.id}`}>{T(`จำกัดงานของ ${c.name}`, `WIP limit for ${c.name}`)}</label>
              <input id={`${fid}-cw-${c.id}`} className="wip-input" type="number" min={1} placeholder="WIP" value={c.wip ?? ""} onChange={(e) => setBoard((b) => ({ ...b, columns: b.columns.map((x) => (x.id === c.id ? { ...x, wip: e.target.value ? Math.max(1, Number(e.target.value)) : null } : x)) }))} />
              <button type="button" className="icon-btn icon-btn--sm" disabled={i === 0} aria-label={T(`เลื่อน ${c.name} ไปซ้าย`, `Move ${c.name} left`)} onClick={() => setBoard((b) => moveColumn(b, c.id, -1))}>←</button>
              <button type="button" className="icon-btn icon-btn--sm" disabled={i === board.columns.length - 1} aria-label={T(`เลื่อน ${c.name} ไปขวา`, `Move ${c.name} right`)} onClick={() => setBoard((b) => moveColumn(b, c.id, 1))}>→</button>
              {board.columns.length > 1 && (
                <ConfirmButton label={T("ลบ", "Delete")} confirmLabel={c.cardIds.length ? T(`ลบพร้อม ${c.cardIds.length} การ์ด?`, `Delete with ${c.cardIds.length} cards?`) : T("ยืนยันลบ", "Confirm")} onConfirm={() => setBoard((b) => deleteColumn(b, c.id))} />
              )}
            </li>
          ))}
        </ul>
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!colName.trim()) return; setBoard((b) => addColumn(b, uid(), colName.trim())); setColName(""); }}>
          <label className="sr-only" htmlFor={`${fid}-nc`}>{T("ชื่อคอลัมน์ใหม่", "New column name")}</label>
          <input id={`${fid}-nc`} value={colName} onChange={(e) => setColName(e.target.value)} placeholder={T("เช่น รอตรวจ", "e.g. Review")} />
          <button type="submit" className="btn btn-outline btn-sm">{T("เพิ่มคอลัมน์", "Add column")}</button>
        </form>

        <p className="mini-title">{T("ป้ายกำกับ", "Labels")}</p>
        <ul className="setup-list">
          {board.labels.map((l) => (
            <li key={l.id}>
              <span className={`lbl lbl-${l.color}`} aria-hidden="true">{l.name || "—"}</span>
              <label className="sr-only" htmlFor={`${fid}-ln-${l.id}`}>{T("ชื่อป้าย", "Label name")}</label>
              <input id={`${fid}-ln-${l.id}`} value={l.name} onChange={(e) => setBoard((b) => ({ ...b, labels: b.labels.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)) }))} />
              <label className="sr-only" htmlFor={`${fid}-lc-${l.id}`}>{T(`สีของ ${l.name}`, `Colour of ${l.name}`)}</label>
              <select id={`${fid}-lc-${l.id}`} value={l.color} onChange={(e) => setBoard((b) => ({ ...b, labels: b.labels.map((x) => (x.id === l.id ? { ...x, color: Number(e.target.value) } : x)) }))}>
                {Array.from({ length: COLORS }, (_, i) => <option key={i} value={i}>{T(...COLOR_NAMES[i]!)}</option>)}
              </select>
              <ConfirmButton label={T("ลบ", "Delete")} confirmLabel={T("ยืนยันลบ", "Confirm")} onConfirm={() => setBoard((b) => ({ ...b, labels: b.labels.filter((x) => x.id !== l.id), cards: Object.fromEntries(Object.entries(b.cards).map(([k, c]) => [k, { ...c, labelIds: c.labelIds.filter((x) => x !== l.id) }])) }))} />
            </li>
          ))}
        </ul>
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!lblName.trim()) return; setBoard((b) => ({ ...b, labels: [...b.labels, { id: uid(), name: lblName.trim(), color: b.labels.length % COLORS }] })); setLblName(""); }}>
          <label className="sr-only" htmlFor={`${fid}-nl`}>{T("ชื่อป้ายใหม่", "New label name")}</label>
          <input id={`${fid}-nl`} value={lblName} onChange={(e) => setLblName(e.target.value)} placeholder={T("เช่น บั๊ก", "e.g. Bug")} />
          <button type="submit" className="btn btn-outline btn-sm">{T("เพิ่มป้าย", "Add label")}</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">{T("บอร์ดทั้งหมด", "All boards")}</h2>
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!boardName.trim()) return; createBoard(boardName.trim()); setBoardName(""); }}>
          <label className="sr-only" htmlFor={`${fid}-nb`}>{T("ชื่อบอร์ดใหม่", "New board name")}</label>
          <input id={`${fid}-nb`} value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder={T("ชื่อบอร์ดใหม่", "New board name")} />
          <button type="submit" className="btn btn-primary btn-sm">{T("สร้างบอร์ด", "Create")}</button>
        </form>
        <ul className="top-list">
          {store.boards.map((b) => (
            <li key={b.id}>
              <span>{b.name}{b.id === board.id && <small> · {T("กำลังเปิด", "open")}</small>}</span>
              <span className="mono">{Object.keys(b.cards).length} {T("การ์ด", "cards")}</span>
            </li>
          ))}
        </ul>
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => createBoard("", true)}>{T("เพิ่มบอร์ดตัวอย่าง", "Add sample board")}</button>
          <ConfirmButton
            label={T("ลบบอร์ดนี้", "Delete this board")}
            confirmLabel={T("กดอีกครั้งเพื่อลบบอร์ด", "Tap again to delete board")}
            onConfirm={() => {
              setStore((s) => {
                const boards = s.boards.filter((b) => b.id !== board.id);
                return { boards, activeId: boards[0]?.id ?? null };
              });
              show(T("ลบบอร์ดแล้ว", "Board deleted"));
            }}
          />
        </div>

        <p className="mini-title">{T("ข้อมูล", "Data")}</p>
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => download(`kanban-${board.name.replace(/[^\w฀-๿-]+/g, "-")}-${todayIso()}.json`, JSON.stringify(board, null, 2), "application/json")}>{T("ส่งออกบอร์ดนี้ (JSON)", "Export this board")}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("นำเข้าบอร์ด", "Import board")}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const d: unknown = JSON.parse(await readFile(f));
              if (!isBoard(d)) throw new Error();
              const b = { ...d, id: uid() };
              setStore((s) => ({ boards: [...s.boards, b], activeId: b.id }));
              show(T(`นำเข้า “${b.name}” แล้ว`, `Imported “${b.name}”`));
            } catch {
              show(T("ไฟล์นี้ไม่ใช่บอร์ด Kanban", "Not a Kanban board file"));
            }
          }} />
        </div>
        <p className="privacy">{T("บอร์ดเก็บในเบราว์เซอร์เครื่องนี้ ส่งออกเป็นไฟล์เพื่อย้ายเครื่องหรือแชร์ให้เพื่อนร่วมทีมนำเข้าได้", "Boards live in this browser. Export a file to move devices or share with a teammate.")}</p>
      </section>
    </div>
  );
}
