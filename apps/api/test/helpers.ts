import postgres from "postgres";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://otto:otto@localhost:5432/otto_test";

/** ล้างฐานข้อมูลทดสอบให้ว่างแล้วรัน migration ใหม่ทั้งหมด — ทุกไฟล์ test เริ่มจากสภาพเดียวกัน */
export async function resetDatabase() {
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`drop schema if exists public cascade`;
    await sql`drop schema if exists drizzle cascade`;
    await sql`create schema public`;
  } finally {
    await sql.end();
  }
  await runMigrations(TEST_DATABASE_URL);
}

export async function makeApp(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    RATE_LIMIT: "false",
    ...env,
  });
  const { db, client } = createDb(config.DATABASE_URL, { max: 3 });
  const app = await buildApp({ config, db });
  return { app, db, client, close: async () => (await app.close(), await client.end()) };
}

type App = Awaited<ReturnType<typeof makeApp>>["app"];
let counter = 0;

/** สมัครผู้ใช้ใหม่ (อีเมลไม่ซ้ำ) แล้วคืน token + ร้านแรก */
export async function signup(app: App, name = "ทดสอบ") {
  const email = `user${Date.now()}${++counter}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct-horse-battery", name },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.body}`);
  const body = res.json();
  return {
    email,
    token: body.accessToken as string,
    refresh: body.refreshToken as string,
    userId: body.user.id as string,
    orgId: body.orgs[0].id as string,
  };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
