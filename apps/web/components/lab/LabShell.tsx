import Link from "next/link";
import type { Project } from "@portfolio/shared";
import { T } from "../public/T";

/** โครงหน้าร่วมของทุก lab: breadcrumb, หัวข้อ, ตัวแอป และลิงก์ไปอ่านวิธีทำ/โค้ด */
export function LabShell({ project, children }: { project: Project; children: React.ReactNode }) {
  return (
    <div className="lab-page">
      <div className="wrap">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol>
            <li><Link href="/"><T th="หน้าแรก" en="Home" /></Link></li>
            <li><Link href="/#lab">Lab</Link></li>
            <li aria-current="page"><T text={project.title} /></li>
          </ol>
        </nav>
        <header className="lab-head">
          <p className="eyebrow">Lab · {project.stack.slice(0, 3).join(" · ")}</p>
          <h1 className="h1"><T text={project.title} /></h1>
          <p className="lead"><T text={project.summary} /></p>
        </header>
      </div>
      <div className="wrap">{children}</div>
      <div className="wrap">
        <footer className="lab-foot">
          <Link href={`/projects/${project.slug}/`} className="btn btn-outline">
            <T th="อ่านวิธีทำ" en="How it's built" />
          </Link>
          {project.links.github && (
            <a href={project.links.github} className="text-link" target="_blank" rel="noopener noreferrer">
              <T th="ดูโค้ดบน GitHub" en="View the source on GitHub" /> <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}
