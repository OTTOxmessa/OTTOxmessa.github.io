import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

/** เชื่อมต่อ Postgres — max ต่ำๆ เพราะฐานข้อมูลแผนฟรีจำกัดจำนวน connection */
export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, {
    max: opts.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  // คอลัมน์เงินเป็น bigint mode "number" — ปลอดภัยถึง 2^53 สตางค์ (≈ 90 ล้านล้านบาท)
  return { db: drizzle(client, { schema }), client };
}
