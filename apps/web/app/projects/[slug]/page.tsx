import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
    <article className="section page-top case-study">
      <div className="wrap narrow">
        <Link href="/projects/" className="back-link"><T th="← ผลงานทั้งหมด" en="← All projects" /></Link>

        <header className="case-head">
          <p className="hero-kicker">$ cat projects/{project.slug}</p>
          <h1 className="case-title"><T text={project.title} /></h1>
          <p className="case-summary"><T text={project.summary} /></p>

          <dl className="case-meta">
            <div><dt>role</dt><dd><T text={project.role} /></dd></div>
            {project.team && <div><dt>team</dt><dd><T text={project.team} /></dd></div>}
            <div><dt>year</dt><dd>{project.year}</dd></div>
            <div><dt>status</dt><dd><StatusBadge status={project.status} /></dd></div>
            <div><dt>layers</dt><dd><LayerChips layers={project.layers} /></dd></div>
            <div>
              <dt>stack</dt>
              <dd><ul className="stack-list">{project.stack.map((s) => <li key={s}>{s}</li>)}</ul></dd>
            </div>
          </dl>

          {(project.links.github || project.links.demo) && (
            <div className="hero-actions">
              {project.links.demo && (
                <a className="btn btn-primary" href={project.links.demo} target="_blank" rel="noopener noreferrer">
                  <T th="ดูเดโม" en="Live demo" /> ↗
                </a>
              )}
              {project.links.github && (
                <a className="btn btn-ghost" href={project.links.github} target="_blank" rel="noopener noreferrer">
                  GitHub ↗
                </a>
              )}
            </div>
          )}
        </header>

        <TBlock
          className="prose"
          th={renderMarkdown(project.content.th)}
          en={renderMarkdown(project.content.en)}
        />

        {next && next.slug !== project.slug && (
          <nav className="next-project" aria-label="Next project">
            <span className="meta-key">next</span>
            <Link href={`/projects/${next.slug}/`}><T text={next.title} /> →</Link>
          </nav>
        )}
      </div>
    </article>
  );
}
