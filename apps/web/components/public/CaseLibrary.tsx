"use client";

import { LAYERS, type LayerId } from "@portfolio/shared";
import { useEffect, useId, useState, type ReactNode } from "react";

type Item = { slug: string; layers: LayerId[]; status: "done" | "in-progress" };
type Status = "all" | Item["status"];

const STATUS: { id: Status; th: string; en: string }[] = [
  { id: "all", th: "ทั้งหมด", en: "All" },
  { id: "done", th: "เสร็จแล้ว", en: "Shipped" },
  { id: "in-progress", th: "กำลังพัฒนา", en: "In progress" },
];

/**
 * ตัวกรองผลงาน 2 แถว (layer + สถานะ) — ทำงานฝั่ง browser เพราะเว็บเป็น static
 * การ์ดถูก render ไว้แล้วทั้งหมด (อ่านได้แม้ปิด JS) ส่วนนี้แค่ซ่อน/แสดง
 */
export function CaseLibrary({ items, children }: { items: Item[]; children: ReactNode }) {
  const [layer, setLayer] = useState<LayerId | "all">("all");
  const [status, setStatus] = useState<Status>("all");
  const layerLabel = useId();
  const statusLabel = useId();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const l = q.get("layer");
    const s = q.get("status");
    if (l && LAYERS.some((x) => x.id === l)) setLayer(l as LayerId);
    if (s === "done" || s === "in-progress") setStatus(s);
  }, []);

  function sync(nextLayer: typeof layer, nextStatus: Status) {
    const url = new URL(window.location.href);
    if (nextLayer === "all") url.searchParams.delete("layer");
    else url.searchParams.set("layer", nextLayer);
    if (nextStatus === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", nextStatus);
    window.history.replaceState(null, "", url);
  }

  const visible = items.filter(
    (i) => (layer === "all" || i.layers.includes(layer)) && (status === "all" || i.status === status),
  ).length;

  const layerTabs = [
    { id: "all" as const, th: "ทั้งหมด", en: "All" },
    ...LAYERS.filter((l) => items.some((i) => i.layers.includes(l.id))).map((l) => ({ id: l.id, ...l.label })),
  ];

  const css = [
    layer !== "all" && `.case-grid .case-card:not([data-layers~="${layer}"]){display:none}`,
    status !== "all" && `.case-grid .case-card:not([data-status="${status}"]){display:none}`,
  ]
    .filter(Boolean)
    .join("");

  return (
    <div className="case-library">
      <div className="filters">
        <div className="filter-row" role="group" aria-labelledby={layerLabel}>
          <span className="filter-label" id={layerLabel}>
            <span className="i18n-th">Layer</span><span className="i18n-en">Layer</span>
          </span>
          {layerTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip-btn"
              aria-pressed={layer === t.id}
              onClick={() => { setLayer(t.id); sync(t.id, status); }}
            >
              <span className="i18n-th">{t.th}</span><span className="i18n-en">{t.en}</span>
            </button>
          ))}
        </div>
        <div className="filter-row" role="group" aria-labelledby={statusLabel}>
          <span className="filter-label" id={statusLabel}>
            <span className="i18n-th">สถานะ</span><span className="i18n-en">Status</span>
          </span>
          {STATUS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip-btn"
              aria-pressed={status === t.id}
              onClick={() => { setStatus(t.id); sync(layer, t.id); }}
            >
              <span className="i18n-th">{t.th}</span><span className="i18n-en">{t.en}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="shown-count" role="status" aria-live="polite">
        <span className="i18n-th">แสดง {visible} จาก {items.length} ผลงาน</span>
        <span className="i18n-en">{visible} / {items.length} shown</span>
      </p>

      <style>{css}</style>
      {children}

      {visible === 0 && (
        <p className="empty-note">
          <span className="i18n-th">ยังไม่มีผลงานที่ตรงกับตัวกรองนี้ </span>
          <span className="i18n-en">No projects match these filters yet. </span>
          <button type="button" className="text-btn" onClick={() => { setLayer("all"); setStatus("all"); sync("all", "all"); }}>
            <span className="i18n-th">ล้างตัวกรอง</span><span className="i18n-en">Clear filters</span>
          </button>
        </p>
      )}
    </div>
  );
}
