import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

/**
 * connection string จากผู้ให้บริการ (เช่น Neon) มักมี parameter ที่ไลบรารี postgres.js ไม่รู้จัก
 * แล้วส่งต่อเป็นค่าตั้งของเซิร์ฟเวอร์ → Postgres ปฏิเสธ ("unrecognized configuration parameter")
 * ตัดทิ้งก่อนเชื่อมต่อ — sslmode ยังเก็บไว้ (postgres.js แปลงเป็น ssl เอง)
 */
const DRIVER_UNSUPPORTED_PARAMS = ["channel_binding", "pgbouncer", "connect_timeout"];

export function normalizeDatabaseUrl(raw: string): string {
  const url = new URL(raw);
  for (const p of DRIVER_UNSUPPORTED_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

/** เชื่อมต่อ Postgres — max ต่ำๆ เพราะฐานข้อมูลแผนฟรีจำกัดจำนวน connection */
export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(normalizeDatabaseUrl(url), {
    max: opts.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  // คอลัมน์เงินเป็น bigint mode "number" — ปลอดภัยถึง 2^53 สตางค์ (≈ 90 ล้านล้านบาท)
  return { db: drizzle(client, { schema }), client };
}
