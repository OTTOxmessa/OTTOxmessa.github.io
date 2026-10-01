import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";

const config = loadConfig();

// รัน migration ก่อนเปิดรับ request — deploy ใหม่แล้วโครงสร้างฐานข้อมูลตรงกับโค้ดเสมอ
if (process.env.MIGRATE_ON_START !== "false") await runMigrations(config.DATABASE_URL);

const { db, client } = createDb(config.DATABASE_URL);
const app = await buildApp({ config, db });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await client.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
