import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ต้องตั้ง DATABASE_URL ก่อนรัน migration");
  process.exit(1);
}
const started = Date.now();
await runMigrations(url);
console.log(`migration เสร็จใน ${Date.now() - started} ms`);
