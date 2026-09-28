"use client";

import { useEffect, useState } from "react";

export type Lang = "th" | "en";

/** อ่านภาษาปัจจุบันจาก <html data-lang> และอัปเดตเมื่อผู้ใช้สลับ — ใช้กับข้อความที่ต้องประกาศผ่าน aria-live */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("th");
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setLang(root.dataset.lang === "en" ? "en" : "th");
    update();
    const mo = new MutationObserver(update);
    mo.observe(root, { attributes: true, attributeFilter: ["data-lang"] });
    return () => mo.disconnect();
  }, []);
  return lang;
}
