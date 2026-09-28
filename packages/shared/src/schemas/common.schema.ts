import { z } from "zod";

/** ข้อความสองภาษา — ภาษาอังกฤษไม่บังคับ ถ้าไม่ใส่จะใช้ภาษาไทยแทน */
export const localizedSchema = z
  .union([
    z.string().min(1),
    z.object({ th: z.string().min(1), en: z.string().min(1).optional() }),
  ])
  .transform((v) => (typeof v === "string" ? { th: v, en: v } : { th: v.th, en: v.en ?? v.th }));

export type Localized = z.output<typeof localizedSchema>;
