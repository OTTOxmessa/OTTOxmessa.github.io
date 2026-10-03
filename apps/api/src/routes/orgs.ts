import { taxIdError } from "@portfolio/tools/billing";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app";
import { memberships, organizations, users } from "../db/schema";
import { audit } from "../lib/audit";
import { badRequest, conflict, HttpError, notFound } from "../lib/errors";
import { requireAuth, requireOrg, type Role } from "../plugins/auth";

const orgParams = z.object({ orgId: z.uuid() });
const role = z.enum(["owner", "staff", "viewer"]);

const settings = z
  .object({
    name: z.string().trim().min(1).max(120),
    taxId: z.string().trim().max(20),
    branch: z.string().trim().max(60),
    address: z.string().trim().max(500),
    phone: z.string().trim().max(40),
    email: z.string().trim().max(254),
    promptpay: z.string().trim().max(20),
    vatRegistered: z.boolean(),
    signer: z.string().trim().max(100),
    dueDays: z.number().int().min(0).max(365),
    validDays: z.number().int().min(0).max(365),
    prefixes: z.object({
      QT: z
        .string()
        .trim()
        .regex(/^[A-Z0-9-]{1,10}$/),
      INV: z
        .string()
        .trim()
        .regex(/^[A-Z0-9-]{1,10}$/),
      RC: z
        .string()
        .trim()
        .regex(/^[A-Z0-9-]{1,10}$/),
    }),
  })
  .partial();

const publicOrg = (o: typeof organizations.$inferSelect) => ({
  id: o.id,
  name: o.name,
  taxId: o.taxId,
  branch: o.branch,
  address: o.address,
  phone: o.phone,
  email: o.email,
  promptpay: o.promptpay,
  vatRegistered: o.vatRegistered,
  signer: o.signer,
  dueDays: o.dueDays,
  validDays: o.validDays,
  prefixes: o.prefixes,
});

export async function orgRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = requireAuth(config);
  const sec = [{ bearer: [] }];

  r.post(
    "/orgs",
    {
      schema: {
        tags: ["orgs"],
        summary: "สร้างร้านใหม่ (ผู้สร้างเป็นเจ้าของ)",
        security: sec,
        body: z.object({ name: z.string().trim().min(1).max(120) }),
      },
      preHandler: auth,
    },
    async (req, reply) => {
      const org = await db.transaction(async (tx) => {
        const [o] = await tx.insert(organizations).values({ name: req.body.name }).returning();
        await tx.insert(memberships).values({ orgId: o!.id, userId: req.userId!, role: "owner" });
        return o!;
      });
      return reply.code(201).send({ ...publicOrg(org), role: "owner" as Role });
    },
  );

  r.get(
    "/orgs/:orgId",
    {
      schema: {
        tags: ["orgs"],
        summary: "ข้อมูลร้าน (หัวเอกสาร)",
        security: sec,
        params: orgParams,
      },
      preHandler: [auth, requireOrg(db)],
    },
    async (req) => {
      const [o] = await db.select().from(organizations).where(eq(organizations.id, req.org!.id));
      return { ...publicOrg(o!), role: req.org!.role };
    },
  );

  r.patch(
    "/orgs/:orgId",
    {
      schema: {
        tags: ["orgs"],
        summary: "แก้ข้อมูลร้าน (เจ้าของเท่านั้น)",
        security: sec,
        params: orgParams,
        body: settings,
      },
      preHandler: [auth, requireOrg(db, "owner")],
    },
    async (req) => {
      if (req.body.taxId) {
        const err = taxIdError(req.body.taxId);
        if (err) throw badRequest(err);
      }
      const [o] = await db
        .update(organizations)
        .set(req.body)
        .where(eq(organizations.id, req.org!.id))
        .returning();
      await audit(db, req, "org.update", "organization", o!.id, req.body);
      return { ...publicOrg(o!), role: req.org!.role };
    },
  );

  r.get(
    "/orgs/:orgId/members",
    {
      schema: { tags: ["orgs"], summary: "สมาชิกในร้าน", security: sec, params: orgParams },
      preHandler: [auth, requireOrg(db)],
    },
    async (req) => {
      return db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          role: memberships.role,
          since: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.orgId, req.org!.id))
        .orderBy(memberships.createdAt);
    },
  );

  r.post(
    "/orgs/:orgId/members",
    {
      schema: {
        tags: ["orgs"],
        summary: "เพิ่มสมาชิกจากอีเมล (ต้องสมัครไว้แล้ว)",
        security: sec,
        params: orgParams,
        body: z.object({ email: z.email().transform((s) => s.toLowerCase()), role }),
      },
      preHandler: [auth, requireOrg(db, "owner")],
    },
    async (req, reply) => {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${req.body.email}`);
      if (!u) throw notFound("ไม่พบผู้ใช้ที่ใช้อีเมลนี้ — ให้เขาสมัครสมาชิกก่อน");
      const inserted = await db
        .insert(memberships)
        .values({ orgId: req.org!.id, userId: u.id, role: req.body.role })
        .onConflictDoNothing()
        .returning();
      if (!inserted.length) throw conflict("ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว");
      await audit(db, req, "member.add", "user", u.id, { role: req.body.role });
      return reply.code(201).send({ userId: u.id, role: req.body.role });
    },
  );

  /** ร้านต้องมีเจ้าของอย่างน้อย 1 คนเสมอ — ล็อกแถวเจ้าของไว้กันสองคำขอลดสิทธิ์พร้อมกัน */
  async function assertNotLastOwner(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    orgId: string,
    userId: string,
  ) {
    const owners = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")))
      .for("update");
    if (owners.length === 1 && owners[0]!.userId === userId)
      throw conflict("ร้านต้องมีเจ้าของอย่างน้อย 1 คน");
  }

  const memberParams = z.object({ orgId: z.uuid(), userId: z.uuid() });

  r.patch(
    "/orgs/:orgId/members/:userId",
    {
      schema: {
        tags: ["orgs"],
        summary: "เปลี่ยนสิทธิ์สมาชิก",
        security: sec,
        params: memberParams,
        body: z.object({ role }),
      },
      preHandler: [auth, requireOrg(db, "owner")],
    },
    async (req) => {
      return db.transaction(async (tx) => {
        if (req.body.role !== "owner") await assertNotLastOwner(tx, req.org!.id, req.params.userId);
        const [m] = await tx
          .update(memberships)
          .set({ role: req.body.role })
          .where(and(eq(memberships.orgId, req.org!.id), eq(memberships.userId, req.params.userId)))
          .returning();
        if (!m) throw notFound("ไม่พบสมาชิกนี้");
        await audit(tx as unknown as typeof db, req, "member.role", "user", m.userId, {
          role: m.role,
        });
        return { userId: m.userId, role: m.role };
      });
    },
  );

  r.delete(
    "/orgs/:orgId/members/:userId",
    {
      schema: {
        tags: ["orgs"],
        summary: "นำสมาชิกออก (หรือออกจากร้านเอง)",
        security: sec,
        params: memberParams,
      },
      preHandler: [auth, requireOrg(db)],
    },
    async (req, reply) => {
      const self = req.params.userId === req.userId;
      if (!self && req.org!.role !== "owner")
        throw new HttpError(403, "forbidden", "เฉพาะเจ้าของร้านนำสมาชิกออกได้");
      await db.transaction(async (tx) => {
        await assertNotLastOwner(tx, req.org!.id, req.params.userId);
        const del = await tx
          .delete(memberships)
          .where(and(eq(memberships.orgId, req.org!.id), eq(memberships.userId, req.params.userId)))
          .returning();
        if (!del.length) throw notFound("ไม่พบสมาชิกนี้");
      });
      await audit(db, req, "member.remove", "user", req.params.userId, null);
      return reply.code(204).send();
    },
  );
}
