import Link from "next/link";
import type { Project } from "@portfolio/shared";
import { LayerChips } from "./LayerChips";
import { StatusBadge } from "./StatusBadge";
import { T } from "./T";

export function ProjectRow({ project }: { project: Project }) {
  return (
    <article className="project-row" data-layers={project.layers.join(" ")}>
      <div className="project-row-meta">
        <span className="project-year">{project.year}</span>
        <StatusBadge status={project.status} />
      </div>
      <div className="project-row-body">
        <h3 className="project-title">
          <Link href={`/projects/${project.slug}/`} className="stretched">
            <T text={project.title} />
          </Link>
        </h3>
        <p className="project-summary"><T text={project.summary} /></p>
        <p className="project-role">
          <span className="meta-key">role</span> <T text={project.role} />
        </p>
        <LayerChips layers={project.layers} />
      </div>
      <span className="project-arrow" aria-hidden="true">→</span>
    </article>
  );
}
