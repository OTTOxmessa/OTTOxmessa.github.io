"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * แท็บตามแบบ WAI-ARIA: ลูกศรซ้าย/ขวา/Home/End เลื่อนแท็บ, จำแท็บไว้ใน URL (#view=...)
 * เพื่อให้กดย้อนกลับ/รีเฟรช/ส่งลิงก์แล้วเปิดแท็บเดิมได้
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; badge?: number | string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const base = useId();
  function onKey(e: React.KeyboardEvent, i: number) {
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[j]!.id);
    document.getElementById(`${base}-${tabs[j]!.id}`)?.focus();
  }
  return (
    <div className="app-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`${base}-${t.id}`}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.badge !== undefined && t.badge !== 0 && <span className="tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** state ของแท็บที่ซิงก์กับ URL hash */
export function useHashView<T extends string>(views: readonly T[], fallback: T, set: (v: T) => void) {
  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/view=([\w-]+)/);
      if (m && views.includes(m[1] as T)) set(m[1] as T);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return (v: T) => {
    set(v);
    history.replaceState(null, "", v === fallback ? window.location.pathname : `#view=${v}`);
  };
}

/** กล่องโต้ตอบด้วย <dialog> — ดัก focus, กด Esc ปิด, คืน focus ให้ปุ่มที่เปิด */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " modal--wide" : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="ปิด / Close">✕</button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

/** พิมพ์เฉพาะส่วนที่ต้องการ (ใบเสร็จ/ใบแจ้งหนี้) — ใส่ใน <PrintSheet> แล้วเรียก printNow() */
export function PrintSheet({ children }: { children: ReactNode }) {
  // ย้ายไปไว้ใต้ <body> โดยตรง ตอนพิมพ์จะซ่อนทุกอย่างอื่นได้ง่ายและไม่มีหน้าว่างเกิน
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<div className="print-sheet">{children}</div>, document.body);
}

export function printNow() {
  const html = document.documentElement;
  html.classList.add("printing");
  const done = () => {
    html.classList.remove("printing");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 60);
}
