import Link from "next/link";
import { LAYERS, type Project } from "@portfolio/shared";
import { CodeWindow } from "./CodeWindow";
import { StatusBadge } from "./StatusBadge";
import { T } from "./T";

export function CaseCard({ project, index }: { project: Project; index: number }) {
  const num = String(index + 1).padStart(2, "0");
  const titleId = `case-${project.slug}`;
  return (
    <article className="case-card" data-layers={project.layers.join(" ")} data-status={project.status} aria-labelledby={titleId}>
      <div className="case-visual">
        {project.snippet ? (
          <CodeWindow file={project.snippet.file} code={project.snippet.code} decorative className="code-window--card" />
        ) : (
          <div className="code-window code-window--card code-window--empty" aria-hidden="true" />
        )}
        <div className="plate" aria-hidden="true">
          <span className="plate-num">{num}</span>
          {project.metric && (
            <span className="plate-metric">
              <small>{project.metric.label}</small>
              <b>{project.metric.value}</b>
            </span>
          )}
        </div>
      </div>

      <div className="case-body">
        <ul className="tag-list" aria-label="Layers">
          {project.layers.map((id) => {
            const l = LAYERS.find((x) => x.id === id);
            return <li key={id} data-layer={id}>{l ? <T text={l.label} /> : id}</li>;
          })}
          <li className="tag-status"><StatusBadge status={project.status} /></li>
        </ul>
        <h3 className="case-title" id={titleId}>
          <Link href={`/projects/${project.slug}/`} className="stretched">
            <T text={project.title} />
          </Link>
        </h3>
        <p className="case-summary"><T text={project.summary} /></p>
        {project.metric && (
          <p className="sr-only">{project.metric.label}: {project.metric.value}</p>
        )}
        <span className="case-more" aria-hidden="true">
          <T th="อ่าน case" en="Read case" /> <span className="arrow">→</span>
        </span>
      </div>
    </article>
  );
}
