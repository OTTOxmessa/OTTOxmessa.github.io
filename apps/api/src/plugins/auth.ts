import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { memberships } from "../db/schema";
import { verifyAccessToken } from "../lib/auth";
import { HttpError } from "../lib/errors";

export type Role = "owner" | "staff" | "viewer";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANK: Record<Role, number> = { viewer: 0, staff: 1, owner: 2 };

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    org?: { id: string; role: Role };
  }
}

/** ต้อง login — อ่าน Authorization: Bearer <access token> */
export function requireAuth(config: Config) {
  return async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw new HttpError(401, "unauthenticated", "กรุณาเข้าสู่ระบบ");
    req.userId = await verifyAccessToken(config, h.slice(7));
  };
}

/**
 * ต้องเป็นสมาชิกของร้านใน path (:orgId) และมีสิทธิ์อย่างน้อยตามที่กำหนด
 * ไม่ใช่สมาชิก → ตอบ 404 (ไม่บอกว่าร้านนี้มีอยู่จริง)
 */
export function requireOrg(db: Db, minRole: Role = "viewer") {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const orgId = (req.params as { orgId?: string }).orgId;
    if (!orgId || !UUID.test(orgId) || !req.userId)
      throw new HttpError(404, "not_found", "ไม่พบร้านนี้");
    const [m] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, req.userId)));
    if (!m) throw new HttpError(404, "not_found", "ไม่พบร้านนี้");
    if (RANK[m.role] < RANK[minRole])
      throw new HttpError(403, "forbidden", "สิทธิ์ของคุณทำรายการนี้ไม่ได้");
    req.org = { id: orgId, role: m.role };
  };
}
