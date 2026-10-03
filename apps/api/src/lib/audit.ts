import type { FastifyRequest } from "fastify";
import type { Db } from "../db/client";
import { auditLog } from "../db/schema";

/** บันทึกว่าใครทำอะไรกับข้อมูลไหน — เรียกภายใน transaction เดียวกับการเปลี่ยนแปลงได้ */
export async function audit(
  db: Db,
  req: FastifyRequest,
  action: string,
  entity: string,
  entityId: string | null,
  data: unknown,
) {
  if (!req.org) return;
  await db.insert(auditLog).values({
    orgId: req.org.id,
    userId: req.userId ?? null,
    action,
    entity,
    entityId,
    data: data ?? null,
  });
}
