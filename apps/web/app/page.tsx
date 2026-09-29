import { LAYERS, type LayerId, type Project } from "@portfolio/shared";
import Link from "next/link";
import { CopyEmail } from "@/components/public/CopyEmail";
import { Headline } from "@/components/public/Headline";
import { AppCard } from "@/components/public/AppCard";
import { LabCard } from "@/components/public/LabCard";
import { ProjectRow } from "@/components/public/ProjectRow";
import { StackExplorer, type ExplorerLayer } from "@/components/public/StackExplorer";
import { T } from "@/components/public/T";
import { WorkList } from "@/components/public/WorkList";
import { getProfile, getProjects, getSkillGroups, getSkills, getStats } from "@/lib/content";

export default function HomePage() {
  const profile = getProfile();
  const projects = getProjects();
  const labs = projects.filter((p) => p.lab);
  const apps = projects.filter((p) => p.app);
  const stats = getStats();
  const skills = getSkills();
  const groups = getSkillGroups();

  // layer ที่มีผลงานอย่างน้อย 1 ชิ้น — ใช้ทั้งใน Stack Explorer และแถบ layer ของแต่ละผลงาน
  const used = LAYERS.filter((l) => projects.some((p) => p.layers.includes(l.id)));
  const scale: LayerId[] = used.map((l) => l.id);
  const explorer: ExplorerLayer[] = used.map((l) => ({
    id: l.id,
    label: l.label,
    hint: l.hint,
    projects: projects.filter((p) => p.layers.includes(l.id)).map((p) => ({ slug: p.slug, title: p.title })),
    tools: skills.filter((s) => s.layer === l.id).map((s) => s.name),
  }));
  const busiest = [...explorer].sort((a, b) => b.projects.length - a.projects.length)[0]!.id;

  return (
    <>
      {/* ───────────── HERO ───────────── */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span className="pulse" aria-hidden="true" /> <T text={profile.kicker} /></p>
            <h1 className="display" id="hero-title">
              <span className="sr-only">{profile.name.en} — </span>
              <Headline text={profile.headline} />
            </h1>
            <p className="lead"><T text={profile.intro} /></p>

            <div className="hero-actions">
              <a href="#apps" className="btn btn-primary"><T th="ลองใช้แอป" en="Try the apps" /></a>
              <a href="#work" className="btn btn-outline"><T th="ดูผลงานทั้งหมด" en="See all work" /></a>
            </div>

            <dl className="stats">
              <div><dt><T th="ผลงาน" en="projects" /></dt><dd>{stats.projects}</dd></div>
              <div><dt><T th="แอปใช้งานได้จริง" en="usable apps" /></dt><dd>{apps.length}</dd></div>
              <div><dt><T th="layer ที่ลงมือทำ" en="layers touched" /></dt><dd>{stats.layers}</dd></div>
            </dl>
          </div>

          <StackExplorer layers={explorer} initial={busiest} />
        </div>
      </section>

      {/* ───────────── APPS ───────────── */}
      {apps.length > 0 && (
        <section className="section section--apps" id="apps" aria-labelledby="apps-title">
          <div className="wrap">
            <header className="section-head">
              <p className="eyebrow">01 — <T th="แอปใช้งานจริง" en="Apps" /></p>
              <h2 className="h2" id="apps-title">
                <T th="เครื่องมือที่เปิดใช้ได้เลย ฟรี ไม่ต้องสมัคร" en="Tools you can use right now — free, no sign-up." />
              </h2>
              <p className="lead lead--sm">
                <T
                  th="ทำงานในเบราว์เซอร์ทั้งหมด ข้อมูลไม่ออกจากเครื่องคุณ ใช้บนมือถือได้ และกด “เพิ่มไปยังหน้าจอหลัก” เก็บไว้เป็นแอปได้"
                  en="Everything runs in your browser and your data never leaves your device. Works on phones — add it to your home screen like an app."
                />
              </p>
            </header>
            <div className="app-grid">
              {apps.map((p) => <AppCard key={p.slug} project={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* ───────────── WORK ───────────── */}
      <section className="section" id="work" aria-labelledby="work-title">
        <div className="wrap">
          <header className="section-head">
            <p className="eyebrow">02 — <T th="ผลงาน" en="Work" /></p>
            <h2 className="h2" id="work-title">
              <T th="ผลงานที่ผมลงมือทำ และส่วนที่ผมรับผิดชอบ" en="What I built, and the part I owned." />
            </h2>
          </header>
          <WorkListWrap projects={projects} scale={scale} />
        </div>
      </section>

      {/* ───────────── LAB ───────────── */}
      {labs.length > 0 && (
        <section className="section section--lab" id="lab" aria-labelledby="lab-title">
          <div className="wrap">
            <header className="section-head">
              <p className="eyebrow">03 — Lab</p>
              <h2 className="h2" id="lab-title">
                <T th="เดโมเชิงเทคนิค ต่อยอดจากงานในวิชาเรียน" en="Technical demos grown out of coursework." />
              </h2>
              <p className="lead lead--sm">
                <T
                  th="แต่ละชิ้นต่อยอดจากงานที่ทำอยู่ ทำงานในเบราว์เซอร์ทั้งหมด ไม่ต้องติดตั้งอะไร"
                  en="Each one grows out of a bigger project. Everything runs in your browser — nothing to install."
                />
              </p>
            </header>
            <div className="lab-grid">
              {labs.map((p) => <LabCard key={p.slug} project={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* ───────────── TOOLBOX ───────────── */}
      <section className="section" id="toolbox" aria-labelledby="toolbox-title">
        <div className="wrap">
          <header className="section-head">
            <p className="eyebrow">04 — <T th="ทักษะ" en="Skills" /></p>
            <h2 className="h2" id="toolbox-title"><T th="สิ่งที่ผมใช้ทำงานจริง" en="What I actually work with." /></h2>
          </header>
          <dl className="toolbox reveal">
            {groups.map((g) => (
              <div key={g.group} className="tool-group">
                <dt>{g.group}</dt>
                <dd>
                  <ul>{g.items.map((s) => <li key={s.name}>{s.name}</li>)}</ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────────── CONTACT ───────────── */}
      <section className="contact-band" id="contact" aria-labelledby="contact-title">
        <div className="wrap contact-inner">
          <p className="eyebrow eyebrow--light">05 — <T th="ติดต่อ" en="Contact" /></p>
          <h2 className="contact-title" id="contact-title">
            <T th="มีงาน ฝึกงาน หรือไอเดีย? คุยกันได้เลย" en="Got a role, an internship or an idea? Let's talk." />
          </h2>
          <a className="contact-email" href={`mailto:${profile.email}`}>{profile.email}</a>
          <div className="contact-actions">
            <a className="btn btn-light" href={`mailto:${profile.email}`}><T th="ส่งอีเมล" en="Send an email" /></a>
            <CopyEmail email={profile.email} />
            {profile.links.map((l) => (
              <a key={l.url} className="btn btn-ghost-light" href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label} <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function WorkListWrap({ projects, scale }: { projects: Project[]; scale: LayerId[] }) {
  return (
    <WorkList items={projects.map((p) => ({ slug: p.slug, layers: p.layers, status: p.status }))}>
      <div className="work-rows">
        {projects.map((p, i) => <ProjectRow key={p.slug} project={p} index={i} scale={scale} />)}
      </div>
      <p className="more-link">
        <Link href="/projects/" className="text-link"><T th="ดูหน้ารวมผลงาน →" en="Open the full project index →" /></Link>
      </p>
    </WorkList>
  );
}
