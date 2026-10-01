import { defineConfig } from "tsup";

// รวม workspace packages (@portfolio/tools, shared) เข้าไปในไฟล์เดียว เพราะ package เหล่านั้นเป็น TypeScript ล้วน
export default defineConfig({
  entry: ["src/server.ts", "src/db/migrate-cli.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@portfolio\//],
});
