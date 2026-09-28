import type { Metadata } from "next";
import { CaseCard } from "@/components/public/CaseCard";
import { CaseLibrary } from "@/components/public/CaseLibrary";
import { T } from "@/components/public/T";
import { getProjects } from "@/lib/content";

export const metadata: Metadata = { title: "Projects", description: "All projects, filterable by system layer." };

export default function ProjectsPage() {
  const projects = getProjects();
  return (
    <section className="section section--top" aria-labelledby="projects-title">
      <div className="wrap">
        <p className="eyebrow"><T th="คลังผลงาน" en="Case library" /></p>
        <h1 className="h2" id="projects-title"><T th="ผลงานทั้งหมด" en="All projects" /></h1>
        <p className="lead lead--sm">
          <T
            th="กรองตาม layer หรือสถานะ แล้วกดที่การ์ดเพื่ออ่าน case study"
            en="Filter by layer or status, then open a card for the full case study."
          />
        </p>
        <CaseLibrary items={projects.map((p) => ({ slug: p.slug, layers: p.layers, status: p.status }))}>
          <h2 className="sr-only"><T th="รายการผลงาน" en="Project list" /></h2>
          <div className="case-grid">
            {projects.map((p, i) => <CaseCard key={p.slug} project={p} index={i} />)}
          </div>
        </CaseLibrary>
      </div>
    </section>
  );
}
