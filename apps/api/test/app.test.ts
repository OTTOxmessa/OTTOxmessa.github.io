import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { makeApp, resetDatabase } from "./helpers";

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  await resetDatabase();
  ctx = await makeApp();
});
afterAll(() => ctx.close());

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: "ok" });
    expect(res.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
  });

  it("returns 503 when the database is unreachable", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "postgres://otto:otto@127.0.0.1:1/none" });
    const { db, client } = createDb(config.DATABASE_URL, { max: 1 });
    const app = await buildApp({ config, db });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: "down" });
    await app.close();
    await client.end({ timeout: 1 });
  });
});

describe("errors and CORS", () => {
  it("answers unknown routes with a JSON 404", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });

  it("allows the portfolio origin and rejects others", async () => {
    const ok = await ctx.app.inject({ method: "OPTIONS", url: "/health", headers: { origin: "https://ottoxmessa.github.io", "access-control-request-method": "GET" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("https://ottoxmessa.github.io");
    const bad = await ctx.app.inject({ method: "OPTIONS", url: "/health", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets basic security headers", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.json().name).toBe("OTTO API");
  });
});

describe("config", () => {
  it("fails fast with a readable message", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(loadConfig({ DATABASE_URL: "postgres://a@b/c", CORS_ORIGINS: "https://a.com, https://b.com" }).CORS_ORIGINS).toEqual(["https://a.com", "https://b.com"]);
  });
});
