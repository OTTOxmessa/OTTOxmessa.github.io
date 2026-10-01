import { z } from "zod";

/** ตรวจ env ตอนเริ่มเซิร์ฟเวอร์ — ตั้งค่าผิดให้พังทันทีพร้อมบอกว่าผิดตรงไหน ดีกว่าไปพังกลางทาง */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "DATABASE_URL ต้องเป็น postgres://..." }),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,https://ottoxmessa.github.io")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
});

export type Config = z.output<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`ตั้งค่า environment ไม่ถูกต้อง:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
