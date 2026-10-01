import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyServerOptions } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { HttpError } from "./lib/errors";
import { healthRoutes } from "./routes/health";

export const VERSION = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? process.env.GIT_SHA ?? "dev";

export type AppDeps = { config: Config; db: Db };

/** สร้างแอป (ยังไม่ listen) — test เรียกฟังก์ชันนี้แล้วยิงด้วย app.inject() ได้โดยไม่ต้องเปิดพอร์ต */
export async function buildApp({ config, db }: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            level: config.LOG_LEVEL ?? (config.NODE_ENV === "production" ? "info" : "debug"),
            redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
          },
    trustProxy: true, // อยู่หลัง proxy ของโฮสต์ — ใช้ IP จริงของผู้ใช้สำหรับ rate limit
    bodyLimit: 1_000_000,
    genReqId: () => crypto.randomUUID(),
    ...opts,
  });

  await app.register(helmet, { contentSecurityPolicy: false }); // API ล้วน ไม่มี HTML
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "authorization", "idempotency-key", "if-match"],
    exposedHeaders: ["x-request-id"],
    maxAge: 600,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: { code: "validation", message: "ข้อมูลไม่ถูกต้อง", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, "unhandled error");
    return reply.code(status).send({
      error: { code: status >= 500 ? "internal" : "request_error", message: status >= 500 ? "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" : (err as Error).message },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: `ไม่มีเส้นทาง ${req.method} ${req.url}` } });
  });

  app.get("/", async () => ({ name: "OTTO API", version: VERSION, docs: "https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/apps/api" }));
  await app.register(healthRoutes, { db, version: VERSION });

  return app;
}
