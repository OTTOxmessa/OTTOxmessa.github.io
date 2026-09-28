"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Lang = "th" | "en";
type Theme = "dark" | "light";

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked — ignore */
  }
}

export function Header({ brand }: { brand: string }) {
  const [lang, setLang] = useState<Lang>("th");
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setLang((root.dataset.lang as Lang) ?? "th");
    setTheme((root.dataset.theme as Theme) ?? "dark");
  }, []);

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

  const nav = [
    { href: "/", th: "หน้าแรก", en: "home" },
    { href: "/projects/", th: "ผลงาน", en: "projects" },
    { href: "/#skills", th: "ทักษะ", en: "skills" },
    { href: "/#contact", th: "ติดต่อ", en: "contact" },
  ];

  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link className="brand" href="/" aria-label="Home">
          <span className="brand-bracket">[</span>
          <span className="brand-mark">{brand}</span>
          <span className="brand-bracket">]</span>
        </Link>

        <nav className={`main-nav${open ? " is-open" : ""}`} id="main-nav" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link" onClick={() => setOpen(false)}>
              <span className="nav-path">~/</span>
              <span className="i18n-th">{n.th}</span>
              <span className="i18n-en">{n.en}</span>
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <div className="lang-toggle" role="group" aria-label="Language / ภาษา">
            {(["th", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={`lang-btn${lang === l ? " is-active" : ""}`}
                aria-pressed={lang === l}
                onClick={() => changeLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle light / dark theme">
            <svg className="icon-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
              <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="12" y1="1.8" x2="12" y2="4.4" /><line x1="12" y1="19.6" x2="12" y2="22.2" />
                <line x1="1.8" y1="12" x2="4.4" y2="12" /><line x1="19.6" y1="12" x2="22.2" y2="12" />
                <line x1="4.6" y1="4.6" x2="6.4" y2="6.4" /><line x1="17.6" y1="17.6" x2="19.4" y2="19.4" />
                <line x1="4.6" y1="19.4" x2="6.4" y2="17.6" /><line x1="17.6" y1="6.4" x2="19.4" y2="4.6" />
              </g>
            </svg>
            <svg className="icon-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
