/**
 * ตัวเชื่อม OTTO API (apps/api) สำหรับหน้าเว็บ
 *
 * การยืนยันตัวตนแบบ "access token อายุสั้น + refresh token ที่หมุนทุกครั้ง":
 * - access token (JWT 15 นาที) แนบเป็น `Authorization: Bearer …`
 * - หมดอายุ/ใกล้หมด → แลก refresh token เป็นชุดใหม่ (ใช้ได้ครั้งเดียว) อัตโนมัติ แล้วส่งคำขอเดิมซ้ำ
 * - คำขอหลายอันเจอ 401 พร้อมกัน → แลก token แค่ครั้งเดียว (single-flight)
 * - หลายแท็บใช้ storage ร่วมกัน: ก่อนแลก token จะดูก่อนว่าแท็บอื่นแลกไปแล้วหรือยัง
 * ใช้ได้กับเว็บบน github.io ที่ต่างโดเมนกับ API เพราะไม่พึ่ง cookie
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://otto-api-14oc.onrender.com").replace(/\/$/, "");
export const SESSION_KEY = "otto-api-session";

export type ApiRole = "owner" | "staff" | "viewer";
export type ApiOrg = { id: string; name: string; role: ApiRole };
export type ApiUser = { id: string; email: string; name: string };
export type ApiSession = {
  accessToken: string;
  refreshToken: string;
  /** เวลา (ms) ที่ access token หมดอายุ */
  accessExpiresAt: number;
  user: ApiUser;
  orgs: ApiOrg[];
  orgId: string | null;
  demo?: boolean;
};
type AuthResponse = { user: ApiUser; orgs: ApiOrg[]; accessToken: string; refreshToken: string; expiresIn: number; demo?: boolean };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const toSatang = (baht: number) => Math.round(baht * 100);
export const toBaht = (satang: number) => satang / 100;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Options = {
  baseUrl?: string;
  storage?: StorageLike | null;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};
type RequestOptions = { body?: unknown; headers?: Record<string, string>; auth?: boolean; timeoutMs?: number };

/** refresh ล่วงหน้าเมื่อ access token เหลือน้อยกว่านี้ — กันหมดอายุกลางทาง */
const EARLY_REFRESH_MS = 30_000;

function isSession(v: unknown): v is ApiSession {
  const s = v as ApiSession;
  return Boolean(s && typeof s.accessToken === "string" && typeof s.refreshToken === "string" && s.user && Array.isArray(s.orgs));
}

export class ApiClient {
  readonly baseUrl: string;
  private storage: StorageLike | null;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private timeoutMs: number;
  private refreshing: Promise<void> | null = null;
  private listeners = new Set<(s: ApiSession | null) => void>();
  session: ApiSession | null;

  constructor(opts: Options = {}) {
    this.baseUrl = (opts.baseUrl ?? API_URL).replace(/\/$/, "");
    this.storage = opts.storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : opts.storage;
    this.fetchImpl = opts.fetch ?? ((...a) => fetch(...a));
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.session = this.readStored();
  }

  /* ---------- session ---------- */
  private readStored(): ApiSession | null {
    try {
      const raw = this.storage?.getItem(SESSION_KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : null;
      return isSession(v) ? v : null;
    } catch {
      return null;
    }
  }
  private setSession(s: ApiSession | null) {
    this.session = s;
    try {
      if (s) this.storage?.setItem(SESSION_KEY, JSON.stringify(s));
      else this.storage?.removeItem(SESSION_KEY);
    } catch {
      /* storage ถูกบล็อก — ยังใช้งานได้ แค่ไม่จำหลังปิดแท็บ */
    }
    for (const fn of this.listeners) fn(s);
  }
  subscribe(fn: (s: ApiSession | null) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  /** แท็บอื่นเปลี่ยน session (login/logout/แลก token) → อัปเดตตาม */
  syncFromStorage() {
    const s = this.readStored();
    if (JSON.stringify(s) !== JSON.stringify(this.session)) {
      this.session = s;
      for (const fn of this.listeners) fn(s);
    }
  }
  selectOrg(orgId: string) {
    if (this.session) this.setSession({ ...this.session, orgId });
  }
  private fromAuth(r: AuthResponse, orgId?: string | null): ApiSession {
    return {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      accessExpiresAt: this.now() + r.expiresIn * 1000,
      user: r.user,
      orgs: r.orgs,
      orgId: orgId && r.orgs.some((o) => o.id === orgId) ? orgId : (r.orgs[0]?.id ?? null),
      demo: r.demo,
    };
  }

  /* ---------- HTTP ---------- */
  private async raw(method: string, path: string, o: RequestOptions, token?: string) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? this.timeoutMs);
    const headers: Record<string, string> = { accept: "application/json", ...o.headers };
    if (o.body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new ApiError(0, "timeout", "เซิร์ฟเวอร์ตอบช้าเกินไป ลองใหม่อีกครั้ง");
      throw new ApiError(0, "network", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      clearTimeout(timer);
    }
  }

  private static async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const type = res.headers.get("content-type") ?? "";
    const body: unknown = type.includes("json") ? await res.json().catch(() => null) : await res.text();
    if (res.ok) return body as T;
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `คำขอล้มเหลว (${res.status})`, err?.details);
  }

  async request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const auth = o.auth ?? true;
    if (!auth) return ApiClient.parse<T>(await this.raw(method, path, o));
    if (!this.session) throw new ApiError(401, "unauthenticated", "กรุณาเข้าสู่ระบบ");
    if (this.session.accessExpiresAt - this.now() < EARLY_REFRESH_MS) await this.refresh();
    let res = await this.raw(method, path, o, this.session?.accessToken);
    if (res.status === 401) {
      const used = this.session?.accessToken;
      await this.refresh(used);
      res = await this.raw(method, path, o, this.session?.accessToken);
    }
    return ApiClient.parse<T>(res);
  }
  get<T>(path: string, o?: RequestOptions) {
    return this.request<T>("GET", path, o);
  }
  post<T>(path: string, body?: unknown, o?: RequestOptions) {
    return this.request<T>("POST", path, { ...o, body: body ?? {} });
  }
  patch<T>(path: string, body: unknown, o?: RequestOptions) {
    return this.request<T>("PATCH", path, { ...o, body });
  }
  del<T>(path: string, o?: RequestOptions) {
    return this.request<T>("DELETE", path, o);
  }

  /**
   * แลก refresh token — ทำทีละครั้ง (คำขอที่มาพร้อมกันรอผลเดียวกัน)
   * @param staleAccess access token ที่เพิ่งโดน 401 ถ้า session ตอนนี้มี token ใหม่แล้วก็ไม่ต้องแลกซ้ำ
   */
  async refresh(staleAccess?: string): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      // แท็บอื่นอาจแลกไปแล้ว — ใช้ของใหม่ใน storage แทนการเอา token เก่าไปแลก (ซึ่งจะถูกมองว่าใช้ซ้ำ)
      const stored = this.readStored();
      if (stored && this.session && stored.refreshToken !== this.session.refreshToken) {
        this.setSession({ ...stored, orgId: this.session.orgId ?? stored.orgId });
        if (stored.accessExpiresAt - this.now() > EARLY_REFRESH_MS) return;
      }
      const s = this.session;
      if (!s) throw new ApiError(401, "unauthenticated", "กรุณาเข้าสู่ระบบ");
      if (staleAccess && s.accessToken !== staleAccess && s.accessExpiresAt - this.now() > EARLY_REFRESH_MS) return;
      const res = await this.raw("POST", "/auth/refresh", { body: { refreshToken: s.refreshToken } });
      if (res.status === 401) {
        const e = await ApiClient.parse<never>(res).catch((x: unknown) => x as ApiError);
        this.setSession(null);
        throw e;
      }
      const r = await ApiClient.parse<{ accessToken: string; refreshToken: string; expiresIn: number }>(res);
      const cur = this.session ?? s;
      this.setSession({ ...cur, accessToken: r.accessToken, refreshToken: r.refreshToken, accessExpiresAt: this.now() + r.expiresIn * 1000 });
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /* ---------- auth ---------- */
  async login(email: string, password: string) {
    const r = await this.request<AuthResponse>("POST", "/auth/login", { auth: false, body: { email, password } });
    this.setSession(this.fromAuth(r));
    return this.session!;
  }
  async register(input: { email: string; password: string; name?: string; orgName?: string }) {
    const r = await this.request<AuthResponse>("POST", "/auth/register", { auth: false, body: input });
    this.setSession(this.fromAuth(r));
    return this.session!;
  }
  async demo() {
    const r = await this.request<AuthResponse>("POST", "/auth/demo", { auth: false, body: {} });
    this.setSession(this.fromAuth({ ...r, demo: true }));
    return this.session!;
  }
  /** โหลดรายชื่อร้านใหม่ (เช่น หลังถูกเพิ่มเข้าร้านอื่น) */
  async refreshMe() {
    const r = await this.get<{ user: ApiUser; orgs: ApiOrg[] }>("/me");
    if (this.session) {
      const orgId = r.orgs.some((o) => o.id === this.session!.orgId) ? this.session.orgId : (r.orgs[0]?.id ?? null);
      this.setSession({ ...this.session, user: r.user, orgs: r.orgs, orgId });
    }
    return r;
  }
  async logout() {
    const s = this.session;
    this.setSession(null);
    if (s) await this.request("POST", "/auth/logout", { auth: false, body: { refreshToken: s.refreshToken }, timeoutMs: 10_000 }).catch(() => undefined);
  }

  /**
   * ปลุกเซิร์ฟเวอร์ (โฮสต์แผนฟรีหลับเมื่อไม่มีคนใช้ ~15 นาที ตื่นช้า ~30–60 วินาที)
   * เรียก /health ซ้ำจนตอบ ok หรือหมดเวลา · onSlow ถูกเรียกเมื่อรอนานเกิน 3 วินาที (ให้ UI บอกผู้ใช้)
   */
  async wake({ timeoutMs = 90_000, onSlow }: { timeoutMs?: number; onSlow?: () => void } = {}) {
    const start = this.now();
    const slow = setTimeout(() => onSlow?.(), 3000);
    try {
      for (;;) {
        const left = timeoutMs - (this.now() - start);
        if (left <= 0) throw new ApiError(0, "timeout", "เซิร์ฟเวอร์ยังไม่ตื่น ลองใหม่อีกครั้งในอีกสักครู่");
        try {
          const res = await this.raw("GET", "/health", { timeoutMs: Math.min(left, 65_000) });
          if (res.ok) return;
        } catch (e) {
          if ((e as ApiError).code === "timeout" && this.now() - start >= timeoutMs) throw e;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } finally {
      clearTimeout(slow);
    }
  }
}

/** ข้อความผิดพลาดที่แสดงผู้ใช้ได้ (รวมรายละเอียด validation ข้อแรก) */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const first = Array.isArray(e.details) ? (e.details[0] as { message?: string } | undefined)?.message : undefined;
    return first && first !== e.message ? `${e.message}: ${first}` : e.message;
  }
  return (e as Error)?.message ?? String(e);
}

/** Idempotency-Key แบบสุ่ม (ใช้ crypto.randomUUID ถ้ามี) */
export function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
