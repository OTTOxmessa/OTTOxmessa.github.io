import Link from "next/link";
import type { Project } from "@portfolio/shared";
import { T } from "./T";

/** ภาพประกอบเล็กๆ ของแต่ละ lab (ตกแต่งเท่านั้น) */
function Art({ slug }: { slug: string }) {
  if (slug === "syscall-sandbox")
    return (
      <svg viewBox="0 0 240 120" aria-hidden="true">
        {["fork", "rlimit", "seccomp", "execve", "wait4"].map((s, i) => (
          <g key={s} transform={`translate(${14 + i * 46} 0)`}>
            <rect y="40" width="34" height="34" rx="3" className={i === 2 ? "a-accent" : "a-box"} />
            <text x="17" y="92" textAnchor="middle" className="a-text">{s}</text>
            {i < 4 && <path d={`M36 57h8`} className="a-line" />}
          </g>
        ))}
        <path d="M14 24h212" className="a-line a-dash" />
        <text x="14" y="18" className="a-text">child 4213</text>
      </svg>
    );
  if (slug === "portfolio-rebalancer")
    return (
      <svg viewBox="0 0 240 120" aria-hidden="true">
        {[
          [30, 40, 20, 10],
          [30, 40, 20, 10],
        ].map((row, r) => {
          let x = 14;
          const widths = r === 0 ? [48, 88, 44, 32] : row.map((p) => p * 2.12);
          return (
            <g key={r} transform={`translate(0 ${26 + r * 44})`}>
              {widths.map((w, i) => {
                const el = <rect key={i} x={x} width={w - 2} height="26" rx="2" className={`a-seg a-seg-${i}`} />;
                x += w;
                return el;
              })}
            </g>
          );
        })}
        <text x="14" y="18" className="a-text">now</text>
        <text x="14" y="62" className="a-text">target</text>
      </svg>
    );
  return (
    <svg viewBox="0 0 240 120" aria-hidden="true">
      {["$match", "$group", "$sort"].map((s, i) => (
        <g key={s} transform={`translate(${14 + i * 76} 0)`}>
          <rect y="16" width="64" height="22" rx="11" className={i === 1 ? "a-accent" : "a-box"} />
          <text x="32" y="31" textAnchor="middle" className="a-text a-text--on">{s}</text>
          {Array.from({ length: [8, 4, 3][i]! }).map((_, j) => (
            <rect key={j} x={(j % 4) * 16} y={52 + Math.floor(j / 4) * 16} width="12" height="10" rx="2" className="a-doc" />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function LabCard({ project }: { project: Project }) {
  const titleId = `lab-${project.slug}`;
  return (
    <article className="lab-card reveal" aria-labelledby={titleId}>
      <div className="lab-art"><Art slug={project.slug} /></div>
      <div className="lab-body">
        <p className="lab-kicker">{project.stack.slice(0, 3).join(" · ")}</p>
        <h3 className="lab-title" id={titleId}><T text={project.title} /></h3>
        <p className="lab-summary"><T text={project.summary} /></p>
        <div className="lab-actions">
          <Link href={project.lab!} className="btn btn-primary btn-sm">
            <T th="ลองเล่น" en="Try it" /> <span aria-hidden="true">→</span>
            <span className="sr-only"> — {project.title.en}</span>
          </Link>
          <Link href={`/projects/${project.slug}/`} className="text-link">
            <T th="อ่านวิธีทำ" en="How it works" />
            <span className="sr-only"> — {project.title.en}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
