import { z } from "zod";
import { LAYER_IDS } from "../constants/layers";
import { localizedSchema } from "./common.schema";

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีด (-) เท่านั้น");

/** ข้อมูลใน frontmatter ของไฟล์ content/projects/<slug>/index.md */
export const projectMetaSchema = z.object({
  title: localizedSchema,
  summary: localizedSchema.refine((v) => v.th.length <= 200 && v.en.length <= 200, {
    message: "summary ต้องไม่เกิน 200 ตัวอักษร",
  }),
  role: localizedSchema,
  team: localizedSchema.optional(),
  year: z.number().int().min(2000).max(2100),
  status: z.enum(["done", "in-progress"]),
  layers: z.array(z.enum(LAYER_IDS)).min(1),
  stack: z.array(z.string().min(1)).min(1),
  links: z
    .object({ github: z.url().optional(), demo: z.url().optional() })
    .default({}),
  cover: z.string().optional(),
  /** ข้อความสั้นใต้ปุ่มเดโม เช่น บัญชีทดลอง หรือ "เปิดครั้งแรกรอ ~1 นาที" */
  demoNote: localizedSchema.optional(),
  /** path ของเดโมที่อยู่ในเว็บนี้เอง เช่น "/lab/rebalancer/" → แสดงในส่วน Lab */
  lab: z.string().regex(/^\/lab\/[a-z0-9-]+\/$/, "lab ต้องเป็น path แบบ /lab/<ชื่อ>/").optional(),
  /** โค้ดตัวอย่างที่แสดงในหน้าต่างโค้ดบนการ์ดผลงาน */
  snippet: z
    .object({ file: z.string().min(1), code: z.string().min(1).max(600) })
    .optional(),
  /** ตัวเลขเด่นของผลงาน เช่น { label: "TEAM", value: "6" } */
  metric: z
    .object({ label: z.string().min(1).max(10), value: z.string().min(1).max(8) })
    .optional(),
  featured: z.boolean().default(false),
  order: z.number().int().default(100),
  published: z.boolean().default(true),
});

export const projectSchema = projectMetaSchema.extend({
  slug: slugSchema,
  /** เนื้อหา case study แบบ Markdown แยกภาษา */
  content: z.object({ th: z.string(), en: z.string() }),
});

export type ProjectMeta = z.output<typeof projectMetaSchema>;
export type Project = z.output<typeof projectSchema>;
