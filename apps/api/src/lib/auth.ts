import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { refreshTokens } from "../db/schema";
import { HttpError } from "./errors";

/* ------------------------------------------------------------------ รหัสผ่าน (argon2id) */

// ค่าตามคำแนะนำ OWASP สำหรับ argon2id (19 MiB, 2 รอบ)
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON);

// ใช้ตรวจเมื่อไม่พบอีเมล เพื่อให้เวลาตอบเท่ากับกรณีพบ — ไม่ให้ใครเดาได้ว่าอีเมลไหนมีบัญชี
let dummyHash: Promise<string> | null = null;
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) {
    dummyHash ??= hashPassword("timing-equaliser-password");
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}

/* ------------------------------------------------------------------ access token (JWT อายุสั้น) */

const key = (config: Config) => new TextEncoder().encode(config.JWT_SECRET);
const ISSUER = "otto-api";

export async function signAccessToken(config: Config, userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SEC}s`)
    .sign(key(config));
}

export async function verifyAccessToken(config: Config, token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, key(config), {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    if (!payload.sub) throw new Error("no subject");
    return payload.sub;
  } catch {
    throw new HttpError(401, "invalid_token", "โทเค็นไม่ถูกต้องหรือหมดอายุ");
  }
}

/* ------------------------------------------------------------------ refresh token (หมุนเวียน + ตรวจการใช้ซ้ำ) */

const REUSE_GRACE_MS = 20_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueRefreshToken(
  db: Db,
  config: Config,
  userId: string,
  opts: { familyId?: string; userAgent?: string } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId,
      familyId: opts.familyId ?? crypto.randomUUID(),
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent: (opts.userAgent ?? "").slice(0, 200),
    })
    .returning({ id: refreshTokens.id });
  return { token, id: row!.id };
}

export async function issueSession(db: Db, config: Config, userId: string, userAgent?: string) {
  const [accessToken, refresh] = await Promise.all([
    signAccessToken(config, userId),
    issueRefreshToken(db, config, userId, { userAgent }),
  ]);
  return { accessToken, refreshToken: refresh.token, expiresIn: config.ACCESS_TOKEN_TTL_SEC };
}

/**
 * แลก refresh token เป็นชุดใหม่ (ใช้ได้ครั้งเดียว)
 * - token ที่ถูกใช้ไปแล้วถูกนำมาใช้อีก → ถือว่าถูกขโมย ยกเลิกทั้งตระกูล ผู้ใช้ต้อง login ใหม่
 * - ล็อกแถวด้วย FOR UPDATE: ถ้าสองแท็บขอพร้อมกัน จะมีแค่คำขอแรกที่ได้ token ใหม่
 */
export async function rotateRefreshToken(
  db: Db,
  config: Config,
  token: string,
  userAgent?: string,
) {
  type Out = { reusedFamily: string } | { userId: string; refreshToken: string };
  const out: Out = await db.transaction(async (tx): Promise<Out> => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(token)))
      .for("update");
    if (!row) throw new HttpError(401, "invalid_refresh", "เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่");
    if (row.revokedAt) {
      // ช่วงผ่อนผันสั้นๆ: สองแท็บขอพร้อมกัน หรือเน็ตหลุดตอนรับคำตอบ → ยังให้ token ใหม่ในตระกูลเดิม
      // เกินช่วงนี้ = มีคนเอา token เก่ามาใช้ (อาจถูกขโมย) → ยกเลิกทั้งตระกูล
      const inGrace =
        row.replacedBy !== null && Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS;
      if (!inGrace) return { reusedFamily: row.familyId };
      const next = await issueRefreshToken(tx as unknown as Db, config, row.userId, {
        familyId: row.familyId,
        userAgent,
      });
      return { userId: row.userId, refreshToken: next.token };
    }
    if (row.expiresAt < new Date())
      throw new HttpError(401, "refresh_expired", "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    const next = await issueRefreshToken(tx as unknown as Db, config, row.userId, {
      familyId: row.familyId,
      userAgent,
    });
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: next.id })
      .where(eq(refreshTokens.id, row.id));
    return { userId: row.userId, refreshToken: next.token };
  });
  if ("reusedFamily" in out) {
    // ยกเลิกทั้งตระกูลนอก transaction ด้านบน — ถ้าทำข้างในแล้ว throw การยกเลิกจะถูก rollback ไปด้วย
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, out.reusedFamily), isNull(refreshTokens.revokedAt)));
    throw new HttpError(
      401,
      "refresh_reused",
      "เซสชันถูกใช้ซ้ำ — ยกเลิกทุกเซสชันที่เกี่ยวข้องแล้ว กรุณาเข้าสู่ระบบใหม่",
    );
  }
  return {
    userId: out.userId,
    accessToken: await signAccessToken(config, out.userId),
    refreshToken: out.refreshToken,
    expiresIn: config.ACCESS_TOKEN_TTL_SEC,
  };
}

export async function revokeRefreshFamily(db: Db, token: string) {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, sha256(token)));
  if (row)
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
}
