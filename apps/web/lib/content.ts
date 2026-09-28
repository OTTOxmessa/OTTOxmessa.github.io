/**
 * แหล่งข้อมูลเดียวของหน้าเว็บ
 * ตอนนี้อ่านจากไฟล์ใน /content ตอน build (static)
 * อนาคตถ้ามี API: เปลี่ยน implementation ในไฟล์นี้ให้ fetch จาก API แทน — หน้าเว็บไม่ต้องแก้
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import {
  LAYERS,
  type LayerId,
  type Profile,
  type Project,
  type Skill,
  type Area,
  areaListSchema,
  profileSchema,
  projectMetaSchema,
  skillListSchema,
  slugSchema,
} from "@portfolio/shared";
import type { z } from "zod";

export const CONTENT_DIR = process.env.CONTENT_DIR ?? path.resolve(process.cwd(), "../../content");

function formatIssues(file: string, error: z.ZodError): Error {
  const lines = error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  return new Error(`ข้อมูลใน ${file} ไม่ถูกต้อง:\n${lines.join("\n")}`);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"));
}

let projectCache: Project[] | null = null;

export function loadProjects(dir = CONTENT_DIR): Project[] {
  const projectsDir = path.join(dir, "projects");
  const slugs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const projects = slugs.map((slug): Project => {
    const rel = `projects/${slug}/index.md`;
    const slugCheck = slugSchema.safeParse(slug);
    if (!slugCheck.success) throw formatIssues(`projects/${slug}`, slugCheck.error);

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(fs.readFileSync(path.join(projectsDir, slug, "index.md"), "utf8"));
    } catch (err) {
      throw new Error(`อ่าน frontmatter ใน ${rel} ไม่ได้: ${(err as Error).message}`);
    }
    const { data, content } = parsed;
    const meta = projectMetaSchema.safeParse(data);
    if (!meta.success) throw formatIssues(rel, meta.error);

    const enFile = path.join(projectsDir, slug, "en.md");
    const en = fs.existsSync(enFile) ? fs.readFileSync(enFile, "utf8") : content;
    return { ...meta.data, slug, content: { th: content.trim(), en: en.trim() } };
  });

  return projects.sort((a, b) => a.order - b.order || b.year - a.year);
}

function allProjects(): Project[] {
  if (!projectCache || process.env.NODE_ENV === "development") projectCache = loadProjects();
  return projectCache;
}

export function getProjects(opts: { layer?: LayerId; featured?: boolean } = {}): Project[] {
  return allProjects().filter(
    (p) =>
      p.published &&
      (opts.layer ? p.layers.includes(opts.layer) : true) &&
      (opts.featured ? p.featured : true),
  );
}

export function getProject(slug: string): Project | undefined {
  return getProjects().find((p) => p.slug === slug);
}

export function getProfile(): Profile {
  const parsed = profileSchema.safeParse(readJson("profile.json"));
  if (!parsed.success) throw formatIssues("profile.json", parsed.error);
  return parsed.data;
}

export function getSkillGroups(): { group: string; items: Skill[] }[] {
  const parsed = skillListSchema.safeParse(readJson("skills.json"));
  if (!parsed.success) throw formatIssues("skills.json", parsed.error);
  const groups = new Map<string, Skill[]>();
  for (const s of parsed.data) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  return [...groups].map(([group, items]) => ({ group, items: items.sort((a, b) => a.order - b.order) }));
}

/** จำนวนผลงานต่อ layer */
export function getLayerCounts(): { id: LayerId; count: number }[] {
  const published = getProjects();
  return LAYERS.map((l) => ({ id: l.id, count: published.filter((p) => p.layers.includes(l.id)).length }));
}

/** ตัวเลขใน hero — คำนวณจากข้อมูลจริงทั้งหมด ไม่ต้องแก้มือ */
export function getStats() {
  const published = getProjects();
  return {
    projects: published.length,
    shipped: published.filter((p) => p.status === "done").length,
    layers: getLayerCounts().filter((l) => l.count > 0).length,
  };
}

export type AreaWithSkills = Area & { skills: Skill[]; projectCount: number };

export function getAreas(): AreaWithSkills[] {
  const parsed = areaListSchema.safeParse(readJson("areas.json"));
  if (!parsed.success) throw formatIssues("areas.json", parsed.error);
  const groups = getSkillGroups();
  const published = getProjects();
  return parsed.data.map((a) => {
    const missing = a.skillGroups.filter((g) => !groups.some((x) => x.group === g));
    if (missing.length) throw new Error(`areas.json อ้างถึงกลุ่มทักษะที่ไม่มีใน skills.json: ${missing.join(", ")}`);
    return {
      ...a,
      skills: groups.filter((g) => a.skillGroups.includes(g.group)).flatMap((g) => g.items),
      projectCount: published.filter((p) => p.layers.some((l) => a.layers.includes(l))).length,
    };
  });
}

export function renderMarkdown(md: string): string {
  // <pre> ที่เลื่อนแนวนอนได้ต้องโฟกัสด้วยคีย์บอร์ดได้ (WCAG 2.1.1)
  return marked.parse(md, { async: false }).replace(/<pre>/g, '<pre tabindex="0">');
}
