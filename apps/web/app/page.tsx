import Link from "next/link";
import { CaseCard } from "@/components/public/CaseCard";
import { CaseLibrary } from "@/components/public/CaseLibrary";
import { CodeWindow } from "@/components/public/CodeWindow";
import { ContactForm } from "@/components/public/ContactForm";
import { Headline } from "@/components/public/Headline";
import { T } from "@/components/public/T";
import { getAreas, getProfile, getProjects, getSkillGroups, getStats } from "@/lib/content";

const HOW_I_WORK = `// how I work
const stack = {
  frontend: ['React', 'Next.js'],
  backend:  ['Express', 'Spring Boot'],
  database: ['PostgreSQL', 'MongoDB'],
  infra:    ['Docker', 'GitHub Actions'],
};

function ship(idea) {
  const app = build(idea, { stack });
  assert(app.tests.pass);
  return deploy(app); // every layer, end to end
}

ship(nextProject);`;

export default function HomePage() {
  const profile = getProfile();
  const projects = getProjects();
  const stats = getStats();
  const areas = getAreas();
  const languages = getSkillGroups().find((g) => g.group === "Languages");

  return (
    <>
      {/* ───────────── HERO ───────────── */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><T text={profile.kicker} /></p>
            <h1 className="display" id="hero-title">
              <span className="sr-only">{profile.name.en} — </span>
              <Headline text={profile.headline} />
            </h1>
            <p className="lead"><T text={profile.intro} /></p>

            <dl className="stats">
              <div>
                <dt><T th="ผลงานทั้งหมด" en="projects built" /></dt>
                <dd>{stats.projects}</dd>
              </div>
              <div>
                <dt><T th="layer ที่ลงมือทำ" en="layers worked in" /></dt>
                <dd>{stats.layers}</dd>
              </div>
              <div>
                <dt><T th="ขึ้นใช้งานจริง" en="shipped live" /></dt>
                <dd>{stats.shipped}</dd>
              </div>
            </dl>

            <div className="hero-actions">
              <a href="#work" className="btn btn-primary"><T th="ดูผลงาน" en="See the work" /></a>
              <a href="#contact" className="btn-link"><T th="หรือทักมาคุยกัน →" en="or get in touch →" /></a>
            </div>
          </div>

          <div className="hero-code">
            <CodeWindow file="how-i-work.ts" code={HOW_I_WORK} animate label="how-i-work.ts — code sample" />
            <p className="code-caption" aria-hidden="true">
              <T th="พิมพ์ครั้งเดียว ไม่วนซ้ำ — เหมือน build ที่ดี" en="typed once. never loops. like a good build." />
            </p>
          </div>
        </div>
      </section>

      {/* ───────────── WORK ───────────── */}
      <section className="section" id="work" aria-labelledby="work-title">
        <div className="wrap">
          <p className="eyebrow"><T th="คลังผลงาน" en="Case library" /></p>
          <h2 className="h2" id="work-title">
            <T th={`ผลงาน ${stats.projects} ชิ้น แยกตาม layer`} en={`${stats.projects} projects, layer by layer.`} />
          </h2>
          <CaseLibrary items={projects.map((p) => ({ slug: p.slug, layers: p.layers, status: p.status }))}>
            <div className="case-grid">
              {projects.map((p, i) => <CaseCard key={p.slug} project={p} index={i} />)}
            </div>
          </CaseLibrary>
        </div>
      </section>

      {/* ───────────── SKILLS ───────────── */}
      <section className="section" id="skills" aria-labelledby="skills-title">
        <div className="wrap">
          <p className="eyebrow"><T th="ทักษะ" en="Skills" /></p>
          <h2 className="h2" id="skills-title">
            <T th={`${areas.length} ส่วนของระบบที่ผมทำได้`} en={`${areas.length === 3 ? "Three" : areas.length} parts of the stack I work in.`} />
          </h2>

          <div className="area-grid">
            {areas.map((a) => {
              const featured = a.featured;
              const titleId = `area-${a.layers.join("-")}`;
              return (
                <article key={titleId} className={`area-card${featured ? " is-featured" : ""}`} aria-labelledby={titleId}>
                  {featured && <p className="area-badge"><T th="ถนัดที่สุด" en="Main focus" /></p>}
                  <h3 className="area-title" id={titleId}><T text={a.title} /></h3>
                  <p className="area-desc"><T text={a.description} /></p>
                  <p className="area-count">
                    <b>{a.projectCount}</b> <T th="ผลงาน" en={a.projectCount === 1 ? "project" : "projects"} />
                  </p>
                  <ul className="area-points">
                    {a.points.map((pt) => <li key={pt.en}><T text={pt} /></li>)}
                  </ul>
                  <ul className="skill-list" aria-label="Tools">
                    {a.skills.map((s) => <li key={s.name}>{s.name}</li>)}
                  </ul>
                  <Link href={`/projects/?layer=${a.layers[0]}`} className={`btn ${featured ? "btn-primary" : "btn-outline"} btn-block`}>
                    <T th="ดูผลงานในส่วนนี้" en="See this work" />
                    <span className="sr-only"> — {a.title.en}</span>
                  </Link>
                </article>
              );
            })}
          </div>

          {languages && (
            <p className="footnote">
              <T th="ภาษาที่ใช้:" en="Languages:" /> {languages.items.map((s) => s.name).join(" · ")}
            </p>
          )}
        </div>
      </section>

      {/* ───────────── CONTACT ───────────── */}
      <section className="section" id="contact" aria-labelledby="contact-title">
        <div className="wrap contact-grid">
          <div className="contact-copy">
            <p className="eyebrow"><T th="ติดต่อ" en="Contact" /></p>
            <h2 className="h2" id="contact-title">
              <T th="อยากสร้างอะไร บอกผมได้เลย" en="Tell me what you want to build." />
            </h2>
            <p className="lead lead--sm">
              <T
                th="ฝึกงาน งานพาร์ทไทม์ ชวนทำโปรเจกต์ หรือแค่อยากถามเรื่องผลงาน — ทักมาได้ทุกเรื่อง"
                en="Internships, part-time roles, a project idea, or a question about my work — all good starting points."
              />
            </p>
            <p><a className="email-link" href={`mailto:${profile.email}`}>{profile.email}</a></p>
            <ul className="social-list">
              {profile.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label} <span aria-hidden="true">↗</span>
                    <span className="sr-only"> (เปิดแท็บใหม่ / opens in new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <ContactForm email={profile.email} />
        </div>
      </section>
    </>
  );
}
