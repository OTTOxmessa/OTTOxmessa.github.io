"use client";

import { LAYERS, type LayerId } from "@portfolio/shared";
import { useEffect, useId, useState, type ReactNode } from "react";

type Item = { slug: string; layers: LayerId[]; status: "done" | "in-progress" };
type Status = "all" | Item["status"];

/**
 * ตัวกรองผลงาน (static site จึงกรองฝั่ง browser)
 * ทุกแถวถูก render ไว้แล้ว — ปิด JS ก็ยังเห็นผลงานครบ
 */
export function WorkList({ items, children }: { items: Item[]; children: ReactNode }) {
  const [layer, setLayer] = useState<LayerId | "all">("all");
  const [status, setStatus] = useState<Status>("all");
  const labelId = useId();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const l = q.get("layer");
    const s = q.get("status");
    if (l && LAYERS.some((x) => x.id === l)) setLayer(l as LayerId);
    if (s === "done" || s === "in-progress") setStatus(s);
  }, []);

  function update(nextLayer: LayerId | "all", nextStatus: Status) {
    setLayer(nextLayer);
    setStatus(nextStatus);
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

  const layerChips = LAYERS.filter((l) => items.some((i) => i.layers.includes(l.id)));
  const css = [
    layer !== "all" && `.work-rows .project-row:not([data-layers~="${layer}"]){display:none}`,
    status !== "all" && `.work-rows .project-row:not([data-status="${status}"]){display:none}`,
  ]
    .filter(Boolean)
    .join("");

  return (
    <div className="work">
      <div className="toolbar" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="sr-only">Filter projects</span>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={layer === "all"} onClick={() => update("all", status)}>
            <span className="i18n-th">ทุก layer</span><span className="i18n-en">All layers</span>
          </button>
          {layerChips.map((l) => (
            <button
              key={l.id}
              type="button"
              className="chip"
              data-layer={l.id}
              aria-pressed={layer === l.id}
              onClick={() => update(l.id, status)}
            >
              <i className="chip-dot" aria-hidden="true" />
              <span className="i18n-th">{l.label.th}</span><span className="i18n-en">{l.label.en}</span>
            </button>
          ))}
        </div>
        <div className="seg seg--status" role="group" aria-label="สถานะ / Status">
          {([
            ["all", "ทั้งหมด", "All"],
            ["done", "เสร็จแล้ว", "Shipped"],
            ["in-progress", "กำลังทำ", "In progress"],
          ] as const).map(([id, th, en]) => (
            <button key={id} type="button" aria-pressed={status === id} onClick={() => update(layer, id)}>
              <span className="i18n-th">{th}</span><span className="i18n-en">{en}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="count" role="status">
        <span className="i18n-th">แสดง {visible} จาก {items.length} ผลงาน</span>
        <span className="i18n-en">Showing {visible} of {items.length}</span>
      </p>

      <style>{css}</style>
      {children}

      {visible === 0 && (
        <p className="empty">
          <span className="i18n-th">ยังไม่มีผลงานที่ตรงกับตัวกรองนี้ — </span>
          <span className="i18n-en">No projects match these filters — </span>
          <button type="button" className="link-btn" onClick={() => update("all", "all")}>
            <span className="i18n-th">ล้างตัวกรอง</span><span className="i18n-en">clear filters</span>
          </button>
        </p>
      )}
    </div>
  );
}
