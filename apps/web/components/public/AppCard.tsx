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
