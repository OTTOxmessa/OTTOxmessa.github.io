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
          {project.app && <span className="row-flag row-flag--app">App</span>}
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
        {project.app ? (
          <Link href={project.app} className="try-btn">
            <T th="เปิดใช้งาน" en="Open app" /> <span aria-hidden="true">→</span>
            <span className="sr-only"> — {project.title.en}</span>
          </Link>
        ) : project.lab ? (
          <Link href={project.lab} className="try-btn">
            <T th="ลองใช้งาน" en="Try it" /> <span aria-hidden="true">→</span>
            <span className="sr-only"> — {project.title.en}</span>
          </Link>
        ) : project.links.demo ? (
          <a href={project.links.demo} className="try-btn" target="_blank" rel="noopener noreferrer">
            <T th="ลองใช้งานจริง" en="Try the live app" /> <span aria-hidden="true">↗</span>
            <span className="sr-only"> — {project.title.en} (opens in new tab)</span>
          </a>
        ) : null}
      </div>
      <span className="row-arrow" aria-hidden="true">→</span>
    </article>
  );
}
