import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client";

const started = Date.now();

/**
 * GET /health — ใช้ทั้ง health check ของโฮสต์ และหน้าเว็บใช้ "ปลุก" เซิร์ฟเวอร์ที่หลับอยู่ (แผนฟรี)
 * ตอบ 503 ถ้าฐานข้อมูลใช้ไม่ได้ เพื่อให้โฮสต์รู้ว่าเครื่องนี้ยังไม่พร้อม
 */
export async function healthRoutes(app: FastifyInstance, opts: { db: Db; version: string }) {
  app.get("/health", async (_req, reply) => {
    const t0 = performance.now();
    let db: "ok" | "down" = "ok";
    try {
      await opts.db.execute(sql`select 1`);
    } catch (err) {
      app.log.error({ err }, "health: database unreachable");
      db = "down";
    }
    const body = {
      status: db === "ok" ? "ok" : "degraded",
      db,
      dbLatencyMs: Math.round(performance.now() - t0),
      uptimeSec: Math.round((Date.now() - started) / 1000),
      version: opts.version,
    };
    return reply.code(db === "ok" ? 200 : 503).send(body);
  });
}
