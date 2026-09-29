"use client";

import { useEffect, useRef, useState } from "react";

/** state ที่จำไว้ในเครื่อง (localStorage) — ถ้า browser บล็อก storage ก็ยังใช้งานได้ปกติ แค่ไม่จำ */
export function useStoredState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value, ready]);
  return [value, setValue, ready] as const;
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function baht(n: number, lang: "th" | "en", decimals = 2) {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

/** ข้อความแจ้งสั้นๆ ที่ screen reader อ่านออกเสียง แล้วหายไปเอง */
export function useToast() {
  const [msg, setMsg] = useState("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  function show(text: string) {
    setMsg(text);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(""), 3000);
  }
  const node = (
    <div className={`toast${msg ? " is-on" : ""}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
  return [node, show] as const;
}

/** ปุ่มยืนยันสองจังหวะ (แทน confirm() ที่ขัดจังหวะ) */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className ?? "text-link"}${armed ? " is-danger" : ""}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file, "utf-8");
  });
}

/** ปุ่มคัดลอกที่บอกผลผ่าน toast */
export function CopyButton({ text, label, done, notify, className }: { text: string; label: string; done: string; notify: (m: string) => void; className?: string }) {
  return (
    <button
      type="button"
      className={className ?? "btn btn-outline btn-sm"}
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          notify(done);
        } catch {
          notify("Copy failed");
        }
      }}
    >
      {label}
    </button>
  );
}

/** วันนี้แบบ YYYY-MM-DD ตามเวลาเครื่อง */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
