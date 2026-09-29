import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeWindow } from "@/components/public/CodeWindow";
import { LayerChips } from "@/components/public/LayerChips";
import { StatusBadge } from "@/components/public/StatusBadge";
import { T, TBlock } from "@/components/public/T";
import { getProject, getProjects, renderMarkdown } from "@/lib/content";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) return {};
  return {
    title: project.title.en,
    description: project.summary.en,
    openGraph: { title: project.title.en, description: project.summary.en, type: "article" },
  };
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const project = getProject((await params).slug);
  if (!project) notFound();

  const all = getProjects();
  const idx = all.findIndex((p) => p.slug === project.slug);
  const next = all[(idx + 1) % all.length];

  return (
    <article className="section section--top case-page" aria-labelledby="case-title">
      <div className="wrap">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol>
            <li><Link href="/"><T th="หน้าแรก" en="Home" /></Link></li>
            <li><Link href="/projects/"><T th="ผลงาน" en="Projects" /></Link></li>
            <li aria-current="page"><T text={project.title} /></li>
          </ol>
        </nav>

        <header className="case-hero">
          <div>
            <p className="eyebrow">
              {String(idx + 1).padStart(2, "0")} · {project.year}
            </p>
            <h1 className="display display--md" id="case-title"><T text={project.title} /></h1>
            <p className="lead"><T text={project.summary} /></p>
            {(project.links.github || project.links.demo || project.lab || project.app) && (
              <div className="hero-actions">
                {project.links.demo && (
                  <a className="btn btn-primary" href={project.links.demo} target="_blank" rel="noopener noreferrer">
                    <T th="ดูเดโม" en="Live demo" /> <span aria-hidden="true">↗</span>
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                )}
                {project.app && (
                  <Link className="btn btn-primary" href={project.app}>
                    <T th="เปิดใช้งาน" en="Open the app" /> <span aria-hidden="true">→</span>
                  </Link>
                )}
                {project.lab && (
                  <Link className="btn btn-primary" href={project.lab}>
                    <T th="ลองใช้งาน" en="Try it" /> <span aria-hidden="true">→</span>
                  </Link>
                )}
                {project.links.github && (
                  <a className="btn btn-outline" href={project.links.github} target="_blank" rel="noopener noreferrer">
                    GitHub <span aria-hidden="true">↗</span>
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                )}
              </div>
            )}
            {project.demoNote && <p className="demo-note"><T text={project.demoNote} /></p>}
          </div>
          {project.snippet && (
            <CodeWindow file={project.snippet.file} code={project.snippet.code} label={`${project.snippet.file} — code sample`}>
              {project.metric && (
                <figcaption className="plate plate--inline">
                  <span className="plate-num">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="plate-metric"><small>{project.metric.label}</small><b>{project.metric.value}</b></span>
                </figcaption>
              )}
            </CodeWindow>
          )}
        </header>

        <div className="case-layout">
          <aside className="case-facts" aria-label="Project facts">
            <dl>
              <div><dt><T th="บทบาท" en="Role" /></dt><dd><T text={project.role} /></dd></div>
              {project.team && <div><dt><T th="ทีม" en="Team" /></dt><dd><T text={project.team} /></dd></div>}
              <div><dt><T th="สถานะ" en="Status" /></dt><dd><StatusBadge status={project.status} /></dd></div>
              <div><dt>Layer</dt><dd><LayerChips layers={project.layers} /></dd></div>
              <div>
                <dt>Stack</dt>
                <dd><ul className="skill-list">{project.stack.map((s) => <li key={s}>{s}</li>)}</ul></dd>
              </div>
            </dl>
          </aside>

          <TBlock className="prose" th={renderMarkdown(project.content.th)} en={renderMarkdown(project.content.en)} />
        </div>

        {next && next.slug !== project.slug && (
          <nav className="next-case" aria-label="Next project">
            <span className="eyebrow"><T th="ผลงานถัดไป" en="Next case" /></span>
            <Link href={`/projects/${next.slug}/`} className="next-link">
              <T text={next.title} /> <span aria-hidden="true">→</span>
            </Link>
          </nav>
        )}
      </div>
    </article>
  );
}
