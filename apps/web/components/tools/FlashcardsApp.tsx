"use client";

import {
  addDays,
  choices,
  deckStats,
  forecast,
  newCard,
  parseCards,
  preview,
  queue,
  review,
  type Deck,
  type Grade,
  type SrsCard,
} from "@portfolio/tools/srs";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { ConfirmButton, download, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { Modal, Tabs, useHashView } from "./ui";

type Log = { date: string; deckId: string; fresh: number; reviews: number; correct: number };
type Store = { decks: Deck[]; activeId: string | null; log: Log[] };
type View = "decks" | "study" | "cards" | "stats" | "settings";
const VIEWS = ["decks", "study", "cards", "stats", "settings"] as const;
type TFn = (th: string, en: string) => string;

const GRADES: { g: Grade; key: string; th: string; en: string }[] = [
  { g: "again", key: "1", th: "ลืม", en: "Again" },
  { g: "hard", key: "2", th: "ยาก", en: "Hard" },
  { g: "good", key: "3", th: "จำได้", en: "Good" },
  { g: "easy", key: "4", th: "ง่ายมาก", en: "Easy" },
];

const empty = (): Store => ({ decks: [], activeId: null, log: [] });

const SAMPLE_EN: [string, string][] = [
  ["deadline", "กำหนดส่ง"], ["negotiate", "ต่อรอง"], ["invoice", "ใบแจ้งหนี้"], ["postpone", "เลื่อนออกไป"],
  ["colleague", "เพื่อนร่วมงาน"], ["reimburse", "เบิกคืนเงิน"], ["schedule", "ตารางเวลา"], ["approve", "อนุมัติ"],
  ["candidate", "ผู้สมัคร"], ["revenue", "รายได้"], ["attach", "แนบ (ไฟล์)"], ["inventory", "สินค้าคงคลัง"],
  ["refund", "คืนเงิน"], ["warranty", "การรับประกัน"], ["confirm", "ยืนยัน"], ["estimate", "ประมาณการ"],
  ["agenda", "วาระการประชุม"], ["supervisor", "หัวหน้างาน"], ["vendor", "ผู้ขาย / ซัพพลายเออร์"], ["quarter", "ไตรมาส"],
];
const SAMPLE_IT: [string, string][] = [
  ["HTTP 404", "ไม่พบหน้าที่ร้องขอ (Not Found)"], ["HTTP 500", "เซิร์ฟเวอร์ผิดพลาดภายใน"], ["DNS", "ระบบแปลงชื่อโดเมนเป็น IP"],
  ["CI/CD", "สร้าง ทดสอบ และ deploy อัตโนมัติ"], ["WCAG", "มาตรฐานการเข้าถึงเว็บของ W3C"], ["API", "ช่องทางให้โปรแกรมคุยกัน"],
  ["SQL JOIN", "รวมข้อมูลจากหลายตารางตามคีย์"], ["Git rebase", "ย้ายคอมมิตไปต่อบนฐานใหม่"], ["localStorage", "ที่เก็บข้อมูลในเบราว์เซอร์ถาวร"],
  ["CORS", "กติกาเรียกข้าม origin ของเบราว์เซอร์"],
];

function sampleDecks(today: string): Deck[] {
  const en: Deck = { id: uid(), name: "ศัพท์อังกฤษที่ทำงาน", newPerDay: 10, cards: SAMPLE_EN.map(([f, b]) => newCard(uid(), f, b)) };
  // ทำให้บางใบเหมือนเคยเรียนแล้ว เพื่อให้เห็นคิวทบทวนและกราฟล่วงหน้า
  en.cards = en.cards.map((c, i) => {
    if (i >= 8) return c;
    const reps = 1 + (i % 3);
    const interval = [1, 6, 15][reps - 1]!;
    return { ...c, reps, interval, ease: 2.5 - (i % 2) * 0.2, due: addDays(today, i < 4 ? -(i % 2) : i - 2) };
  });
  const it: Deck = { id: uid(), name: "ศัพท์ IT / โปรแกรมเมอร์", newPerDay: 5, cards: SAMPLE_IT.map(([f, b]) => newCard(uid(), f, b)) };
  return [en, it];
}

function days(n: number, T: TFn) {
  if (n < 30) return T(`${n} วัน`, n === 1 ? "1 day" : `${n} days`);
  if (n < 365) return T(`${Math.round(n / 30)} เดือน`, `${Math.round(n / 30)} mo`);
  return T(`${(n / 365).toFixed(1)} ปี`, `${(n / 365).toFixed(1)} yr`);
}

export function FlashcardsApp() {
  const lang = useLang();
  const T: TFn = (th, en) => (lang === "th" ? th : en);
  const [store, setStore, ready] = useStoredState<Store>("tool-flashcards-v1", empty);
  const [view, setViewRaw] = useState<View>("decks");
  const setView = useHashView(VIEWS, "decks", setViewRaw);
  const [toast, show] = useToast();
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayIso()), []);

  const deck = store.decks.find((d) => d.id === store.activeId) ?? store.decks[0] ?? null;
  const setDeck = (f: (d: Deck) => Deck) => setStore((s) => ({ ...s, decks: s.decks.map((d) => (d.id === deck?.id ? f(d) : d)) }));
  const logFor = (id: string) => store.log.find((l) => l.deckId === id && l.date === today);
  const dueNow = deck && today ? queue(deck, today, logFor(deck.id)?.fresh ?? 0).length : 0;

  const tabs = [
    { id: "decks" as const, label: T("ชุดบัตรคำ", "Decks") },
    { id: "study" as const, label: T("ทบทวน", "Study"), badge: dueNow || undefined },
    { id: "cards" as const, label: T("จัดการบัตร", "Cards") },
    { id: "stats" as const, label: T("สถิติ", "Stats") },
    { id: "settings" as const, label: T("ข้อมูล", "Data") },
  ];

  if (!ready || !today) return <div className="bigapp srs" aria-busy="true" />;

  return (
    <div className="bigapp srs">
      {toast}
      <div className="bigapp-bar">
        <p className="bigapp-name">{deck ? deck.name : T("บัตรคำ", "Flashcards")}</p>
        <Tabs tabs={tabs} value={view} onChange={setView} label={T("เมนูบัตรคำ", "Flashcard sections")} />
      </div>

      {store.decks.length === 0 && view !== "settings" && (
        <div className="panel empty-state">
          <p>{T("ยังไม่มีชุดบัตรคำ สร้างชุดใหม่แล้ววางคำศัพท์จาก Excel/Google Sheets ได้เลย หรือลองชุดตัวอย่าง (ศัพท์อังกฤษที่ทำงาน + ศัพท์ IT)", "No decks yet. Create one and paste words from a spreadsheet, or try the sample decks.")}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { const d = sampleDecks(today); setStore((s) => ({ ...s, decks: [...s.decks, ...d], activeId: d[0]!.id })); show(T("เพิ่มชุดตัวอย่างแล้ว", "Sample decks added")); }}>
              {T("ใช้ชุดตัวอย่าง", "Use sample decks")}
            </button>
          </div>
        </div>
      )}

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === view)!.label}>
        {view === "decks" && <DecksView store={store} setStore={setStore} today={today} T={T} show={show} logFor={logFor} onStudy={(id) => { setStore((s) => ({ ...s, activeId: id })); setView("study"); }} onEdit={(id) => { setStore((s) => ({ ...s, activeId: id })); setView("cards"); }} />}
        {view === "study" && deck && <StudyView key={deck.id} deck={deck} setDeck={setDeck} setStore={setStore} today={today} T={T} newToday={logFor(deck.id)?.fresh ?? 0} onDone={() => setView("decks")} />}
        {view === "cards" && deck && <CardsView deck={deck} setDeck={setDeck} today={today} T={T} show={show} />}
        {view === "stats" && deck && <StatsView deck={deck} log={store.log} today={today} T={T} />}
        {view === "settings" && <DataView store={store} setStore={setStore} T={T} show={show} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ DECKS */
function DecksView({ store, setStore, today, T, show, logFor, onStudy, onEdit }: {
  store: Store; setStore: (f: (s: Store) => Store) => void; today: string; T: TFn; show: (m: string) => void; logFor: (id: string) => Log | undefined; onStudy: (id: string) => void; onEdit: (id: string) => void;
}) {
  const fid = useId();
  const [name, setName] = useState("");
  return (
    <section className="panel">
      <h2 className="panel-title">{T("ชุดบัตรคำของฉัน", "My decks")}</h2>
      <ul className="deck-grid">
        {store.decks.map((d) => {
          const s = deckStats(d, today);
          const q = queue(d, today, logFor(d.id)?.fresh ?? 0);
          const newInQ = q.filter((c) => c.due === null).length;
          return (
            <li key={d.id} className={`deck${d.id === store.activeId ? " is-active" : ""}`}>
              <h3>{d.name}</h3>
              <dl className="deck-nums">
                <div><dt>{T("ถึงกำหนด", "Due")}</dt><dd className={s.due ? "due-n" : ""}>{s.due}</dd></div>
                <div><dt>{T("ใหม่วันนี้", "New today")}</dt><dd>{newInQ}</dd></div>
                <div><dt>{T("ทั้งหมด", "Total")}</dt><dd>{s.total}</dd></div>
              </dl>
              <div className="side-actions">
                <button type="button" className="btn btn-primary btn-sm" disabled={!q.length} onClick={() => onStudy(d.id)}>
                  {q.length ? T(`ทบทวน ${q.length} ใบ`, `Study ${q.length}`) : T("วันนี้ครบแล้ว", "Done for today")}<span className="sr-only"> — {d.name}</span>
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(d.id)}>{T("แก้ไขบัตร", "Edit cards")}<span className="sr-only"> — {d.name}</span></button>
              </div>
            </li>
          );
        })}
      </ul>
      <form className="inline-add" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const d: Deck = { id: uid(), name: name.trim(), cards: [], newPerDay: 10 };
        setStore((s) => ({ ...s, decks: [...s.decks, d], activeId: d.id }));
        setName("");
        show(T(`สร้างชุด “${d.name}” แล้ว — ไปที่ “จัดการบัตร” เพื่อเพิ่มบัตร`, `Created “${d.name}” — add cards under “Cards”`));
      }}>
        <label className="sr-only" htmlFor={`${fid}-n`}>{T("ชื่อชุดใหม่", "New deck name")}</label>
        <input id={`${fid}-n`} value={name} onChange={(e) => setName(e.target.value)} placeholder={T("ชื่อชุดใหม่ เช่น ศัพท์ญี่ปุ่น N5", "New deck, e.g. Spanish A1")} />
        <button type="submit" className="btn btn-outline btn-sm">{T("สร้างชุด", "Create deck")}</button>
      </form>
      <details className="how">
        <summary>{T("ระบบนี้ทำงานยังไง", "How does this work?")}</summary>
        <p>{T("ใช้อัลกอริทึม SM-2 (spaced repetition): ทุกครั้งที่ตอบ ให้ประเมินว่าจำได้แค่ไหน ใบที่จำได้ดีจะเว้นระยะนานขึ้นเรื่อยๆ (1 → 6 → 15 → 38 วัน…) ใบที่ลืมจะกลับมาถามพรุ่งนี้ — ทบทวนวันละไม่กี่นาทีแต่จำได้ยาว", "Uses SM-2 spaced repetition: rate how well you remembered; well-known cards come back at growing intervals (1 → 6 → 15 → 38 days…), forgotten ones return tomorrow.")}</p>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ STUDY */
function StudyView({ deck, setDeck, setStore, today, T, newToday, onDone }: {
  deck: Deck; setDeck: (f: (d: Deck) => Deck) => void; setStore: (f: (s: Store) => Store) => void; today: string; T: TFn; newToday: number; onDone: () => void;
}) {
  // snapshot คิวตอนเริ่ม — ใบที่กด “ลืม” จะถูกต่อท้ายคิวให้ถามอีกรอบในรอบนี้
  const [ids, setIds] = useState<string[]>(() => queue(deck, today, newToday).map((c) => c.id));
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [tally, setTally] = useState({ done: 0, correct: 0 });
  const revealBtn = useRef<HTMLButtonElement>(null);
  const card = deck.cards.find((c) => c.id === ids[pos]) ?? null;
  const canQuiz = new Set(deck.cards.map((c) => c.back)).size >= 4;
  const opts = useMemo(() => (card && canQuiz ? choices(deck, card, Math.random) : []), [card?.id, pos, canQuiz]);
  const pv = card ? preview(card, today) : null;

  useEffect(() => {
    revealBtn.current?.focus({ preventScroll: true });
  }, [pos]);

  function grade(g: Grade) {
    if (!card) return;
    const wasNew = card.due === null;
    const next = review(card, g, today);
    setDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? next : c)) }));
    setStore((s) => {
      const cur = s.log.find((l) => l.deckId === deck.id && l.date === today) ?? { date: today, deckId: deck.id, fresh: 0, reviews: 0, correct: 0 };
      const upd = { ...cur, fresh: cur.fresh + (wasNew ? 1 : 0), reviews: cur.reviews + 1, correct: cur.correct + (g === "again" ? 0 : 1) };
      return { ...s, log: [...s.log.filter((l) => !(l.deckId === deck.id && l.date === today)), upd].slice(-400) };
    });
    setTally((t) => ({ done: t.done + 1, correct: t.correct + (g === "again" ? 0 : 1) }));
    if (g === "again") setIds((l) => [...l, card.id]);
    setPos((p) => p + 1);
    setShown(false);
    setPicked(null);
  }

  function pick(i: number) {
    if (picked !== null || !card) return;
    setPicked(i);
    setShown(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, dialog") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!card) return;
      if (quiz && picked === null && /^[1-4]$/.test(e.key) && opts[Number(e.key) - 1] !== undefined) {
        e.preventDefault();
        pick(Number(e.key) - 1);
        return;
      }
      if (!shown && (e.key === " " || e.key === "Enter") && t.tagName !== "BUTTON") {
        e.preventDefault();
        setShown(true);
        return;
      }
      if (shown && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        if (quiz && picked !== null) grade(opts[picked] === card.back ? (e.key === "4" ? "easy" : "good") : "again");
        else grade(GRADES[Number(e.key) - 1]!.g);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const remaining = ids.length - pos;
  if (!card) {
    return (
      <section className="panel study-done">
        <h2 className="panel-title">{tally.done ? T("ทบทวนครบแล้ว!", "All done!") : T("ไม่มีบัตรที่ต้องทบทวนตอนนี้", "Nothing to review right now")}</h2>
        {tally.done > 0 && <p>{T(`ตอบ ${tally.done} ครั้ง จำได้ ${Math.round((tally.correct / tally.done) * 100)}%`, `${tally.done} answers, ${Math.round((tally.correct / tally.done) * 100)}% remembered`)}</p>}
        <p className="hint">{T("กลับมาพรุ่งนี้ ระบบจะเรียกบัตรที่ใกล้ลืมมาให้ทบทวนเอง", "Come back tomorrow — cards return right before you'd forget them.")}</p>
        <div className="side-actions"><button type="button" className="btn btn-primary btn-sm" onClick={onDone}>{T("กลับไปหน้าชุดบัตร", "Back to decks")}</button></div>
      </section>
    );
  }

  const correct = picked !== null && opts[picked] === card.back;
  return (
    <section className="panel study" aria-label={T("ทบทวนบัตรคำ", "Study session")}>
      <div className="panel-row">
        <p className="study-progress">
          <span aria-live="polite">{T(`เหลือ ${remaining} ใบ`, `${remaining} left`)}</span>
          {card.due === null && <span className="tag-new">{T("ใหม่", "new")}</span>}
        </p>
        <label className="check-row">
          <input type="checkbox" checked={quiz} disabled={!canQuiz} onChange={(e) => { setQuiz(e.target.checked); setShown(false); setPicked(null); }} />
          {T("โหมดเลือกตอบ", "Multiple choice")}
          {!canQuiz && <small> ({T("ต้องมีคำตอบต่างกันอย่างน้อย 4 แบบ", "needs 4+ distinct answers")})</small>}
        </label>
      </div>
      <span className="progress-bar" role="img" aria-label={T(`ทำไปแล้ว ${pos} จาก ${ids.length}`, `${pos} of ${ids.length} done`)}><i style={{ width: `${(pos / ids.length) * 100}%` }} /></span>

      <div className={`flash${shown ? " is-shown" : ""}`}>
        <p className="flash-front">{card.front}</p>
        {!quiz && (
          shown ? <p className="flash-back" aria-live="polite">{card.back}</p> : (
            <button ref={revealBtn} type="button" className="btn btn-outline flash-reveal" onClick={() => setShown(true)}>
              {T("ดูคำตอบ", "Show answer")} <kbd>Space</kbd>
            </button>
          )
        )}
        {quiz && (
          <div className="quiz-opts" role="group" aria-label={T("ตัวเลือกคำตอบ", "Answer choices")}>
            {opts.map((o, i) => (
              <button
                key={i}
                ref={i === 0 ? revealBtn : undefined}
                type="button"
                className={`quiz-opt${picked !== null && o === card.back ? " is-right" : ""}${picked === i && o !== card.back ? " is-wrong" : ""}`}
                aria-disabled={picked !== null || undefined}
                onClick={() => pick(i)}
              >
                <kbd>{i + 1}</kbd> {o}
                {picked !== null && o === card.back && <span className="sr-only"> ({T("คำตอบที่ถูก", "correct answer")})</span>}
                {picked === i && o !== card.back && <span className="sr-only"> ({T("คุณเลือก — ผิด", "your pick — wrong")})</span>}
              </button>
            ))}
            {picked !== null && <p className={`quiz-result ${correct ? "ok" : "bad"}`} role="status">{correct ? T("ถูกต้อง!", "Correct!") : T(`ยังไม่ถูก — คำตอบคือ “${card.back}”`, `Not quite — it's “${card.back}”`)}</p>}
          </div>
        )}
      </div>

      {shown && pv && (
        quiz ? (
          <div className="side-actions grade-row">
            {correct ? (
              <>
                <button type="button" className="btn btn-primary" autoFocus onClick={() => grade("good")}>{T("ต่อไป", "Next")} <small>({days(pv.good, T)})</small></button>
                <button type="button" className="btn btn-outline" onClick={() => grade("easy")}>{T("ง่ายมาก", "Easy")} <small>({days(pv.easy, T)})</small></button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" autoFocus onClick={() => grade("again")}>{T("ต่อไป (จะถามอีกรอบ)", "Next (will repeat)")}</button>
            )}
          </div>
        ) : (
          <div className="grade-row grade-4" role="group" aria-label={T("จำได้แค่ไหน", "How well did you remember?")}>
            {GRADES.map(({ g, key, th, en }) => (
              <button key={g} type="button" className={`grade grade-${g}`} autoFocus={g === "good"} onClick={() => grade(g)}>
                <span className="grade-name">{T(th, en)}</span>
                <small>{days(pv[g], T)}</small>
                <kbd aria-hidden="true">{key}</kbd>
              </button>
            ))}
          </div>
        )
      )}
      <p className="hint kb-hint">{T("คีย์ลัด: Space = ดูคำตอบ, 1–4 = ให้คะแนน (ในโหมดเลือกตอบ 1–4 = เลือกข้อ)", "Shortcuts: Space shows the answer, 1–4 rates it (in multiple choice, 1–4 picks an option)")}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ CARDS */
function CardsView({ deck, setDeck, today, T, show }: { deck: Deck; setDeck: (f: (d: Deck) => Deck) => void; today: string; T: TFn; show: (m: string) => void }) {
  const fid = useId();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [edit, setEdit] = useState<SrsCard | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseCards(paste), [paste]);
  const list = deck.cards.filter((c) => !q.trim() || `${c.front} ${c.back}`.toLowerCase().includes(q.trim().toLowerCase()));
  const dupe = front.trim() && deck.cards.some((c) => c.front.trim().toLowerCase() === front.trim().toLowerCase());

  return (
    <div className="report-grid">
      <section className="panel">
        <h2 className="panel-title">{T("เพิ่มบัตร", "Add a card")}</h2>
        <form className="stack-form" onSubmit={(e) => {
          e.preventDefault();
          if (!front.trim() || !back.trim()) return;
          setDeck((d) => ({ ...d, cards: [...d.cards, newCard(uid(), front.trim(), back.trim())] }));
          show(T(`เพิ่ม “${front.trim()}” แล้ว`, `Added “${front.trim()}”`));
          setFront("");
          setBack("");
          frontRef.current?.focus();
        }}>
          <div className="field">
            <label htmlFor={`${fid}-f`}>{T("ด้านหน้า (คำถาม)", "Front (prompt)")}</label>
            <input ref={frontRef} id={`${fid}-f`} value={front} onChange={(e) => setFront(e.target.value)} aria-describedby={`${fid}-fd`} />
            <p className="field-hint" id={`${fid}-fd`}>{dupe ? T("มีบัตรนี้อยู่แล้วในชุด", "This card already exists") : ""}</p>
          </div>
          <div className="field"><label htmlFor={`${fid}-b`}>{T("ด้านหลัง (คำตอบ)", "Back (answer)")}</label><textarea id={`${fid}-b`} rows={2} value={back} onChange={(e) => setBack(e.target.value)} /></div>
          <div className="side-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!front.trim() || !back.trim()}>{T("เพิ่มบัตร", "Add card")}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setImportOpen(true)}>{T("วางหลายใบ / นำเข้า CSV", "Paste many / import CSV")}</button>
          </div>
        </form>

        <p className="mini-title">{T("ตั้งค่าชุดนี้", "Deck settings")}</p>
        <div className="form-grid-2">
          <div className="field"><label htmlFor={`${fid}-dn`}>{T("ชื่อชุด", "Deck name")}</label><input id={`${fid}-dn`} value={deck.name} onChange={(e) => setDeck((d) => ({ ...d, name: e.target.value }))} /></div>
          <div className="field"><label htmlFor={`${fid}-np`}>{T("บัตรใหม่ต่อวัน", "New cards per day")}</label><input id={`${fid}-np`} type="number" min={0} max={200} value={deck.newPerDay} onChange={(e) => setDeck((d) => ({ ...d, newPerDay: Math.max(0, Math.min(200, Number(e.target.value) || 0)) }))} /></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-row">
          <h2 className="panel-title">{T("บัตรในชุด", "Cards in deck")} <span className="muted-count">({deck.cards.length})</span></h2>
          <div className="field field--inline"><label htmlFor={`${fid}-q`}>{T("ค้นหา", "Search")}</label><input id={`${fid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        {list.length === 0 ? <p className="hint">{T("ยังไม่มีบัตร", "No cards")}</p> : (
          <div className="table-wrap card-table" tabIndex={0} role="region" aria-label={T("ตารางบัตร", "Cards table")}>
            <table className="docs">
              <thead><tr><th scope="col">{T("หน้า", "Front")}</th><th scope="col">{T("หลัง", "Back")}</th><th scope="col">{T("ครั้งถัดไป", "Next")}</th><th scope="col"><span className="sr-only">{T("แก้ไข", "Edit")}</span></th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.front}</th>
                    <td>{c.back}</td>
                    <td className="nowrap">{c.due === null ? <span className="tag-new">{T("ใหม่", "new")}</span> : c.due <= today ? T("วันนี้", "today") : new Date(`${c.due}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</td>
                    <td><button type="button" className="text-link" onClick={() => setEdit(c)}>{T("แก้ไข", "Edit")}<span className="sr-only"> {c.front}</span></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={!deck.cards.length} onClick={() => {
            const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
            download(`${deck.name}.csv`, "﻿front,back\n" + deck.cards.map((c) => `${esc(c.front)},${esc(c.back)}`).join("\n"), "text/csv;charset=utf-8");
          }}>{T("ส่งออก CSV", "Export CSV")}</button>
          <ConfirmButton label={T("เริ่มนับใหม่ทั้งชุด", "Reset progress")} confirmLabel={T("กดอีกครั้ง — ทุกใบจะกลับเป็นบัตรใหม่", "Tap again — all cards become new")} onConfirm={() => { setDeck((d) => ({ ...d, cards: d.cards.map((c) => newCard(c.id, c.front, c.back)) })); show(T("รีเซ็ตแล้ว", "Reset")); }} />
        </div>
      </section>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={T("วางหลายใบพร้อมกัน", "Paste many cards")} wide>
        <p className="hint">{T("ก๊อปสองคอลัมน์จาก Excel/Google Sheets มาวางได้เลย หรือพิมพ์บรรทัดละใบแบบ “คำ - ความหมาย” / CSV “หน้า,หลัง”", "Paste two columns from a spreadsheet, or one card per line as “word - meaning” or CSV “front,back”.")}</p>
        <div className="field">
          <label htmlFor={`${fid}-p`}>{T("ข้อความ", "Text")}</label>
          <textarea id={`${fid}-p`} rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"apple - แอปเปิล\nbanana - กล้วย"} />
        </div>
        <div className="side-actions">
          <label className="btn btn-outline btn-sm file-btn">
            {T("เลือกไฟล์ CSV/TXT", "Choose CSV/TXT")}
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPaste(await readFile(f)); }} />
          </label>
        </div>
        <p className="mini-title" aria-live="polite">{T(`พบ ${parsed.length} ใบ`, `${parsed.length} card(s) found`)}</p>
        {parsed.length > 0 && (
          <ul className="parse-preview">
            {parsed.slice(0, 6).map((c, i) => <li key={i}><b>{c.front}</b> → {c.back}</li>)}
            {parsed.length > 6 && <li>… {T(`และอีก ${parsed.length - 6} ใบ`, `and ${parsed.length - 6} more`)}</li>}
          </ul>
        )}
        <div className="side-actions modal-foot">
          <button type="button" className="btn btn-primary btn-sm" disabled={!parsed.length} onClick={() => {
            const have = new Set(deck.cards.map((c) => c.front.trim().toLowerCase()));
            const add = parsed.filter((c) => !have.has(c.front.toLowerCase()));
            setDeck((d) => ({ ...d, cards: [...d.cards, ...add.map((c) => newCard(uid(), c.front, c.back))] }));
            show(T(`เพิ่ม ${add.length} ใบ${parsed.length - add.length ? ` (ข้ามที่ซ้ำ ${parsed.length - add.length})` : ""}`, `Added ${add.length}${parsed.length - add.length ? ` (skipped ${parsed.length - add.length} duplicates)` : ""}`));
            setPaste("");
            setImportOpen(false);
          }}>{T(`เพิ่ม ${parsed.length} ใบ`, `Add ${parsed.length}`)}</button>
        </div>
      </Modal>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={T("แก้ไขบัตร", "Edit card")}>
        {edit && (
          <form className="stack-form" onSubmit={(e) => {
            e.preventDefault();
            setDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === edit.id ? edit : c)) }));
            setEdit(null);
          }}>
            <div className="field"><label htmlFor={`${fid}-ef`}>{T("ด้านหน้า", "Front")}</label><input id={`${fid}-ef`} value={edit.front} onChange={(e) => setEdit({ ...edit, front: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${fid}-eb`}>{T("ด้านหลัง", "Back")}</label><textarea id={`${fid}-eb`} rows={3} value={edit.back} onChange={(e) => setEdit({ ...edit, back: e.target.value })} /></div>
            <p className="hint">{edit.due === null ? T("ยังไม่เคยทบทวน", "Not studied yet") : T(`ทบทวนถัดไป ${edit.due} · ระยะห่าง ${edit.interval} วัน · ลืมไป ${edit.lapses} ครั้ง`, `Next ${edit.due} · interval ${edit.interval}d · lapses ${edit.lapses}`)}</p>
            <div className="side-actions modal-foot">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!edit.front.trim() || !edit.back.trim()}>{T("บันทึก", "Save")}</button>
              <ConfirmButton label={T("ลบบัตร", "Delete card")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again to delete")} onConfirm={() => { setDeck((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== edit.id) })); setEdit(null); }} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ STATS */
function StatsView({ deck, log, today, T }: { deck: Deck; log: Log[]; today: string; T: TFn }) {
  const s = deckStats(deck, today);
  const fc = forecast(deck, today, 7);
  const maxF = Math.max(1, ...fc.map((f) => f.count));
  const hist = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    const l = log.find((x) => x.deckId === deck.id && x.date === day);
    return { day, reviews: l?.reviews ?? 0, correct: l?.correct ?? 0 };
  });
  const maxH = Math.max(1, ...hist.map((h) => h.reviews));
  const totalRev = hist.reduce((t, h) => t + h.reviews, 0);
  const totalOk = hist.reduce((t, h) => t + h.correct, 0);
  let streak = 0;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i]!.reviews > 0) streak++;
    else if (i !== hist.length - 1) break;
  }
  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short" });
  const hard = [...deck.cards].filter((c) => c.lapses > 0 || (c.due !== null && c.ease < 2.3)).sort((a, b) => b.lapses - a.lapses || a.ease - b.ease).slice(0, 6);

  return (
    <div className="report-grid">
      <section className="panel">
        <h2 className="panel-title">{T("ภาพรวมชุด", "Deck overview")}</h2>
        <dl className="money-kpis kpis-4">
          <div><dt>{T("ถึงกำหนดวันนี้", "Due today")}</dt><dd>{s.due}</dd></div>
          <div><dt>{T("ยังไม่เรียน", "New")}</dt><dd>{s.fresh}</dd></div>
          <div><dt>{T("กำลังจำ", "Learning")}</dt><dd>{s.learning}</dd></div>
          <div><dt>{T("จำขึ้นใจ (≥21 วัน)", "Mature (≥21d)")}</dt><dd>{s.mature}</dd></div>
        </dl>
        <p className="mini-title">{T("บัตรที่จะถึงกำหนด 7 วันข้างหน้า", "Due in the next 7 days")}</p>
        <ul className="week-bars week-bars--wide" aria-label={T("จำนวนบัตรที่ถึงกำหนดแต่ละวัน", "Cards due per day")}>
          {fc.map((f, i) => (
            <li key={f.day}>
              <span className="wb-num" aria-hidden="true">{f.count}</span>
              <span className="wb-bar" aria-hidden="true"><i style={{ height: `${(f.count / maxF) * 100}%` }} /></span>
              <span className="wb-day">{i === 0 ? T("วันนี้", "Today") : dayLabel(f.day)}</span>
              <span className="sr-only">{f.day}: {f.count}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">{T("การทบทวน 14 วัน", "Last 14 days")}</h2>
        <dl className="money-kpis">
          <div><dt>{T("ทบทวนต่อเนื่อง", "Streak")}</dt><dd>{streak} {T("วัน", "d")}</dd></div>
          <div><dt>{T("จำได้", "Recall")}</dt><dd>{totalRev ? Math.round((totalOk / totalRev) * 100) : 0}%</dd></div>
        </dl>
        <ul className="week-bars week-bars--wide hist-bars" aria-label={T("จำนวนครั้งที่ทบทวนต่อวัน", "Reviews per day")}>
          {hist.map((h) => (
            <li key={h.day}>
              <span className="wb-bar" aria-hidden="true"><i style={{ height: `${(h.reviews / maxH) * 100}%` }} /></span>
              <span className="wb-day">{Number(h.day.slice(8))}</span>
              <span className="sr-only">{h.day}: {h.reviews}</span>
            </li>
          ))}
        </ul>
        <p className="mini-title">{T("บัตรที่ลืมบ่อย", "Trouble cards")}</p>
        {hard.length === 0 ? <p className="hint">{T("ยังไม่มี", "None yet")}</p> : (
          <ul className="top-list">{hard.map((c) => <li key={c.id}><span>{c.front}</span><span className="mono">{T(`ลืม ${c.lapses}`, `${c.lapses} lapses`)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ DATA */
function DataView({ store, setStore, T, show }: { store: Store; setStore: (f: (s: Store) => Store) => void; T: TFn; show: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const active = store.decks.find((d) => d.id === store.activeId) ?? store.decks[0];
  return (
    <section className="panel settings-panel">
      <h2 className="panel-title">{T("สำรองและกู้คืน", "Backup & restore")}</h2>
      <div className="side-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={!store.decks.length} onClick={() => download(`flashcards-${todayIso()}.json`, JSON.stringify(store), "application/json")}>{T("สำรองข้อมูลทั้งหมด", "Back up everything")}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("กู้คืนจากไฟล์", "Restore")}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const d = JSON.parse(await readFile(f)) as Store;
            if (!Array.isArray(d.decks) || !d.decks.every((x) => Array.isArray(x.cards))) throw new Error();
            setStore(() => ({ ...empty(), ...d }));
            show(T("กู้คืนแล้ว", "Restored"));
          } catch {
            show(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองบัตรคำ", "Not a flashcards backup"));
          }
        }} />
      </div>
      {active && (
        <>
          <p className="mini-title">{T("ชุดที่เลือก", "Selected deck")}: {active.name}</p>
          <div className="side-actions">
            <ConfirmButton label={T("ลบชุดนี้", "Delete this deck")} confirmLabel={T(`กดอีกครั้งเพื่อลบ ${active.cards.length} ใบ`, `Tap again to delete ${active.cards.length} cards`)} onConfirm={() => setStore((s) => {
              const decks = s.decks.filter((d) => d.id !== active.id);
              return { ...s, decks, activeId: decks[0]?.id ?? null, log: s.log.filter((l) => l.deckId !== active.id) };
            })} />
          </div>
        </>
      )}
      <p className="mini-title">{T("ล้างทั้งหมด", "Reset")}</p>
      <ConfirmButton label={T("ลบข้อมูลทั้งหมด", "Delete all data")} confirmLabel={T("กดอีกครั้งเพื่อลบทุกอย่าง", "Tap again to delete everything")} onConfirm={() => setStore(() => empty())} />
      <p className="privacy">{T("บัตรคำและประวัติการทบทวนเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น สำรองไฟล์ไว้เพื่อย้ายไปเครื่องอื่น", "Cards and history stay in this browser. Back up to move devices.")}</p>
    </section>
  );
}
