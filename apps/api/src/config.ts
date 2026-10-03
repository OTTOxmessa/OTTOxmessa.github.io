import { randomBytes } from "node:crypto";
import { z } from "zod";

/** ตรวจ env ตอนเริ่มเซิร์ฟเวอร์ — ตั้งค่าผิดให้พังทันทีพร้อมบอกว่าผิดตรงไหน ดีกว่าไปพังกลางทาง */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: "DATABASE_URL ต้องเป็น postgres://...",
  }),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,https://ottoxmessa.github.io")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  // กุญแจเซ็น access token — production ต้องตั้งเอง (render.yaml สุ่มให้) อย่างน้อย 32 ตัวอักษร
  JWT_SECRET: z.string().min(32, "JWT_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร").optional(),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  RATE_LIMIT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0123456789";

export type Config = Omit<z.output<typeof schema>, "JWT_SECRET"> & { JWT_SECRET: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`ตั้งค่า environment ไม่ถูกต้อง:\n${lines.join("\n")}`);
  }
  const c = parsed.data;
  let secret = c.JWT_SECRET;
  if (!secret) {
    if (c.NODE_ENV === "production") {
      // ไม่ตั้งไว้ → สุ่มใหม่ทุกครั้งที่เปิดเครื่อง: ปลอดภัย แต่ access token เก่าจะใช้ไม่ได้หลังรีสตาร์ต
      // (หน้าเว็บจะใช้ refresh token ที่เก็บในฐานข้อมูลขอ access token ใหม่เอง)
      secret = randomBytes(48).toString("base64url");
      console.warn("[config] JWT_SECRET ไม่ได้ตั้งค่า — ใช้ค่าสุ่มชั่วคราว ควรตั้งใน environment");
    } else secret = DEV_SECRET;
  }
  return { ...c, JWT_SECRET: secret };
}
