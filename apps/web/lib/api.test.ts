import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, errorText, SESSION_KEY, type ApiSession } from "./api";

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** เซิร์ฟเวอร์จำลอง: access token ที่ถูกต้องคือ token ล่าสุดที่ออกให้ */
function fakeServer() {
  let n = 0;
  let validAccess = "";
  let validRefresh = "";
  const calls: { path: string; auth?: string; body?: unknown }[] = [];
  const issue = () => {
    n++;
    validAccess = `access-${n}`;
    validRefresh = `refresh-token-number-${n}-xxxxxxxxxxxx`;
    return { accessToken: validAccess, refreshToken: validRefresh, expiresIn: 900 };
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("https://api.test", "");
    const auth = (init?.headers as Record<string, string>)?.authorization;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, auth, body });
    await new Promise((r) => setTimeout(r, 1));
    if (path === "/auth/login") {
      if (body.password !== "correct-horse") return json(401, { error: { code: "invalid_credentials", message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" } });
      return json(200, { user: { id: "u1", email: body.email, name: "" }, orgs: [{ id: "o1", name: "ร้าน", role: "owner" }], ...issue() });
    }
    if (path === "/auth/refresh") {
      if (body.refreshToken !== validRefresh) return json(401, { error: { code: "refresh_reused", message: "เซสชันถูกใช้ซ้ำ" } });
      return json(200, { userId: "u1", ...issue() });
    }
    if (path === "/auth/logout") return json(204, null);
    if (path === "/bad") return json(400, { error: { code: "validation", message: "ข้อมูลไม่ถูกต้อง", details: [{ path: "body.lines", message: "ใส่อย่างน้อย 1 รายการ" }] } });
    if (auth !== `Bearer ${validAccess}`) return json(401, { error: { code: "invalid_token", message: "โทเค็นไม่ถูกต้องหรือหมดอายุ" } });
    return json(200, { ok: true, path });
  });
  return { fetchImpl, calls, expire: () => (validAccess = "expired") };
}

function setup(now = () => 1_000_000) {
  const storage = memStorage();
  const srv = fakeServer();
  const api = new ApiClient({ baseUrl: "https://api.test", storage, fetch: srv.fetchImpl as unknown as typeof fetch, now });
  return { api, storage, srv };
}

describe("ApiClient", () => {
  it("login เก็บ session และแนบ Bearer token กับคำขอถัดไป", async () => {
    const { api, storage, srv } = setup();
    await api.login("a@b.co", "correct-horse");
    expect(api.session?.orgId).toBe("o1");
    expect(JSON.parse(storage.getItem(SESSION_KEY)!).refreshToken).toMatch(/^refresh-token-number-1/);
    await expect(api.get("/orgs/o1/snapshot")).resolves.toEqual({ ok: true, path: "/orgs/o1/snapshot" });
    expect(srv.calls.at(-1)!.auth).toBe("Bearer access-1");
  });

  it("รหัสผิด → ApiError พร้อมข้อความจากเซิร์ฟเวอร์ และไม่เก็บ session", async () => {
    const { api } = setup();
    const e = await api.login("a@b.co", "nope").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe("invalid_credentials");
    expect(api.session).toBeNull();
  });

  it("access token หมดอายุ → แลก refresh token อัตโนมัติแล้วส่งคำขอเดิมซ้ำ", async () => {
    const { api, srv } = setup();
    await api.login("a@b.co", "correct-horse");
    srv.expire();
    await expect(api.get("/x")).resolves.toMatchObject({ ok: true });
    expect(srv.calls.map((c) => c.path)).toEqual(["/auth/login", "/x", "/auth/refresh", "/x"]);
    expect(api.session?.accessToken).toBe("access-2");
  });

  it("หลายคำขอเจอ 401 พร้อมกัน → แลก token ครั้งเดียว (ไม่ถูกมองว่าใช้ซ้ำ)", async () => {
    const { api, srv } = setup();
    await api.login("a@b.co", "correct-horse");
    srv.expire();
    const out = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c"), api.get("/d")]);
    expect(out).toHaveLength(4);
    expect(srv.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1);
    expect(api.session).not.toBeNull();
  });

  it("ใกล้หมดอายุ → แลกล่วงหน้าก่อนส่งคำขอ", async () => {
    let t = 1_000_000;
    const { api, srv } = setup(() => t);
    await api.login("a@b.co", "correct-horse");
    t += 890_000; // เหลือ 10 วินาที
    await api.get("/x");
    expect(srv.calls.map((c) => c.path)).toEqual(["/auth/login", "/auth/refresh", "/x"]);
  });

  it("แท็บอื่นแลก token ไปแล้ว → ใช้ token ใหม่จาก storage แทนการแลกซ้ำ", async () => {
    const { api, storage, srv } = setup();
    await api.login("a@b.co", "correct-horse");
    // แท็บที่สองอ่าน session เดียวกัน แล้วแลก token ไปก่อน
    const other = new ApiClient({ baseUrl: "https://api.test", storage, fetch: srv.fetchImpl as unknown as typeof fetch, now: () => 1_000_000 });
    await other.refresh();
    await expect(api.get("/x")).resolves.toMatchObject({ ok: true });
    expect(srv.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1);
    expect(api.session?.accessToken).toBe(other.session?.accessToken);
  });

  it("refresh ถูกปฏิเสธ → ล้าง session และแจ้งผู้ฟัง", async () => {
    const { api, storage, srv } = setup();
    await api.login("a@b.co", "correct-horse");
    const seen: (ApiSession | null)[] = [];
    api.subscribe((s) => seen.push(s));
    srv.expire();
    // ทำให้ refresh token ที่ถืออยู่เก่า
    api.session = { ...api.session!, refreshToken: "stolen-or-old-token-xxxxxxxxxx" };
    storage.setItem(SESSION_KEY, JSON.stringify(api.session));
    const e = (await api.get("/x").catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe("refresh_reused");
    expect(api.session).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });

  it("logout ล้างในเครื่องทันทีและเพิกถอน refresh token ที่เซิร์ฟเวอร์", async () => {
    const { api, srv } = setup();
    await api.login("a@b.co", "correct-horse");
    await api.logout();
    expect(api.session).toBeNull();
    expect(srv.calls.at(-1)).toMatchObject({ path: "/auth/logout", body: { refreshToken: expect.stringMatching(/^refresh/) } });
  });

  it("errorText รวมรายละเอียด validation ข้อแรก", async () => {
    const { api } = setup();
    const e = await api.request("POST", "/bad", { auth: false, body: {} }).catch((x: unknown) => x);
    expect(errorText(e)).toBe("ข้อมูลไม่ถูกต้อง: ใส่อย่างน้อย 1 รายการ");
  });

  it("เน็ตหลุด → ApiError code network", async () => {
    const api = new ApiClient({ baseUrl: "https://api.test", storage: null, fetch: (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch });
    const e = (await api.request("GET", "/health", { auth: false }).catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe("network");
  });
});
