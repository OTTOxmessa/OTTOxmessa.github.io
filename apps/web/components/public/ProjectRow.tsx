import Link from "next/link";
import type { LayerId, Project } from "@portfolio/shared";
import { LayerMeter } from "./LayerMeter";
import { StatusBadge } from "./StatusBadge";
import { T } from "./T";

export function ProjectRow({ project, index, scale }: { project: Project; index: number; scale: LayerId[] }) {
  const titleId = `row-${project.slug}`;
  return (
    <article
      className="project-row reveal"
      data-layers={project.layers.join(" ")}
      data-status={project.status}
      aria-labelledby={titleId}
    >
      <span className="row-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="row-main">
        <h3 className="row-title" id={titleId}>
          <Link href={`/projects/${project.slug}/`} className="stretched">
            <T text={project.title} />
          </Link>
          {project.lab && <span className="row-flag">Lab</span>}
        </h3>
        <p className="row-summary"><T text={project.summary} /></p>
        <p className="row-role">
          <span className="meta-key"><T th="บทบาท" en="Role" /></span> <T text={project.role} />
        </p>
      </div>
      <div className="row-side">
        <LayerMeter layers={project.layers} scale={scale} />
        <div className="row-meta">
          <StatusBadge status={project.status} />
          <span className="row-year">{project.year}</span>
        </div>
        <p className="row-stack">{project.stack.slice(0, 4).join(" · ")}</p>
      </div>
      <span className="row-arrow" aria-hidden="true">→</span>
    </article>
  );
}
