import Link from "next/link";
import { LayerStrip } from "@/components/public/LayerStrip";
import { ProjectRow } from "@/components/public/ProjectRow";
import { T } from "@/components/public/T";
import { getLayerCounts, getProfile, getProjects, getSkillGroups } from "@/lib/content";

export default function HomePage() {
  const profile = getProfile();
  const featured = getProjects({ featured: true });
  const skills = getSkillGroups();
  const total = getProjects().length;

  return (
    <>
      <section className="hero" id="home">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">$ whoami</p>
            <h1 className="hero-name"><T text={profile.name} /></h1>
            <p className="hero-role"><T text={profile.role} /></p>
            <p className="hero-desc"><T text={profile.intro} /></p>
            {profile.lookingFor && (
              <p className="hero-looking">
                <span className="meta-key">looking for</span> <T text={profile.lookingFor} />
              </p>
            )}
            <div className="hero-actions">
              <Link href="/projects/" className="btn btn-primary">
                <T th={`ดูผลงานทั้งหมด (${total})`} en={`View all projects (${total})`} />
              </Link>
              <a href="#contact" className="btn btn-ghost"><T th="ติดต่อ" en="Get in touch" /></a>
              {profile.resumeUrl && (
                <a href={profile.resumeUrl} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">
                  <T th="เรซูเม่" en="Résumé" />
                </a>
              )}
            </div>
          </div>

          <div className="hero-layers">
            <p className="layers-caption">
              <span className="nav-path">$</span> <T th="ผลงานแยกตาม layer ของระบบ" en="work by system layer" />
            </p>
            <LayerStrip counts={getLayerCounts()} />
          </div>
        </div>
      </section>

      <section className="section" id="work">
        <div className="wrap">
          <div className="section-head">
            <h2 className="section-title">
              <span className="nav-path">~/</span><T th="ผลงานเด่น" en="selected work" />
            </h2>
            <Link href="/projects/" className="section-link"><T th="ทั้งหมด →" en="All projects →" /></Link>
          </div>
          <div className="project-list">
            {featured.map((p) => <ProjectRow key={p.slug} project={p} />)}
          </div>
        </div>
      </section>

      <section className="section" id="skills">
        <div className="wrap">
          <h2 className="section-title">
            <span className="nav-path">~/</span><T th="ทักษะ" en="skills" />
          </h2>
          <dl className="skills-grid">
            {skills.map((g) => (
              <div key={g.group} className="skills-group">
                <dt>{g.group}</dt>
                <dd>
                  <ul className="skills-list">
                    {g.items.map((s) => <li key={s.name}>{s.name}</li>)}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section contact" id="contact">
        <div className="wrap">
          <h2 className="section-title">
            <span className="nav-path">~/</span><T th="ติดต่อ" en="contact" />
          </h2>
          <p className="contact-lead">
            <T
              th="สนใจร่วมงาน รับฝึกงาน หรืออยากคุยเรื่องโปรเจกต์ ทักมาได้เลย"
              en="Open to internships, collaborations, or just a chat about a project — reach out."
            />
          </p>
          <div className="contact-links">
            <a className="contact-link" href={`mailto:${profile.email}`}>
              <span className="contact-key">email</span>
              <span className="contact-val">{profile.email}</span>
            </a>
            {profile.links.map((l) => (
              <a key={l.url} className="contact-link" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="contact-key">{l.label}</span>
                <span className="contact-val">{l.url.replace(/^https?:\/\//, "")}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
