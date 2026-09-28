import { LAYERS, type LayerId } from "@portfolio/shared";

/** แถบ 5 ช่องบอกว่าผลงานนี้ครอบคลุม layer ไหนบ้าง (มีข้อความสำหรับ screen reader) */
export function LayerMeter({ layers, scale }: { layers: LayerId[]; scale: LayerId[] }) {
  const names = LAYERS.filter((l) => layers.includes(l.id));
  return (
    <div className="meter">
      <span className="meter-bars" aria-hidden="true">
        {scale.map((id) => (
          <i key={id} data-layer={id} data-on={layers.includes(id) || undefined} title={id} />
        ))}
      </span>
      <span className="meter-label">
        <span lang="th" className="i18n-th">{names.map((l) => l.label.th).join(" · ")}</span>
        <span lang="en" className="i18n-en">{names.map((l) => l.label.en).join(" · ")}</span>
      </span>
    </div>
  );
}
