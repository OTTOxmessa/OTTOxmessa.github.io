import Link from "next/link";
import type { Project } from "@portfolio/shared";
import { T } from "../public/T";

/** โครงหน้าของแอปใช้งานจริง: หัวข้อสั้น ตัวแอปเต็มจอ แล้วค่อยลิงก์ไปอ่านวิธีทำด้านล่าง */
export function ToolShell({ project, children }: { project: Project; children: React.ReactNode }) {
  return (
    <div className="tool-page">
      <div className="wrap">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol>
            <li><Link href="/"><T th="หน้าแรก" en="Home" /></Link></li>
            <li><Link href="/#apps"><T th="แอปใช้งานจริง" en="Apps" /></Link></li>
            <li aria-current="page"><T text={project.title} /></li>
          </ol>
        </nav>
        <header className="tool-head">
          <h1 className="h1"><T text={project.title} /></h1>
          <p className="lead lead--sm"><T text={project.summary} /></p>
        </header>
        {children}
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
