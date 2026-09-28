import { z } from "zod";

/** ใช้ตอนเพิ่ม API ในอนาคต (POST /api/contact) — ตอนนี้เว็บ static ยังไม่มีฟอร์ม */
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  body: z.string().trim().min(10).max(5000),
});

export type ContactInput = z.input<typeof contactSchema>;
