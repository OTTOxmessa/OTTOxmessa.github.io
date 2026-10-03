import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { HttpError } from "./lib/errors";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { healthRoutes } from "./routes/health";
import { orgRoutes } from "./routes/orgs";

export const VERSION = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? process.env.GIT_SHA ?? "dev";

export type AppDeps = { config: Config; db: Db };

/** แปลง error ของ Postgres ที่คาดได้ เป็นคำตอบที่ client เข้าใจ (แทน 500) */
function pgError(err: unknown): HttpError | null {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return new HttpError(409, "conflict", "ข้อมูลซ้ำกับที่มีอยู่แล้ว");
  if (code === "23514" || code === "23502" || code === "22P02" || code === "22003")
    return new HttpError(400, "invalid_data", "ข้อมูลไม่ผ่านเงื่อนไขของระบบ");
  if (code === "40001" || code === "40P01")
    return new HttpError(409, "retry", "มีการแก้ไขพร้อมกัน กรุณาลองอีกครั้ง");
  return null;
}

/** สร้างแอป (ยังไม่ listen) — test เรียกฟังก์ชันนี้แล้วยิงด้วย app.inject() ได้โดยไม่ต้องเปิดพอร์ต */
export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const { config } = deps;
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            level: config.LOG_LEVEL ?? (config.NODE_ENV === "production" ? "info" : "debug"),
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers['set-cookie']",
            ],
          },
    trustProxy: true, // อยู่หลัง proxy ของโฮสต์ — ใช้ IP จริงของผู้ใช้สำหรับ rate limit
    bodyLimit: 2_000_000,
    genReqId: () => crypto.randomUUID(),
    ...opts,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "authorization", "idempotency-key"],
    exposedHeaders: ["x-request-id"],
    maxAge: 600,
  });
  // จำกัดเฉพาะ route ที่กำหนด config.rateLimit ไว้ (login, register ฯลฯ) — ปิดไว้ตอน test ยกเว้น test ที่ทดสอบเรื่องนี้
  await app.register(rateLimit, {
    global: false,
    hook: "preHandler",
    enableDraftSpec: true,
    allowList: () => !config.RATE_LIMIT,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: {
        code: "rate_limited",
        message: `ลองบ่อยเกินไป กรุณารอ ${Math.ceil(ctx.ttl / 1000)} วินาที`,
      },
    }),
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "OTTO API",
        version: VERSION,
        description:
          "Backend ของระบบใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ — เงินทุกช่องเป็นสตางค์ (จำนวนเต็ม)",
      },
      components: {
        securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      },
      tags: [
        { name: "auth", description: "บัญชีผู้ใช้และเซสชัน" },
        { name: "orgs", description: "ร้านและสมาชิก" },
        { name: "billing", description: "ลูกค้า สินค้า เอกสาร การรับชำระ" },
        { name: "reports", description: "สรุปและส่งออก" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply
        .code(err.status)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: {
          code: "validation",
          message: "ข้อมูลไม่ถูกต้อง",
          details: err.validation.map((v) => ({
            path: `${err.validationContext}${v.instancePath}`.replace(/\//g, "."),
            message: v.message,
          })),
        },
      });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation",
          message: "ข้อมูลไม่ถูกต้อง",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    const mapped = pgError(err);
    if (mapped)
      return reply
        .code(mapped.status)
        .send({ error: { code: mapped.code, message: mapped.message } });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, "unhandled error");
    return reply.code(status).send({
      error: {
        code: status === 429 ? "rate_limited" : status >= 500 ? "internal" : "request_error",
        message: status >= 500 ? "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" : (err as Error).message,
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply
      .code(404)
      .send({ error: { code: "not_found", message: `ไม่มีเส้นทาง ${req.method} ${req.url}` } });
  });

  app.get("/", { schema: { hide: true } }, async () => ({
    name: "OTTO API",
    version: VERSION,
    docs: "/docs",
  }));
  await app.register(healthRoutes, { db: deps.db, version: VERSION });
  await app.register(authRoutes, deps);
  await app.register(orgRoutes, deps);
  await app.register(billingRoutes, deps);

  return app;
}
