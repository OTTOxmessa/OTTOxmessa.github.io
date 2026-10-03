import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app";
import { memberships, organizations, users } from "../db/schema";
import {
  hashPassword,
  issueSession,
  revokeRefreshFamily,
  rotateRefreshToken,
  verifyPassword,
} from "../lib/auth";
import { HttpError } from "../lib/errors";
import { requireAuth } from "../plugins/auth";
import { billingSample } from "@portfolio/tools/billing-sample";
import { randomBytes } from "node:crypto";
import { bangkokToday } from "../services/billing";
import { importBackup } from "../services/import";

export const DEMO_DOMAIN = "demo.otto.invalid";

const email = z.string().trim().toLowerCase().pipe(z.email("อีเมลไม่ถูกต้อง").max(254));
const password = z.string().min(10, "รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร").max(200);

export async function orgsOf(db: AppDeps["db"], userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.createdAt);
}

export async function authRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const ua = (h: unknown) => (typeof h === "string" ? h : "");

  r.post(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        summary: "สมัครสมาชิก (สร้างร้านแรกให้อัตโนมัติ)",
        body: z.object({
          email,
          password,
          name: z.string().trim().max(100).default(""),
          orgName: z.string().trim().min(1).max(120).optional(),
        }),
      },
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (req, reply) => {
      const { email, password, name, orgName } = req.body;
      const passwordHash = await hashPassword(password);
      const result = await db.transaction(async (tx) => {
        const [exists] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`);
        if (exists) throw new HttpError(409, "email_taken", "อีเมลนี้มีบัญชีอยู่แล้ว");
        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash, name })
          .returning({ id: users.id, email: users.email, name: users.name });
        const [org] = await tx
          .insert(organizations)
          .values({ name: orgName ?? (name ? `ร้านของ${name}` : "ร้านของฉัน") })
          .returning({ id: organizations.id });
        await tx.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
        return user!;
      });
      const session = await issueSession(db, config, result.id, ua(req.headers["user-agent"]));
      return reply.code(201).send({ user: result, orgs: await orgsOf(db, result.id), ...session });
    },
  );

  r.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        summary: "เข้าสู่ระบบ",
        body: z.object({ email, password: z.string().min(1).max(200) }),
      },
      config: {
        // จำกัดต่อ IP + อีเมล: เดารหัสผ่านได้ไม่เกิน 10 ครั้ง / 15 นาที
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
          keyGenerator: (req) =>
            `${req.ip}|${String((req.body as { email?: string })?.email ?? "").toLowerCase()}`,
        },
      },
    },
    async (req) => {
      const [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${req.body.email}`);
      const ok = await verifyPassword(user?.passwordHash ?? null, req.body.password);
      if (!user || !ok)
        throw new HttpError(401, "invalid_credentials", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      const session = await issueSession(db, config, user.id, ua(req.headers["user-agent"]));
      return {
        user: { id: user.id, email: user.email, name: user.name },
        orgs: await orgsOf(db, user.id),
        ...session,
      };
    },
  );

  r.post(
    "/auth/refresh",
    {
      schema: {
        tags: ["auth"],
        summary: "แลก refresh token เป็นชุดใหม่ (ใช้ได้ครั้งเดียว)",
        body: z.object({ refreshToken: z.string().min(20).max(200) }),
      },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (req) =>
      rotateRefreshToken(db, config, req.body.refreshToken, ua(req.headers["user-agent"])),
  );

  r.post(
    "/auth/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "ออกจากระบบ (ยกเลิกเซสชันนี้)",
        body: z.object({ refreshToken: z.string().min(20).max(200) }),
      },
    },
    async (req, reply) => {
      await revokeRefreshFamily(db, req.body.refreshToken);
      return reply.code(204).send();
    },
  );

  /**
   * บัญชีทดลอง: สร้างบัญชีชั่วคราวพร้อมข้อมูลตัวอย่าง 5 เดือน (ข้อมูลชุดเดียวกับปุ่มตัวอย่างในหน้าเว็บ)
   * แต่ละคนได้ร้านของตัวเอง ไม่ชนกัน · บัญชีทดลองที่เก่ากว่า 24 ชั่วโมงถูกลบทิ้งตอนมีคนขอใหม่
   */
  r.post(
    "/auth/demo",
    {
      schema: {
        tags: ["auth"],
        summary: "เปิดบัญชีทดลองพร้อมข้อมูลตัวอย่าง (หมดอายุใน 24 ชั่วโมง)",
      },
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (req, reply) => {
      await db.execute(sql`
        with old as (select id from users where email like ${"%@" + DEMO_DOMAIN} and created_at < now() - interval '24 hours')
        delete from organizations o where exists (select 1 from memberships m where m.org_id = o.id and m.user_id in (select id from old))`);
      await db.execute(
        sql`delete from users where email like ${"%@" + DEMO_DOMAIN} and created_at < now() - interval '24 hours'`,
      );
      const email = `demo-${randomBytes(6).toString("hex")}@${DEMO_DOMAIN}`;
      const passwordHash = await hashPassword(randomBytes(24).toString("base64url")); // ไม่มีใครรู้ — เข้าได้ผ่าน token นี้เท่านั้น
      const sample = billingSample(bangkokToday(), () => crypto.randomUUID());
      const user = await db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({ email, passwordHash, name: "ผู้ทดลองใช้" })
          .returning({ id: users.id, email: users.email, name: users.name });
        const [org] = await tx
          .insert(organizations)
          .values({ name: "OTTO Studio (ทดลอง)" })
          .returning({ id: organizations.id });
        await tx.insert(memberships).values({ orgId: org!.id, userId: u!.id, role: "owner" });
        await importBackup(tx, org!.id, u!.id, {
          ...sample,
          biz: { ...sample.biz, name: "OTTO Studio (ทดลอง)" },
        });
        return u!;
      });
      const session = await issueSession(db, config, user.id, ua(req.headers["user-agent"]));
      return reply
        .code(201)
        .send({ user, orgs: await orgsOf(db, user.id), demo: true, ...session });
    },
  );

  r.get(
    "/me",
    {
      schema: {
        tags: ["auth"],
        summary: "ข้อมูลผู้ใช้และร้านที่เป็นสมาชิก",
        security: [{ bearer: [] }],
      },
      preHandler: requireAuth(config),
    },
    async (req) => {
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, req.userId!));
      if (!user) throw new HttpError(401, "unauthenticated", "ไม่พบบัญชีนี้แล้ว");
      return { user, orgs: await orgsOf(db, user.id) };
    },
  );

  r.post(
    "/me/password",
    {
      schema: {
        tags: ["auth"],
        summary: "เปลี่ยนรหัสผ่าน (ออกจากระบบทุกเครื่อง)",
        security: [{ bearer: [] }],
        body: z.object({ currentPassword: z.string().min(1), newPassword: password }),
      },
      preHandler: requireAuth(config),
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (req, reply) => {
      const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
      if (!user || !(await verifyPassword(user.passwordHash, req.body.currentPassword)))
        throw new HttpError(400, "invalid_credentials", "รหัสผ่านเดิมไม่ถูกต้อง");
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(req.body.newPassword) })
        .where(eq(users.id, user.id));
      await db.execute(
        sql`update refresh_tokens set revoked_at = now() where user_id = ${user.id} and revoked_at is null`,
      );
      return reply.code(204).send();
    },
  );
}
