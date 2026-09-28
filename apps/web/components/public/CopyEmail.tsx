"use client";

import { useState } from "react";

export function CopyEmail({ email }: { email: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch {
      /* clipboard ถูกบล็อก — อีเมลยังแสดงบนหน้าอยู่แล้ว */
    }
  }
  return (
    <button type="button" className="btn btn-ghost-light" onClick={copy}>
      {done ? (
        <><span className="i18n-th">คัดลอกแล้ว ✓</span><span className="i18n-en">Copied ✓</span></>
      ) : (
        <><span className="i18n-th">คัดลอกอีเมล</span><span className="i18n-en">Copy email</span></>
      )}
      <span className="sr-only" role="status">{done ? "Copied" : ""}</span>
    </button>
  );
}
