import Link from "next/link";
import { LAYERS, type LayerId } from "@portfolio/shared";
import { T } from "./T";

/** แผนภาพ layer: แสดงทุก layer ของระบบเป็นชั้นซ้อนกัน พร้อมจำนวนผลงานในแต่ละชั้น */
export function LayerStrip({ counts }: { counts: { id: LayerId; count: number }[] }) {
  const byId = new Map(counts.map((c) => [c.id, c.count]));
  return (
    <ol className="layer-strip" aria-label="System layers">
      {LAYERS.map((l, i) => {
        const count = byId.get(l.id) ?? 0;
        return (
          <li key={l.id} className="layer-row" data-layer={l.id} data-empty={count === 0 || undefined}>
            <Link href={`/projects/?layer=${l.id}`} className="layer-link">
              <span className="layer-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="layer-bar" aria-hidden="true" />
              <span className="layer-name"><T text={l.label} /></span>
              <span className="layer-hint"><T text={l.hint} /></span>
              <span className="layer-count">
                {count} <T th="ผลงาน" en={count === 1 ? "project" : "projects"} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
