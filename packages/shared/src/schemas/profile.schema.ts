import { z } from "zod";
import { localizedSchema } from "./common.schema";

export const profileSchema = z.object({
  name: localizedSchema,
  role: localizedSchema,
  /** บรรทัดเล็กเหนือชื่อ เช่น "นักศึกษา CS — ประเทศไทย" */
  kicker: localizedSchema,
  /** หัวข้อใหญ่หน้าแรก ใช้ *ข้อความ* เพื่อเน้นสี */
  headline: localizedSchema,
  intro: localizedSchema,
  lookingFor: localizedSchema.optional(),
  email: z.email(),
  links: z.array(z.object({ label: z.string().min(1), url: z.url() })).default([]),
  resumeUrl: z.string().optional(),
});

export type Profile = z.output<typeof profileSchema>;
