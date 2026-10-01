import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

/** โฟลเดอร์ migration อ้างจาก working directory (apps/api) — กำหนดเองได้ด้วย MIGRATIONS_DIR */
export const migrationsDir = () => path.resolve(process.env.MIGRATIONS_DIR ?? "drizzle");

export async function runMigrations(url: string) {
  const { db, client } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: migrationsDir() });
  } finally {
    await client.end();
  }
}
