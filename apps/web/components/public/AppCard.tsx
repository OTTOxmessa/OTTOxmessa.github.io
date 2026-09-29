import Link from "next/link";
import type { Project } from "@portfolio/shared";
import { T } from "./T";

function Preview({ path }: { path: string }) {
  if (path.includes("bill"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <rect x="12" y="10" width="110" height="100" rx="8" className="p-card" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(24 ${26 + i * 20})`}>
            <rect width="44" height="7" rx="3" className="p-line" />
            <rect x="62" width="24" height="7" rx="3" className="p-line p-line--strong" />
          </g>
        ))}
        <rect x="136" y="18" width="72" height="84" rx="8" className="p-card" />
        <g transform="translate(148 30)">
          {Array.from({ length: 36 }).map((_, i) => ((i * 7) % 5 < 3 ? <rect key={i} x={(i % 6) * 8} y={Math.floor(i / 6) * 8} width="7" height="7" className="p-qr" /> : null))}
        </g>
      </svg>
    );
  if (path.includes("timetable"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((d) => <rect key={d} x={14 + d * 40} y="12" width="34" height="8" rx="3" className="p-line" />)}
        {([[0, 30, 40], [1, 60, 30], [2, 28, 24], [3, 52, 36], [4, 70, 26], [0, 80, 20]] as [number, number, number][]).map(([d, y, h], i) => (
          <rect key={i} x={14 + d * 40} y={y} width="34" height={h} rx="4" className={i === 1 ? "p-accent" : "p-bar"} />
        ))}
      </svg>
    );
  if (path.includes("loan"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i} transform={`translate(${16 + i * 25} 0)`}>
            <rect y={104 - (30 + i * 6)} width="16" height={30 + i * 6} rx="3" className="p-bar" />
            <rect y={104 - (30 + i * 6) - (40 - i * 5)} width="16" height={40 - i * 5} rx="3" className="p-accent" />
          </g>
        ))}
      </svg>
    );
  if (path.includes("focus"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <circle cx="110" cy="60" r="44" className="p-ring" />
        <circle cx="110" cy="60" r="44" className="p-ring-fg" strokeDasharray="276" strokeDashoffset="90" transform="rotate(-90 110 60)" />
        <text x="110" y="68" textAnchor="middle" className="p-mid">18:24</text>
      </svg>
    );
  if (path.includes("groups"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        {[0, 1, 2].map((g) => (
          <g key={g} transform={`translate(${14 + g * 68} 14)`}>
            <rect width="58" height="92" rx="8" className="p-card" />
            {[0, 1, 2, 3].map((i) => <circle key={i} cx="16" cy={18 + i * 20} r="6" className={g === 1 && i === 0 ? "p-accent" : "p-bar"} />)}
            {[0, 1, 2, 3].map((i) => <rect key={i} x="28" y={15 + i * 20} width="20" height="6" rx="3" className="p-line" />)}
          </g>
        ))}
      </svg>
    );
  if (path.includes("thai-text"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <text x="16" y="44" className="p-mid p-left">฿1,250.50</text>
        <rect x="16" y="60" width="188" height="8" rx="4" className="p-accent" />
        <rect x="16" y="76" width="150" height="8" rx="4" className="p-line p-line--strong" />
        <rect x="16" y="92" width="110" height="8" rx="4" className="p-line" />
      </svg>
    );
  if (path.includes("gpa"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <text x="16" y="62" className="p-big">3.62</text>
        <text x="18" y="84" className="p-small">GPAX</text>
        {[2.9, 3.4, 3.6, 3.8].map((g, i) => (
          <rect key={i} x={120 + i * 22} y={104 - g * 22} width="14" height={g * 22} rx="3" className={i === 3 ? "p-accent" : "p-bar"} />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      {[
        [72, "p-accent"],
        [48, "p-bar"],
        [30, "p-bar"],
        [18, "p-bar"],
      ].map(([w, c], i) => (
        <g key={i} transform={`translate(16 ${18 + i * 24})`}>
          <rect width="40" height="8" rx="3" className="p-line" />
          <rect x="50" width={Number(w) * 2} height="12" y="-2" rx="4" className={String(c)} />
        </g>
      ))}
    </svg>
  );
}

export function AppCard({ project }: { project: Project }) {
  const id = `app-${project.slug}`;
  return (
    <article className="app-card reveal" aria-labelledby={id}>
      <div className="app-preview"><Preview path={project.app!} /></div>
      <div className="app-body">
        <h3 className="app-title" id={id}>
          <Link href={project.app!} className="stretched"><T text={project.title} /></Link>
        </h3>
        <p className="app-summary"><T text={project.summary} /></p>
        <span className="app-cta" aria-hidden="true"><T th="เปิดใช้งาน" en="Open app" /> →</span>
      </div>
    </article>
  );
}
