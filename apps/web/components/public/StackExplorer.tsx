"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { LayerId, Localized } from "@portfolio/shared";

export type ExplorerLayer = {
  id: LayerId;
  label: Localized;
  hint: Localized;
  projects: { slug: string; title: Localized }[];
  tools: string[];
};

function L({ t }: { t: Localized }) {
  if (t.th === t.en) return <>{t.th}</>;
  return (
    <>
      <span lang="th" className="i18n-th">{t.th}</span>
      <span lang="en" className="i18n-en">{t.en}</span>
    </>
  );
}

/**
 * แผนภาพ "ชั้นของระบบ" แบบกดสำรวจได้ — ปุ่มแต่ละชั้นเปิดรายการผลงานและเครื่องมือของชั้นนั้น
 * ใช้คีย์บอร์ดได้ (Tab/Enter หรือ ลูกศรขึ้นลง) และแผงรายละเอียดประกาศผ่าน aria-live
 */
export function StackExplorer({ layers, initial }: { layers: ExplorerLayer[]; initial: LayerId }) {
  const [active, setActive] = useState<LayerId>(initial);
  const panelId = useId();
  const current = layers.find((l) => l.id === active) ?? layers[0]!;

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = layers[(i + (e.key === "ArrowDown" ? 1 : layers.length - 1)) % layers.length]!;
    setActive(next.id);
    document.getElementById(`plate-${next.id}`)?.focus();
  }

  return (
    <div className="explorer">
      <p className="explorer-caption" id={`${panelId}-cap`}>
        <span className="i18n-th">กดที่แต่ละชั้นเพื่อดูว่าผมทำอะไรไว้บ้าง</span>
        <span className="i18n-en">Pick a layer to see what I&apos;ve built there</span>
      </p>
      <ol className="plates" aria-labelledby={`${panelId}-cap`}>
        {layers.map((l, i) => (
          <li key={l.id} style={{ "--i": i } as React.CSSProperties}>
            <button
              id={`plate-${l.id}`}
              type="button"
              className="plate"
              data-layer={l.id}
              aria-pressed={active === l.id}
              aria-controls={panelId}
              onClick={() => setActive(l.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="plate-idx" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="plate-name"><L t={l.label} /></span>
              <span className="plate-count">
                {l.projects.length}
                <span className="sr-only"> projects</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="explorer-panel" id={panelId} aria-live="polite" data-layer={current.id}>
        <p className="panel-hint"><L t={current.hint} /></p>
        {current.projects.length > 0 ? (
          <ul className="panel-projects">
            {current.projects.map((p) => (
              <li key={p.slug}>
                <Link href={`/projects/${p.slug}/`}><L t={p.title} /> <span aria-hidden="true">→</span></Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-empty">
            <span className="i18n-th">ยังไม่มีผลงานในชั้นนี้</span>
            <span className="i18n-en">Nothing here yet</span>
          </p>
        )}
        {current.tools.length > 0 && (
          <p className="panel-tools">
            <span className="i18n-th">เครื่องมือ: </span>
            <span className="i18n-en">Tools: </span>
            {current.tools.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
