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
