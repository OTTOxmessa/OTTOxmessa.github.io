import Link from "next/link";
import type { Project } from "@portfolio/shared";
import { T } from "./T";

function Preview({ path }: { path: string }) {
  if (path.includes("/billing/"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <rect x="30" y="8" width="96" height="108" rx="4" className="p-card" transform="rotate(-4 78 62)" />
        <rect x="88" y="6" width="104" height="110" rx="4" className="p-card" />
        <rect x="98" y="16" width="40" height="7" rx="3" className="p-line p-line--strong" />
        <rect x="150" y="16" width="32" height="7" rx="3" className="p-accent" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(98 ${38 + i * 12})`}>
            <rect width="50" height="5" rx="2" className="p-line" />
            <rect x="62" width="22" height="5" rx="2" className="p-line p-line--strong" />
          </g>
        ))}
        <rect x="140" y="90" width="44" height="12" rx="3" className="p-accent" />
      </svg>
    );
  if (path.includes("/pos/"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={12 + (i % 3) * 42} y={14 + Math.floor(i / 3) * 44} width="36" height="38" rx="6" className={i === 1 ? "p-accent" : "p-card"} />
        ))}
        <rect x="144" y="12" width="64" height="96" rx="8" className="p-card" />
        {[0, 1, 2].map((i) => <rect key={i} x="152" y={24 + i * 14} width={40 - i * 6} height="6" rx="3" className="p-line" />)}
        <rect x="152" y="86" width="48" height="14" rx="4" className="p-accent" />
      </svg>
    );
  if (path.includes("/dorm/"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={12 + (i % 4) * 30} y={16 + Math.floor(i / 4) * 46} width="24" height="38" rx="4" className={i === 2 || i === 7 ? "p-bar" : i === 5 ? "p-accent" : "p-card"} />
        ))}
        <rect x="140" y="12" width="68" height="96" rx="6" className="p-card" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x="148" y={24 + i * 12} width="52" height="5" rx="2" className="p-line" />)}
        <g transform="translate(160 76)">
          {Array.from({ length: 16 }).map((_, i) => ((i * 5) % 3 < 2 ? <rect key={i} x={(i % 4) * 6} y={Math.floor(i / 4) * 6} width="5" height="5" className="p-qr" /> : null))}
        </g>
      </svg>
    );
  if (path.includes("/kanban/"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        {[3, 2, 2].map((n, c) => (
          <g key={c} transform={`translate(${12 + c * 68} 10)`}>
            <rect width="60" height="100" rx="8" className="p-card" />
            <rect x="8" y="8" width="28" height="6" rx="3" className="p-line p-line--strong" />
            {Array.from({ length: n }).map((_, i) => <rect key={i} x="6" y={22 + i * 26} width="48" height="20" rx="4" className={c === 1 && i === 0 ? "p-accent" : "p-bar"} />)}
          </g>
        ))}
      </svg>
    );
  if (path.includes("/flashcards/"))
    return (
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <rect x="58" y="16" width="116" height="70" rx="10" className="p-bar" transform="rotate(-6 116 51)" />
        <rect x="52" y="20" width="116" height="70" rx="10" className="p-card" />
        <text x="110" y="62" textAnchor="middle" className="p-mid">deadline</text>
        {[0, 1, 2, 3].map((i) => <rect key={i} x={40 + i * 36} y="100" width="30" height="12" rx="4" className={i === 2 ? "p-accent" : "p-line"} />)}
      </svg>
    );
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
    <article className={`app-card reveal${project.featured ? " app-card--system" : ""}`} aria-labelledby={id}>
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
