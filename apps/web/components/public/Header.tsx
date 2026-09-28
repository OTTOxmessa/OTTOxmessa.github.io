"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Lang = "th" | "en";
type Theme = "dark" | "light";

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked — ignore */
  }
}

const NAV = [
  { href: "/#work", th: "ผลงาน", en: "Work" },
  { href: "/#lab", th: "Lab", en: "Lab" },
  { href: "/#toolbox", th: "เครื่องมือ", en: "Toolbox" },
  { href: "/#contact", th: "ติดต่อ", en: "Contact" },
];

export function Header({ brand }: { brand: string }) {
  const [lang, setLang] = useState<Lang>("th");
  const [theme, setTheme] = useState<Theme>("light");
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    setLang((root.dataset.lang as Lang) ?? "th");
    setTheme((root.dataset.theme as Theme) ?? "light");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function changeLang(next: Lang) {
    setLang(next);
    document.documentElement.dataset.lang = next;
    document.documentElement.lang = next;
    store("lang", next);
  }

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    store("theme", next);
  }

  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">{brand.slice(0, 1)}</span>
          {brand}
          <span className="sr-only"> — home</span>
        </Link>

        <nav className={`main-nav${open ? " is-open" : ""}`} id="main-nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link" onClick={() => setOpen(false)}>
              <span lang="th" className="i18n-th">{n.th}</span>
              <span lang="en" className="i18n-en">{n.en}</span>
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <div className="seg" role="group" aria-label="ภาษา / Language">
            <button type="button" lang="th" aria-pressed={lang === "th"} onClick={() => changeLang("th")} aria-label="ภาษาไทย">
              TH
            </button>
            <button type="button" lang="en" aria-pressed={lang === "en"} onClick={() => changeLang("en")} aria-label="English">
              EN
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
            aria-label="โหมดมืด / Dark mode"
          >
            <svg className="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            <svg className="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
              <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <line x1="12" y1="1.8" x2="12" y2="4.4" /><line x1="12" y1="19.6" x2="12" y2="22.2" />
                <line x1="1.8" y1="12" x2="4.4" y2="12" /><line x1="19.6" y1="12" x2="22.2" y2="12" />
                <line x1="4.6" y1="4.6" x2="6.4" y2="6.4" /><line x1="17.6" y1="17.6" x2="19.4" y2="19.4" />
                <line x1="4.6" y1="19.4" x2="6.4" y2="17.6" /><line x1="17.6" y1="6.4" x2="19.4" y2="4.6" />
              </g>
            </svg>
          </button>
          <button
            ref={menuBtn}
            type="button"
            className="icon-btn menu-toggle"
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label="เมนู / Menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="burger" aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
    </header>
  );
}
