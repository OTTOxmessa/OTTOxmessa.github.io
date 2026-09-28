import type { Metadata } from "next";
import { LAYERS, type LayerId } from "@portfolio/shared";
import { ProjectRow } from "@/components/public/ProjectRow";
import { T } from "@/components/public/T";
import { WorkList } from "@/components/public/WorkList";
import { getProjects } from "@/lib/content";

export const metadata: Metadata = { title: "Projects", description: "All projects, filterable by system layer." };

export default function ProjectsPage() {
  const projects = getProjects();
  const scale: LayerId[] = LAYERS.filter((l) => projects.some((p) => p.layers.includes(l.id))).map((l) => l.id);
  return (
    <section className="section section--top" aria-labelledby="projects-title">
      <div className="wrap">
        <header className="section-head">
          <p className="eyebrow"><T th="ผลงานทั้งหมด" en="Index" /></p>
          <h1 className="h2" id="projects-title"><T th="ผลงานทั้งหมด" en="All projects" /></h1>
          <p className="lead lead--sm">
            <T th="กรองตาม layer หรือสถานะ แล้วกดเพื่ออ่านรายละเอียด" en="Filter by layer or status, then open one for the details." />
          </p>
        </header>
        <WorkList items={projects.map((p) => ({ slug: p.slug, layers: p.layers, status: p.status }))}>
          <h2 className="sr-only"><T th="รายการผลงาน" en="Project list" /></h2>
          <div className="work-rows">
            {projects.map((p, i) => <ProjectRow key={p.slug} project={p} index={i} scale={scale} />)}
          </div>
        </WorkList>
      </div>
    </section>
  );
}
