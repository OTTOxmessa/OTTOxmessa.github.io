import type { Metadata } from "next";
import { LAYERS } from "@portfolio/shared";
import { ProjectFilter } from "@/components/public/ProjectFilter";
import { ProjectRow } from "@/components/public/ProjectRow";
import { T } from "@/components/public/T";
import { getProjects } from "@/lib/content";

export const metadata: Metadata = { title: "Projects", description: "All projects, filterable by system layer." };

export default function ProjectsPage() {
  const projects = getProjects();
  const counts: Record<string, number> = { all: projects.length };
  for (const l of LAYERS) counts[l.id] = projects.filter((p) => p.layers.includes(l.id)).length;

  return (
    <section className="section page-top">
      <div className="wrap">
        <h1 className="section-title page-title">
          <span className="nav-path">~/</span><T th="ผลงานทั้งหมด" en="projects" />
        </h1>
        <p className="section-sub">
          <T
            th="กรองตาม layer เพื่อดูว่าผมทำส่วนไหนของระบบ — กดที่ผลงานเพื่ออ่าน case study"
            en="Filter by layer to see which part of the system I worked on — open a project for the case study."
          />
        </p>
        <ProjectFilter counts={counts}>
          <div className="project-list">
            {projects.map((p) => <ProjectRow key={p.slug} project={p} />)}
          </div>
        </ProjectFilter>
      </div>
    </section>
  );
}
