"use client";

import { LAYERS, type LayerId } from "@portfolio/shared";
import { useEffect, useState, type ReactNode } from "react";

/**
 * ตัวกรองตาม layer — ทำงานฝั่ง browser ทั้งหมด (static export ไม่มี server)
 * ซ่อน/แสดงแถวผลงานที่ render ไว้แล้วด้วย data-layers และเก็บค่าไว้ใน ?layer=
 */
export function ProjectFilter({ counts, children }: { counts: Record<string, number>; children: ReactNode }) {
  const [active, setActive] = useState<LayerId | "all">("all");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("layer");
    if (q && LAYERS.some((l) => l.id === q)) setActive(q as LayerId);
  }, []);

  function select(next: LayerId | "all") {
    setActive(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("layer");
    else url.searchParams.set("layer", next);
    window.history.replaceState(null, "", url);
  }

  const tabs = [{ id: "all" as const, th: "ทั้งหมด", en: "All" }, ...LAYERS.map((l) => ({ id: l.id, ...l.label }))];

  return (
    <div className="project-filter" data-active={active}>
      <div className="filter-tabs" role="group" aria-label="Filter by layer">
        {tabs.map((t) => {
          const count = t.id === "all" ? counts.all : counts[t.id];
          if (!count) return null;
          return (
            <button
              key={t.id}
              type="button"
              className={`filter-tab${active === t.id ? " is-active" : ""}`}
              aria-pressed={active === t.id}
              onClick={() => select(t.id)}
              data-layer={t.id}
            >
              <span className="i18n-th">{t.th}</span>
              <span className="i18n-en">{t.en}</span>
              <span className="filter-count">{count}</span>
            </button>
          );
        })}
      </div>
      <style>{active === "all" ? "" : `.project-list .project-row:not([data-layers~="${active}"]){display:none}`}</style>
      {children}
    </div>
  );
}
