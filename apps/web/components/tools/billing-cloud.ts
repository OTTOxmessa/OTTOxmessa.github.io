"use client";

/**
 * โหมดออนไลน์ของระบบใบเสนอราคา/ใบแจ้งหนี้ — ข้อมูลอยู่บน OTTO API (Postgres)
 * หน้าจอใช้ข้อมูลรูปแบบเดียวกับโหมดในเครื่อง (Store) โดยโหลดจาก GET /orgs/:id/snapshot
 * ทุกการแก้ไขยิงไปที่ API แล้วโหลด snapshot ใหม่ — เลขที่เอกสาร ยอดเงิน และใบเสร็จมาจากเซิร์ฟเวอร์เสมอ
 */
import type { Business, CatalogItem, Customer, Doc, Payment, QuoteStatus } from "@portfolio/tools/billing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClient, ApiError, errorText, newKey, toSatang, type ApiRole, type ApiSession } from "@/lib/api";

export type Store = { docs: Doc[]; customers: Customer[]; items: CatalogItem[]; biz: Business };
export type PayInput = { date: string; amount: number; method: Payment["method"]; note: string; receipt: boolean };

/** ทุกการแก้ไขผ่าน interface นี้ — โหมดในเครื่องกับออนไลน์ใช้หน้าจอชุดเดียวกัน */
export type Actions = {
  /** บันทึกเอกสาร คืน id และเลขที่ (ออนไลน์: เลขที่ออกโดยเซิร์ฟเวอร์) */
  saveDoc: (d: Doc, newCustomer: Customer | null, isNew: boolean) => Promise<{ id: string; no: string }>;
  setQuoteStatus: (d: Doc, s: QuoteStatus) => Promise<void>;
  convert: (d: Doc) => Promise<{ id: string; no: string }>;
  voidDoc: (d: Doc) => Promise<void>;
  /** idemKey: ใช้ key เดิมเมื่อส่งซ้ำ (เช่น เน็ตหลุด) เพื่อไม่ให้รับเงินซ้ำ */
  pay: (d: Doc, p: PayInput, idemKey: string) => Promise<{ receiptNo: string | null }>;
  saveCustomer: (c: Customer, isNew: boolean) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addItem: (i: Omit<CatalogItem, "id">) => Promise<void>;
  updateItem: (id: string, p: Partial<CatalogItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateBiz: (p: Partial<Business>) => Promise<void>;
  /** แทนที่ข้อมูลทั้งชุด (กู้คืนไฟล์/ล้างข้อมูล) — มีเฉพาะโหมดในเครื่อง */
  replaceAll?: (s: Store) => Promise<void>;
};

type Snapshot = {
  org: Business & { id: string; role: ApiRole };
  customers: Customer[];
  items: CatalogItem[];
  docs: (Doc & { version: number })[];
};
type DocRes = { id: string; no: string };

export type CloudStatus = "off" | "waking" | "loading" | "ready" | "error";

const lineBody = (d: Doc) =>
  d.lines.map((l) => ({ description: l.description.trim(), qty: l.qty, unit: l.unit.trim(), priceSatang: toSatang(l.price) }));

export function useBillingCloud() {
  const api = useMemo(() => new ApiClient(), []);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [role, setRole] = useState<ApiRole>("viewer");
  const [status, setStatus] = useState<CloudStatus>("off");
  const [error, setError] = useState("");
  const versions = useRef(new Map<string, number>());
  const loadedAt = useRef(0);
  const woke = useRef(false);
  const orgId = session?.orgId ?? null;

  useEffect(() => {
    setSession(api.session);
    setMounted(true);
    const off = api.subscribe(setSession);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "otto-api-session") api.syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      off();
      window.removeEventListener("storage", onStorage);
    };
  }, [api]);

  const reload = useCallback(async () => {
    if (!api.session?.orgId) return;
    const id = api.session.orgId;
    const s = await api.get<Snapshot>(`/orgs/${id}/snapshot`);
    if (api.session?.orgId !== id) return; // เปลี่ยนร้านระหว่างโหลด
    const { role: r, ...rest } = s.org;
    const biz: Business = { name: rest.name, taxId: rest.taxId, branch: rest.branch, address: rest.address, phone: rest.phone, email: rest.email, promptpay: rest.promptpay, vatRegistered: rest.vatRegistered, signer: rest.signer, dueDays: rest.dueDays, validDays: rest.validDays, prefixes: rest.prefixes };
    versions.current = new Map(s.docs.map((d) => [d.id, d.version]));
    setRole(r);
    setStore({ biz, customers: s.customers, items: s.items, docs: s.docs.map(({ version: _v, ...d }) => d) });
    loadedAt.current = Date.now();
  }, [api]);

  /** เข้าโหมดออนไลน์: ปลุกเซิร์ฟเวอร์ (ครั้งแรก) → โหลด snapshot */
  const start = useCallback(async () => {
    setError("");
    try {
      if (!woke.current) {
        setStatus("loading");
        await api.wake({ onSlow: () => setStatus("waking") });
        woke.current = true;
      }
      setStatus("loading");
      await reload();
      setStatus("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setStatus("off");
        setError("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง");
        return;
      }
      setStatus("error");
      setError(errorText(e));
    }
  }, [api, reload]);

  useEffect(() => {
    if (!mounted) return;
    if (!session) {
      setStore(null);
      setStatus("off");
      return;
    }
    if (!orgId) {
      setStatus("error");
      setError("บัญชีนี้ยังไม่มีร้าน");
      return;
    }
    setStore(null);
    void start();
    // โหลดใหม่เมื่อเปลี่ยนผู้ใช้/ร้านเท่านั้น (ไม่ใช่ทุกครั้งที่ token ถูกหมุน)
  }, [mounted, session?.user.id, orgId]);

  // กลับมาที่แท็บนี้ → โหลดข้อมูลล่าสุด (เผื่อมีคนอื่นในร้านแก้ไข)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && api.session && status === "ready" && Date.now() - loadedAt.current > 30_000) void reload().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [api, reload, status]);

  const base = () => {
    if (!api.session?.orgId) throw new ApiError(401, "unauthenticated", "กรุณาเข้าสู่ระบบ");
    return `/orgs/${api.session.orgId}`;
  };
  /** ทำงานแล้วโหลดใหม่ — ถ้าเจอ 409 (ข้อมูลเปลี่ยน) ก็โหลดใหม่ให้ด้วย แล้วส่งข้อผิดพลาดต่อให้หน้าจอแสดง */
  async function mutate<T>(work: () => Promise<T>): Promise<T> {
    try {
      const out = await work();
      await reload();
      return out;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await reload().catch(() => undefined);
      throw e;
    }
  }

  const actions: Actions = {
    saveDoc: (d, _newCustomer, isNew) =>
      mutate(async () => {
        const known = store?.customers.some((c) => c.id === d.customerId);
        const body = {
          date: d.date,
          due: d.due,
          customerId: known ? d.customerId : null,
          customer: d.customer,
          lines: lineBody(d),
          discountSatang: toSatang(d.discount),
          vatMode: d.vatMode,
          whtRate: d.whtRate,
          note: d.note,
        };
        const r = isNew
          ? await api.post<DocRes>(`${base()}/documents`, { type: d.type, ...body })
          : await api.patch<DocRes>(`${base()}/documents/${d.id}`, { version: versions.current.get(d.id) ?? 1, ...body });
        return { id: r.id, no: r.no };
      }),
    setQuoteStatus: (d, quoteStatus) => mutate(async () => void (await api.post(`${base()}/documents/${d.id}/status`, { quoteStatus }))),
    convert: (d) => mutate(async () => api.post<DocRes>(`${base()}/documents/${d.id}/convert`, {})),
    voidDoc: (d) => mutate(async () => void (await api.post(`${base()}/documents/${d.id}/void`))),
    pay: (d, p, idemKey) =>
      mutate(async () => {
        const r = await api.post<{ receiptNo: string | null }>(
          `${base()}/documents/${d.id}/payments`,
          { date: p.date, amountSatang: toSatang(p.amount), method: p.method, note: p.note, issueReceipt: p.receipt },
          { headers: { "idempotency-key": idemKey } },
        );
        return { receiptNo: r.receiptNo };
      }),
    saveCustomer: (c, isNew) =>
      mutate(async () => {
        const { id, ...body } = c;
        if (isNew) await api.post(`${base()}/customers`, body);
        else await api.patch(`${base()}/customers/${id}`, body);
      }),
    deleteCustomer: (id) => mutate(async () => void (await api.del(`${base()}/customers/${id}`))),
    addItem: (i) => mutate(async () => void (await api.post(`${base()}/items`, { name: i.name, unit: i.unit, priceSatang: toSatang(i.price) }))),
    updateItem: (id, p) =>
      mutate(async () => {
        const body: Record<string, unknown> = {};
        if (p.name !== undefined) body.name = p.name;
        if (p.unit !== undefined) body.unit = p.unit;
        if (p.price !== undefined) body.priceSatang = toSatang(p.price);
        await api.patch(`${base()}/items/${id}`, body);
      }),
    deleteItem: (id) => mutate(async () => void (await api.del(`${base()}/items/${id}`))),
    updateBiz: async (p) => {
      await api.patch(base(), p);
      setStore((s) => (s ? { ...s, biz: { ...s.biz, ...p } } : s));
    },
  };

  /** นำข้อมูลในเครื่องขึ้นร้านออนไลน์ (ร้านต้องยังไม่มีเอกสาร) */
  async function importLocal(local: Store) {
    const r = await mutate(() => api.post<{ imported: { docs: number; customers: number; items: number } }>(`${base()}/import`, local, { timeoutMs: 120_000 }));
    return r.imported;
  }

  async function withStart<T>(fn: () => Promise<T>) {
    setError("");
    try {
      if (!woke.current) {
        setStatus("loading");
        await api.wake({ onSlow: () => setStatus("waking") });
        woke.current = true;
      }
      return await fn();
    } catch (e) {
      setStatus((s) => (api.session ? s : "off"));
      throw e;
    }
  }

  return {
    mounted,
    session,
    store,
    role,
    status,
    error,
    actions,
    apiUrl: api.baseUrl,
    reload: start,
    importLocal,
    login: (email: string, password: string) => withStart(() => api.login(email, password)),
    register: (input: { email: string; password: string; name?: string; orgName?: string }) => withStart(() => api.register(input)),
    demo: () => withStart(() => api.demo()),
    logout: () => api.logout(),
    selectOrg: (id: string) => api.selectOrg(id),
    newKey,
  };
}

export type BillingCloud = ReturnType<typeof useBillingCloud>;
