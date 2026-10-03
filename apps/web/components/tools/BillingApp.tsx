"use client";

import {
  aging,
  balance,
  blankDoc,
  docsCsv,
  invoiceStatus,
  monthSummary,
  paidAmount,
  quoteToInvoice,
  receivePayment,
  snapshot,
  statement,
  taxIdError,
  topCustomers,
  totalsOf,
  VAT_RATE,
  WHT_RATES,
  type Business,
  type CatalogItem,
  type Customer,
  type Doc,
  type DocType,
  type InvoiceStatus,
  type Line,
  type Payment,
  type QuoteStatus,
} from "@portfolio/tools/billing";
import { billingSample, defaultBusiness } from "@portfolio/tools/billing-sample";
import { detectKind, sanitizeId } from "@portfolio/tools/promptpay";
import { bahtText } from "@portfolio/tools/thai-text";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { errorText } from "@/lib/api";
import { useLang } from "@/lib/useLang";
import { useBillingCloud, type Actions, type BillingCloud, type PayInput, type Store } from "./billing-cloud";
import { baht, ConfirmButton, download, num, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { PromptPayQr } from "./PromptPayQr";
import { Modal, PrintSheet, printNow, Tabs, useHashView } from "./ui";

type View = "dashboard" | "docs" | "customers" | "items" | "settings";
const VIEWS = ["dashboard", "docs", "customers", "items", "settings"] as const;
type TFn = (th: string, en: string) => string;
type SetStore = (f: (s: Store) => Store) => void;

const defaultBiz: Business = defaultBusiness;
const empty = (): Store => ({ docs: [], customers: [], items: [], biz: defaultBiz });

const TYPE_LABEL: Record<DocType, [string, string]> = { QT: ["ใบเสนอราคา", "Quotation"], INV: ["ใบแจ้งหนี้", "Invoice"], RC: ["ใบเสร็จ", "Receipt"] };
const INV_STATUS: Record<InvoiceStatus, [string, string]> = { unpaid: ["รอชำระ", "Unpaid"], partial: ["ชำระบางส่วน", "Partly paid"], paid: ["ชำระแล้ว", "Paid"], overdue: ["เลยกำหนด", "Overdue"], void: ["ยกเลิก", "Void"] };
const QT_STATUS: Record<QuoteStatus, [string, string]> = { draft: ["ร่าง", "Draft"], sent: ["ส่งแล้ว", "Sent"], accepted: ["ลูกค้าตกลง", "Accepted"], rejected: ["ไม่ผ่าน", "Declined"] };
const METHOD: Record<Payment["method"], [string, string]> = { transfer: ["โอนเงิน", "Bank transfer"], promptpay: ["พร้อมเพย์", "PromptPay"], cash: ["เงินสด", "Cash"], cheque: ["เช็ค", "Cheque"] };
const ROLE: Record<string, [string, string]> = { owner: ["เจ้าของร้าน", "Owner"], staff: ["พนักงาน", "Staff"], viewer: ["ดูอย่างเดียว", "Viewer"] };

function statusOf(d: Doc, today: string): { key: string; label: [string, string] } {
  if (d.voided) return { key: "void", label: INV_STATUS.void };
  if (d.type === "INV") {
    const st = invoiceStatus(d, today);
    return { key: st, label: INV_STATUS[st] };
  }
  if (d.type === "QT") {
    const expired = d.quoteStatus !== "accepted" && d.quoteStatus !== "rejected" && d.due !== null && d.due < today;
    return expired ? { key: "expired", label: ["หมดอายุ", "Expired"] } : { key: d.quoteStatus, label: QT_STATUS[d.quoteStatus] };
  }
  return { key: "issued", label: ["ออกแล้ว", "Issued"] };
}

const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const fmtLong = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "—");

/** โหมดในเครื่อง: แก้ข้อมูลใน localStorage ตรงๆ (ทำงานทันที ไม่ต้องมีเน็ต) */
function makeLocalActions(setStore: SetStore, get: () => Store): Actions {
  const setDoc = (id: string, p: Partial<Doc>) => setStore((s) => ({ ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, ...p } : d)) }));
  return {
    saveDoc: async (d, newCustomer) => {
      setStore((s) => ({
        ...s,
        customers: newCustomer ? [...s.customers, newCustomer] : s.customers,
        docs: s.docs.some((x) => x.id === d.id) ? s.docs.map((x) => (x.id === d.id ? d : x)) : [...s.docs, d],
      }));
      return { id: d.id, no: d.no };
    },
    setQuoteStatus: async (d, quoteStatus) => setDoc(d.id, { quoteStatus }),
    convert: async (d) => {
      const s = get();
      const inv = quoteToInvoice(d, s.docs, s.biz, todayIso(), uid(), uid);
      setStore((x) => ({ ...x, docs: [...x.docs.map((y) => (y.id === d.id ? { ...y, quoteStatus: "accepted" as const } : y)), inv] }));
      return { id: inv.id, no: inv.no };
    },
    voidDoc: async (d) => setDoc(d.id, { voided: true }),
    pay: async (d, p: PayInput) => {
      const s = get();
      const r = receivePayment(s.docs, d.id, { date: p.date, amount: p.amount, method: p.method, note: p.note }, s.biz, { payment: uid(), receipt: p.receipt ? uid() : null, line: uid });
      setStore((x) => ({ ...x, docs: r.docs }));
      return { receiptNo: r.receipt?.no ?? null };
    },
    saveCustomer: async (c) => setStore((s) => ({ ...s, customers: s.customers.some((x) => x.id === c.id) ? s.customers.map((x) => (x.id === c.id ? c : x)) : [...s.customers, c] })),
    deleteCustomer: async (id) => setStore((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) })),
    addItem: async (i) => setStore((s) => ({ ...s, items: [...s.items, { id: uid(), ...i }] })),
    updateItem: async (id, p) => setStore((s) => ({ ...s, items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
    deleteItem: async (id) => setStore((s) => ({ ...s, items: s.items.filter((x) => x.id !== id) })),
    updateBiz: async (p) => setStore((s) => ({ ...s, biz: { ...s.biz, ...p } })),
    replaceAll: async (next) => setStore(() => next),
  };
}

/* ------------------------------------------------------------------ APP */
export function BillingApp() {
  const lang = useLang();
  const T: TFn = (th, en) => (lang === "th" ? th : en);
  const [local, setLocal, ready] = useStoredState<Store>("tool-billing-v1", empty);
  const cloud = useBillingCloud();
  const [view, setViewRaw] = useState<View>("dashboard");
  const setView = useHashView(VIEWS, "dashboard", setViewRaw);
  const [toast, show] = useToast();
  const [today, setToday] = useState("");
  const [editing, setEditing] = useState<Doc | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Doc | null>(null);
  const [account, setAccount] = useState(false);
  const localRef = useRef(local);
  localRef.current = local;
  const localActions = useMemo(() => makeLocalActions(setLocal, () => localRef.current), [setLocal]);
  useEffect(() => setToday(todayIso()), []);
  const money = (n: number) => baht(n, lang);

  if (!ready || !today || !cloud.mounted) return <div className="bigapp billing" aria-busy="true" />;

  const online = cloud.session !== null;
  const store = online ? cloud.store : local;
  const actions = online ? cloud.actions : localActions;
  const role = online ? cloud.role : "owner";
  const orgName = online ? (cloud.store?.biz.name ?? cloud.session!.orgs.find((o) => o.id === cloud.session!.orgId)?.name ?? "") : local.biz.name;

  /** เรียก action แล้วแจ้งผล (สำเร็จ/ผิดพลาด) ด้วย toast — คืน true ถ้าสำเร็จ */
  async function act(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) show(ok);
      return true;
    } catch (e) {
      show(errorText(e));
      return false;
    }
  }

  const chip = (
    <button type="button" className={`cloud-chip${online ? " is-online" : ""}`} onClick={() => setAccount(true)} aria-haspopup="dialog">
      <span className="cloud-dot" aria-hidden="true" />
      {online ? T("ออนไลน์", "Online") : T("ในเครื่องนี้", "This device")}
      <span className="cloud-chip-act">{online ? T("บัญชี", "Account") : T("ใช้ออนไลน์", "Go online")}</span>
    </button>
  );
  const accountModal = (
    <Modal open={account} onClose={() => setAccount(false)} title={online ? T("บัญชีออนไลน์", "Online account") : T("ใช้งานแบบออนไลน์", "Use online")}>
      <AccountPanel cloud={cloud} T={T} local={local} show={show} onDone={() => setAccount(false)} />
    </Modal>
  );

  if (!store) {
    return (
      <div className="bigapp billing">
        {toast}
        <div className="bigapp-bar">
          <p className="bigapp-name">{orgName || T("ระบบเอกสาร", "Billing")}</p>
          {chip}
        </div>
        <CloudWait cloud={cloud} T={T} />
        {accountModal}
      </div>
    );
  }

  const overdue = store.docs.filter((d) => d.type === "INV" && invoiceStatus(d, today) === "overdue").length;
  const tabs = [
    { id: "dashboard" as const, label: T("ภาพรวม", "Overview") },
    { id: "docs" as const, label: T("เอกสาร", "Documents"), badge: overdue || undefined },
    { id: "customers" as const, label: T("ลูกค้า", "Customers") },
    { id: "items" as const, label: T("สินค้า/บริการ", "Items") },
    { id: "settings" as const, label: T("ข้อมูลกิจการ", "Business") },
  ];

  function newDoc(type: DocType, customer: Customer | null = null) {
    if (!store) return;
    if (role === "viewer") return show(T("บัญชีนี้ดูได้อย่างเดียว", "Read-only account"));
    setEditing(blankDoc(type, store.docs, store.biz, customer, today, uid()));
    setOpenId(null);
  }
  function print(d: Doc) {
    setPrinting(d);
    printNow();
  }

  const ctx: Ctx = { store, actions, act, online, role, local, cloud, T, money, show, today, open: setOpenId, newDoc, edit: (d) => { setOpenId(null); setEditing(structuredClone(d)); } };
  const current = store.docs.find((d) => d.id === openId) ?? null;

  return (
    <div className="bigapp billing">
      {toast}
      <div className="bigapp-bar">
        <p className="bigapp-name">{store.biz.name}</p>
        {chip}
        <Tabs tabs={tabs} value={view} onChange={(v) => { setEditing(null); setView(v); }} label={T("เมนูระบบเอกสาร", "Billing sections")} />
      </div>

      {online && cloud.session?.demo && (
        <p className="cloud-note">{T("บัญชีทดลอง — ข้อมูลอยู่บนเซิร์ฟเวอร์จริง ลองออกเอกสาร รับชำระ หรือเปิดอีกเครื่องดูได้ · ถูกลบอัตโนมัติใน 24 ชั่วโมง", "Demo account — real server data, try it from another device too · deleted after 24 hours")}</p>
      )}

      {store.docs.length === 0 && store.customers.length === 0 && !editing && view !== "settings" && (
        <div className="panel empty-state">
          {online ? (
            <p>{T("ร้านนี้ยังไม่มีเอกสาร — ออกใบเสนอราคาใบแรกได้เลย หรือนำข้อมูลจากโหมดในเครื่องขึ้นมาได้ที่แท็บ “ข้อมูลกิจการ”", "No documents yet — create your first quotation, or import this device's data from the Business tab.")}</p>
          ) : (
            <p>{T("เริ่มจากกรอกข้อมูลกิจการในแท็บ “ข้อมูลกิจการ” แล้วออกใบเสนอราคาใบแรกได้เลย — หรือลองข้อมูลตัวอย่างของสตูดิโอรับทำเว็บ (มีเอกสารย้อนหลัง 5 เดือน ลูกหนี้ค้างชำระ และใบเสร็จ)", "Fill in your business details, then create your first quotation — or load a sample web studio with 5 months of documents.")}</p>
          )}
          <div className="side-actions">
            {!online && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setLocal(() => billingSample(today, uid)); show(T("โหลดข้อมูลตัวอย่างแล้ว", "Sample loaded")); }}>{T("ใช้ข้อมูลตัวอย่าง", "Load sample")}</button>}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setView("settings")}>{T("กรอกข้อมูลกิจการ", "Business details")}</button>
          </div>
        </div>
      )}

      <div role="tabpanel" aria-label={editing ? T("แก้ไขเอกสาร", "Edit document") : tabs.find((t) => t.id === view)!.label}>
        {editing ? (
          <Editor
            key={editing.id}
            draft={editing}
            ctx={ctx}
            onCancel={() => setEditing(null)}
            onSave={async (d, newCustomer) => {
              const r = await actions.saveDoc(d, newCustomer, !store.docs.some((x) => x.id === d.id));
              setEditing(null);
              setView("docs");
              setOpenId(r.id);
              show(T(`บันทึก ${r.no} แล้ว`, `Saved ${r.no}`));
            }}
          />
        ) : (
          <>
            {view === "dashboard" && <Dashboard {...ctx} />}
            {view === "docs" && <DocsView {...ctx} />}
            {view === "customers" && <CustomersView {...ctx} />}
            {view === "items" && <ItemsView {...ctx} />}
            {view === "settings" && <SettingsView key={online ? `org-${cloud.session?.orgId}` : "local"} {...ctx} />}
          </>
        )}
      </div>

      <Modal open={current !== null} onClose={() => setOpenId(null)} title={current ? `${T(...TYPE_LABEL[current.type])} ${current.no}` : ""} wide>
        {current && <Viewer key={current.id} doc={current} ctx={ctx} onPrint={print} />}
      </Modal>
      {accountModal}

      <PrintSheet>{printing && <DocPaper doc={printing} biz={store.biz} today={today} docs={store.docs} />}</PrintSheet>
    </div>
  );
}

type Ctx = {
  store: Store;
  actions: Actions;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  online: boolean;
  role: "owner" | "staff" | "viewer";
  /** ข้อมูลโหมดในเครื่อง (ใช้ตอนนำขึ้นออนไลน์) */
  local: Store;
  cloud: BillingCloud;
  T: TFn;
  money: (n: number) => string;
  show: (m: string) => void;
  today: string;
  open: (id: string) => void;
  newDoc: (type: DocType, customer?: Customer | null) => void;
  edit: (d: Doc) => void;
};

/* ------------------------------------------------------------------ ONLINE: waiting / account */
function CloudWait({ cloud, T }: { cloud: BillingCloud; T: TFn }) {
  return (
    <section className="panel cloud-wait" aria-live="polite" aria-busy={cloud.status !== "error"}>
      {cloud.status === "error" ? (
        <>
          <h2 className="panel-title">{T("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ", "Couldn't reach the server")}</h2>
          <p className="field-error" role="alert">{cloud.error}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void cloud.reload()}>{T("ลองใหม่", "Retry")}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void cloud.logout()}>{T("ออกจากระบบ (กลับไปใช้ในเครื่อง)", "Sign out (use this device)")}</button>
          </div>
        </>
      ) : (
        <>
          <span className="cloud-spinner" aria-hidden="true" />
          <p>{cloud.status === "waking" ? T("กำลังปลุกเซิร์ฟเวอร์… เซิร์ฟเวอร์แผนฟรีจะหลับเมื่อไม่มีคนใช้ ครั้งแรกอาจใช้ 30–60 วินาที", "Waking the server… the free plan sleeps when idle, the first request can take 30–60 seconds") : T("กำลังโหลดข้อมูลร้าน…", "Loading…")}</p>
        </>
      )}
    </section>
  );
}

function AccountPanel({ cloud, T, local, show, onDone }: { cloud: BillingCloud; T: TFn; local: Store; show: (m: string) => void; onDone: () => void }) {
  const fid = useId();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const s = cloud.session;

  async function run(kind: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    setErr("");
    try {
      await fn();
      show(ok);
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy("");
    }
  }

  if (s) {
    return (
      <div className="stack-form account-panel">
        <p>
          {T("เข้าสู่ระบบเป็น", "Signed in as")} <b>{s.demo ? T("บัญชีทดลอง", "Demo account") : s.user.email}</b>
          {" · "}{T(...(ROLE[cloud.role] ?? ROLE.viewer!))}
        </p>
        {s.demo && <p className="hint">{T("บัญชีทดลองไม่มีรหัสผ่าน ใช้ได้เฉพาะในเบราว์เซอร์นี้ และถูกลบอัตโนมัติภายใน 24 ชั่วโมง", "The demo account has no password, works in this browser only and is deleted after 24 hours.")}</p>}
        {s.orgs.length > 1 && (
          <div className="field">
            <label htmlFor={`${fid}-org`}>{T("ร้าน", "Business")}</label>
            <select id={`${fid}-org`} value={s.orgId ?? ""} onChange={(e) => { cloud.selectOrg(e.target.value); onDone(); }}>
              {s.orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({T(...(ROLE[o.role] ?? ROLE.viewer!))})</option>)}
            </select>
          </div>
        )}
        <p className="hint">
          {T("ข้อมูลอยู่บนเซิร์ฟเวอร์ (PostgreSQL) — เปิดจากเครื่องไหนก็เห็นตรงกัน ข้อมูลโหมดในเครื่องยังอยู่ครบ กลับไปใช้ได้เมื่อออกจากระบบ", "Data lives on the server — same on every device. This device's local data is untouched and comes back when you sign out.")}
        </p>
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { void cloud.reload(); onDone(); }}>{T("โหลดข้อมูลล่าสุด", "Refresh data")}</button>
          <a className="btn btn-outline btn-sm" href={`${cloud.apiUrl}/docs`} target="_blank" rel="noreferrer">{T("เอกสาร API", "API docs")}<span className="sr-only"> {T("(เปิดแท็บใหม่)", "(opens in a new tab)")}</span></a>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { void cloud.logout(); show(T("ออกจากระบบแล้ว — กลับมาใช้ข้อมูลในเครื่อง", "Signed out — back to this device's data")); onDone(); }}>{T("ออกจากระบบ", "Sign out")}</button>
        </div>
      </div>
    );
  }

  const waking = Boolean(busy) && cloud.status === "waking";
  return (
    <div className="account-panel">
      <p className="hint">
        {T("ใช้ออนไลน์เพื่อเก็บข้อมูลบนเซิร์ฟเวอร์ เปิดได้หลายเครื่อง ใช้ร่วมกับพนักงานได้ — เลขที่เอกสารออกโดยเซิร์ฟเวอร์ ไม่ซ้ำแม้หลายคนออกพร้อมกัน ข้อมูลในเครื่องนี้ไม่ถูกแตะต้อง", "Go online to keep data on the server, use it from any device and with staff — document numbers are issued by the server, never duplicated. This device's data is left untouched.")}
        {local.docs.length > 0 && T(` (ย้ายเอกสาร ${local.docs.length} ใบในเครื่องขึ้นไปได้ภายหลังที่แท็บ “ข้อมูลกิจการ”)`, ` (You can import this device's ${local.docs.length} documents later from the Business tab.)`)}
      </p>
      <div className="side-actions">
        <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void run("demo", () => cloud.demo(), T("เปิดบัญชีทดลองแล้ว", "Demo account ready"))}>
          {busy === "demo" ? T("กำลังเตรียมบัญชีทดลอง…", "Preparing demo…") : T("ทดลองใช้ทันที (ไม่ต้องสมัคร)", "Try instantly (no sign-up)")}
        </button>
      </div>
      <p className="hint">{T("บัญชีทดลองมีข้อมูลตัวอย่าง 5 เดือน และถูกลบอัตโนมัติใน 24 ชั่วโมง", "The demo comes with 5 months of sample data and is deleted after 24 hours.")}</p>

      <div className="seg account-seg" role="group" aria-label={T("เข้าสู่ระบบหรือสมัคร", "Sign in or register")}>
        <button type="button" aria-pressed={mode === "login"} onClick={() => { setMode("login"); setErr(""); }}>{T("เข้าสู่ระบบ", "Sign in")}</button>
        <button type="button" aria-pressed={mode === "register"} onClick={() => { setMode("register"); setErr(""); }}>{T("สมัครใหม่", "Register")}</button>
      </div>
      <form
        className="stack-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.email.trim() || !f.password) return setErr(T("กรอกอีเมลและรหัสผ่าน", "Enter email and password"));
          if (mode === "register" && f.password.length < 10) return setErr(T("รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร", "Password must be at least 10 characters"));
          void run(
            mode,
            () => (mode === "login" ? cloud.login(f.email, f.password) : cloud.register({ email: f.email, password: f.password, name: f.name.trim() || undefined })),
            mode === "login" ? T("เข้าสู่ระบบแล้ว", "Signed in") : T("สร้างบัญชีและร้านแล้ว", "Account created"),
          );
        }}
      >
        <div className="field"><label htmlFor={`${fid}-e`}>{T("อีเมล", "Email")}</label><input id={`${fid}-e`} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field">
          <label htmlFor={`${fid}-p`}>{T("รหัสผ่าน", "Password")}</label>
          <input id={`${fid}-p`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-describedby={mode === "register" ? `${fid}-ph` : undefined} />
          {mode === "register" && <p className="field-hint-muted" id={`${fid}-ph`}>{T("อย่างน้อย 10 ตัวอักษร", "At least 10 characters")}</p>}
        </div>
        {mode === "register" && <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อ (ไม่บังคับ)", "Name (optional)")}</label><input id={`${fid}-n`} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>}
        <p className="field-error" role="alert">{err}</p>
        {waking && <p className="hint" aria-live="polite">{T("กำลังปลุกเซิร์ฟเวอร์ (แผนฟรีหลับเมื่อไม่มีคนใช้) — อาจใช้ 30–60 วินาที", "Waking the server (free plan sleeps when idle) — may take 30–60 seconds")}</p>}
        <div className="side-actions">
          <button type="submit" className="btn btn-outline" disabled={Boolean(busy)}>
            {busy === mode ? T("กำลังดำเนินการ…", "Working…") : mode === "login" ? T("เข้าสู่ระบบ", "Sign in") : T("สมัครและสร้างร้าน", "Register")}
          </button>
        </div>
      </form>
      <p className="privacy">{T("รหัสผ่านเก็บแบบ argon2id · เข้าสู่ระบบด้วย access token อายุ 15 นาที + refresh token ที่หมุนทุกครั้งที่ใช้ · โปรเจกต์สาธิต อย่าใช้รหัสผ่านเดียวกับบัญชีสำคัญ", "Passwords hashed with argon2id · 15-minute access tokens + rotating refresh tokens · demo project — don't reuse an important password.")}</p>
    </div>
  );
}


/* ------------------------------------------------------------------ PAPER (the printable document) */
function paperTitle(d: Doc, biz: Business): [string, string] {
  if (d.type === "QT") return ["ใบเสนอราคา", "Quotation"];
  if (d.type === "INV") return ["ใบแจ้งหนี้", "Invoice"];
  return biz.vatRegistered && d.vatMode !== "none" ? ["ใบเสร็จรับเงิน / ใบกำกับภาษี", "Receipt / Tax Invoice"] : ["ใบเสร็จรับเงิน", "Receipt"];
}

function DocPaper({ doc, biz, today, docs }: { doc: Doc; biz: Business; today: string; docs: Doc[] }) {
  const t = totalsOf(doc);
  const m = (n: number) => baht(n, "th");
  const [th, en] = paperTitle(doc, biz);
  const ref = doc.refId ? docs.find((d) => d.id === doc.refId) : null;
  const bal = doc.type === "INV" ? balance(doc) : 0;
  const pp = sanitizeId(biz.promptpay);
  const st = doc.type === "INV" ? invoiceStatus(doc, today) : null;
  const showQr = doc.type === "INV" && !doc.voided && bal > 0 && detectKind(pp) !== null;
  return (
    <article className={`paper${doc.voided ? " is-void" : ""}`} lang="th">
      <header className="paper-head">
        <div className="paper-biz">
          <p className="paper-bizname">{biz.name}</p>
          {biz.address && <p>{biz.address}</p>}
          <p>
            {biz.taxId && <>เลขประจำตัวผู้เสียภาษี {biz.taxId}{biz.branch && ` (${biz.branch})`}</>}
            {biz.phone && <> · โทร {biz.phone}</>}
            {biz.email && <> · {biz.email}</>}
          </p>
        </div>
        <div className="paper-title">
          <h3>{th}</h3>
          <p className="paper-en">{en}</p>
          <dl>
            <div><dt>เลขที่</dt><dd>{doc.no}</dd></div>
            <div><dt>วันที่</dt><dd>{fmtLong(doc.date)}</dd></div>
            {doc.due && <div><dt>{doc.type === "QT" ? "ยืนราคาถึง" : "ครบกำหนด"}</dt><dd>{fmtLong(doc.due)}</dd></div>}
            {ref && <div><dt>อ้างอิง</dt><dd>{ref.no}</dd></div>}
          </dl>
          {doc.voided && <p className="paper-stamp">ยกเลิก / VOID</p>}
          {st === "paid" && <p className="paper-stamp paper-stamp--ok">ชำระแล้ว / PAID</p>}
        </div>
      </header>
      <section className="paper-cust" aria-label="ลูกค้า">
        <p className="paper-label">ลูกค้า / Customer</p>
        <p className="paper-custname">{doc.customer.name || "—"}</p>
        {doc.customer.address && <p>{doc.customer.address}</p>}
        {(doc.customer.taxId || doc.customer.phone) && (
          <p>
            {doc.customer.taxId && <>เลขประจำตัวผู้เสียภาษี {doc.customer.taxId}{doc.customer.branch && ` (${doc.customer.branch})`}</>}
            {doc.customer.taxId && doc.customer.phone && " · "}
            {doc.customer.phone && <>โทร {doc.customer.phone}</>}
          </p>
        )}
      </section>
      <table className="paper-lines">
        <thead>
          <tr><th scope="col">#</th><th scope="col">รายการ</th><th scope="col">จำนวน</th><th scope="col">ราคา/หน่วย</th><th scope="col">จำนวนเงิน</th></tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td>{l.description}</td>
              <td className="n">{l.qty.toLocaleString("th-TH")} {l.unit}</td>
              <td className="n">{m(l.price)}</td>
              <td className="n">{m(Math.round(l.qty * l.price * 100) / 100)}</td>
            </tr>
          ))}
          {doc.lines.length === 0 && <tr><td colSpan={5} className="paper-emptyrow">— ยังไม่มีรายการ —</td></tr>}
        </tbody>
      </table>
      <div className="paper-foot">
        <div className="paper-words">
          <p className="paper-label">จำนวนเงินตัวอักษร</p>
          <p className="paper-bahttext">({bahtText(t.total)})</p>
          {doc.note && <><p className="paper-label">หมายเหตุ</p><p className="paper-note">{doc.note}</p></>}
          {showQr && <PromptPayQr id={pp} amount={bal} size={120} label={`QR พร้อมเพย์ ${m(bal)} บาท`} />}
        </div>
        <dl className="paper-totals">
          <div><dt>รวมเงิน</dt><dd>{m(t.subtotal)}</dd></div>
          {t.discount > 0 && <><div><dt>ส่วนลด</dt><dd>−{m(t.discount)}</dd></div><div><dt>หลังหักส่วนลด</dt><dd>{m(t.afterDiscount)}</dd></div></>}
          {doc.vatMode !== "none" && (
            <>
              <div><dt>มูลค่าก่อนภาษี</dt><dd>{m(t.base)}</dd></div>
              <div><dt>ภาษีมูลค่าเพิ่ม {VAT_RATE}%</dt><dd>{m(t.vat)}</dd></div>
            </>
          )}
          <div className="pt-total"><dt>รวมทั้งสิ้น</dt><dd>{m(t.total)}</dd></div>
          {t.wht > 0 && <div><dt>หัก ณ ที่จ่าย {doc.whtRate}%</dt><dd>−{m(t.wht)}</dd></div>}
          {t.adjust !== 0 && <div><dt>ปัดเศษ</dt><dd>{t.adjust > 0 ? "+" : "−"}{m(Math.abs(t.adjust))}</dd></div>}
          {(t.wht > 0 || t.adjust !== 0) && <div className="pt-net"><dt>{doc.type === "RC" ? "รับชำระสุทธิ" : "ยอดชำระสุทธิ"}</dt><dd>{m(t.net)}</dd></div>}
          {doc.type === "INV" && paidAmount(doc) > 0 && (
            <>
              <div><dt>ชำระแล้ว</dt><dd>−{m(paidAmount(doc))}</dd></div>
              <div className="pt-net"><dt>คงค้าง</dt><dd>{m(bal)}</dd></div>
            </>
          )}
        </dl>
      </div>
      <div className="paper-sign">
        <div><span />{doc.type === "RC" ? "ผู้รับเงิน" : doc.type === "QT" ? "ผู้อนุมัติ (ลูกค้า)" : "ผู้รับเอกสาร"}</div>
        <div><span />{biz.signer ? `${biz.signer} — ` : ""}ผู้มีอำนาจลงนาม</div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ DASHBOARD */
function Dashboard({ store, T, money, today, open, newDoc }: Ctx) {
  const month = today.slice(0, 7);
  const sum = monthSummary(store.docs, month);
  const ag = aging(store.docs, today);
  const months = useMemo(() => {
    const out: string[] = [];
    const [y, m] = month.split("-").map(Number) as [number, number];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out.map((mm) => ({ m: mm, ...monthSummary(store.docs, mm) }));
  }, [store.docs, month]);
  const max = Math.max(1, ...months.flatMap((x) => [x.invoiced, x.collected]));
  const late = store.docs.filter((d) => d.type === "INV" && invoiceStatus(d, today) === "overdue").sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const waiting = store.docs.filter((d) => d.type === "QT" && !d.voided && d.quoteStatus === "sent");
  const top = topCustomers(store.docs, 5);
  const buckets: { k: keyof typeof ag; th: string; en: string }[] = [
    { k: "current", th: "ยังไม่ถึงกำหนด", en: "Not yet due" },
    { k: "d30", th: "เลย 1–30 วัน", en: "1–30 days" },
    { k: "d60", th: "31–60 วัน", en: "31–60 days" },
    { k: "d90", th: "61–90 วัน", en: "61–90 days" },
    { k: "over90", th: "เกิน 90 วัน", en: "90+ days" },
  ];
  return (
    <div className="report-grid">
      <section className="panel bl-span">
        <div className="panel-row">
          <h2 className="panel-title">{T("เดือนนี้", "This month")} <span className="muted-count">{new Date(`${month}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</span></h2>
          <div className="side-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => newDoc("QT")}>+ {T("ใบเสนอราคา", "Quotation")}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => newDoc("INV")}>+ {T("ใบแจ้งหนี้", "Invoice")}</button>
          </div>
        </div>
        <dl className="money-kpis kpis-4">
          <div><dt>{T("ออกใบแจ้งหนี้", "Invoiced")}</dt><dd>{money(sum.invoiced)}</dd></div>
          <div className="k-in"><dt>{T("รับชำระแล้ว", "Collected")}</dt><dd>{money(sum.collected)}</dd></div>
          <div className={ag.total > 0 ? "k-neg" : ""}><dt>{T("ลูกหนี้ค้างรับทั้งหมด", "Receivables")}</dt><dd>{money(ag.total)}</dd></div>
          <div><dt>{T("ภาษีขาย (VAT)", "Output VAT")}</dt><dd>{money(sum.vat)}</dd></div>
        </dl>
        <p className="hint">
          {T(`เสนอราคา ${sum.quoteCount} ใบ รวม ${money(sum.quoted)} บาท`, `${sum.quoteCount} quotes worth ${money(sum.quoted)}`)}
          {sum.winRate !== null && T(` · ปิดการขายได้ ${sum.winRate}%`, ` · ${sum.winRate}% won`)}
          {sum.wht > 0 && T(` · ลูกค้าหัก ณ ที่จ่าย ${money(sum.wht)} บาท (เก็บหนังสือรับรองไว้ยื่นภาษี)`, ` · ${money(sum.wht)} withheld by clients — keep the certificates`)}
        </p>
      </section>

      <section className="panel">
        <h2 className="panel-title">{T("6 เดือนล่าสุด", "Last 6 months")}</h2>
        <ul className="pair-bars" aria-label={T("ยอดออกใบแจ้งหนี้และยอดรับชำระรายเดือน", "Invoiced and collected per month")}>
          {months.map((x) => (
            <li key={x.m}>
              <span className="pb-label">{new Date(`${x.m}-01T00:00:00`).toLocaleDateString("th-TH", { month: "short" })}</span>
              <span className="pb-bars" aria-hidden="true">
                <i className="pb-a" style={{ width: `${(x.invoiced / max) * 100}%` }} />
                <i className="pb-b" style={{ width: `${(x.collected / max) * 100}%` }} />
              </span>
              <span className="pb-val">{money(x.invoiced)}<br />{money(x.collected)}</span>
              <span className="sr-only">{T(`ออกบิล ${money(x.invoiced)} รับชำระ ${money(x.collected)}`, `invoiced ${money(x.invoiced)}, collected ${money(x.collected)}`)}</span>
            </li>
          ))}
        </ul>
        <p className="legend"><i className="pb-a" /> {T("ออกใบแจ้งหนี้", "Invoiced")} <i className="pb-b" /> {T("รับชำระ", "Collected")}</p>
      </section>

      <section className="panel">
        <h2 className="panel-title">{T("อายุลูกหนี้", "Receivables aging")}</h2>
        <div className="aging-bar" aria-hidden="true">
          {buckets.map((b) => ag[b.k] > 0 && <i key={b.k} className={`ag-${b.k}`} style={{ width: `${(ag[b.k] / Math.max(1, ag.total)) * 100}%` }} />)}
        </div>
        <ul className="top-list aging-list">
          {buckets.map((b) => (
            <li key={b.k}><span><i className={`ag-dot ag-${b.k}`} aria-hidden="true" />{T(b.th, b.en)}</span><span className="mono">{money(ag[b.k])}</span></li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel-title">{T("ต้องติดตาม", "Follow up")}</h2>
        {late.length === 0 && waiting.length === 0 && <p className="hint">{T("ไม่มีงานค้าง", "All clear")}</p>}
        {late.length > 0 && <p className="mini-title">{T("ใบแจ้งหนี้เลยกำหนด", "Overdue invoices")}</p>}
        <ul className="top-list follow-list">
          {late.map((d) => (
            <li key={d.id}>
              <button type="button" className="text-link" onClick={() => open(d.id)}>{d.no}<span className="sr-only"> {d.customer.name}</span></button>
              <span className="fu-cust">{d.customer.name}</span>
              <span className="mono">{money(balance(d))} <span className="tag-clash">{T(`${Math.round((Date.parse(today) - Date.parse(d.due!)) / 86400000)} วัน`, `${Math.round((Date.parse(today) - Date.parse(d.due!)) / 86400000)}d`)}</span></span>
            </li>
          ))}
        </ul>
        {waiting.length > 0 && <p className="mini-title">{T("ใบเสนอราคารอลูกค้าตอบ", "Quotes awaiting reply")}</p>}
        <ul className="top-list follow-list">
          {waiting.map((d) => (
            <li key={d.id}>
              <button type="button" className="text-link" onClick={() => open(d.id)}>{d.no}<span className="sr-only"> {d.customer.name}</span></button>
              <span className="fu-cust">{d.customer.name}</span>
              <span className="mono">{money(totalsOf(d).total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel-title">{T("ลูกค้าหลัก", "Top customers")}</h2>
        {top.length === 0 ? <p className="hint">—</p> : (
          <ol className="top-list">
            {top.map((c) => (
              <li key={c.id}><span>{c.name}</span><span className="mono">{money(c.total)}{c.outstanding > 0 && <small> · {T("ค้าง", "due")} {money(c.outstanding)}</small>}</span></li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ DOCUMENT LIST */
function DocsView({ store, T, money, today, open, newDoc }: Ctx) {
  const fid = useId();
  const [type, setType] = useState<"all" | DocType>("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const list = store.docs
    .filter((d) => (type === "all" || d.type === type) && (status === "all" || statusOf(d, today).key === status) && `${d.no} ${d.customer.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.date === b.date ? (a.no < b.no ? 1 : -1) : a.date < b.date ? 1 : -1));
  const statuses = [...new Map(store.docs.filter((d) => type === "all" || d.type === type).map((d) => statusOf(d, today)).map((s) => [s.key, s.label])).entries()];
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("เอกสารทั้งหมด", "All documents")} <span className="muted-count">({list.length})</span></h2>
        <div className="side-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => newDoc("QT")}>+ {T("ใบเสนอราคา", "Quotation")}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => newDoc("INV")}>+ {T("ใบแจ้งหนี้", "Invoice")}</button>
        </div>
      </div>
      <div className="kb-filter bl-filter">
        <div className="seg" role="group" aria-label={T("ประเภทเอกสาร", "Document type")}>
          {(["all", "QT", "INV", "RC"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => { setType(k); setStatus("all"); }}>{k === "all" ? T("ทั้งหมด", "All") : T(...TYPE_LABEL[k])}</button>
          ))}
        </div>
        <div className="field field--inline">
          <label htmlFor={`${fid}-s`}>{T("สถานะ", "Status")}</label>
          <select id={`${fid}-s`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{T("ทุกสถานะ", "Any")}</option>
            {statuses.map(([k, l]) => <option key={k} value={k}>{T(...l)}</option>)}
          </select>
        </div>
        <div className="field field--inline">
          <label htmlFor={`${fid}-q`}>{T("ค้นหา", "Search")}</label>
          <input id={`${fid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("เลขที่ / ชื่อลูกค้า", "No. / customer")} />
        </div>
      </div>
      {list.length === 0 ? <p className="hint">{T("ไม่พบเอกสาร", "No documents")}</p> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางเอกสาร", "Documents table")}>
          <table className="docs">
            <thead><tr><th scope="col">{T("เลขที่", "No.")}</th><th scope="col">{T("วันที่", "Date")}</th><th scope="col">{T("ลูกค้า", "Customer")}</th><th scope="col">{T("ยอดสุทธิ", "Net")}</th><th scope="col">{T("สถานะ", "Status")}</th></tr></thead>
            <tbody>
              {list.map((d) => {
                const st = statusOf(d, today);
                return (
                  <tr key={d.id} className={d.voided ? "row-void" : ""}>
                    <th scope="row"><button type="button" className="text-link" onClick={() => open(d.id)}>{d.no}</button></th>
                    <td>{fmtDate(d.date)}</td>
                    <td className="wrap">{d.customer.name}</td>
                    <td className="num">{money(totalsOf(d).net)}</td>
                    <td><span className={`st st-${st.key}`}>{T(...st.label)}</span>{d.type === "INV" && st.key === "partial" && <small className="muted"> {T("ค้าง", "due")} {money(balance(d))}</small>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="side-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={!store.docs.length} onClick={() => download(`documents-${today}.csv`, docsCsv(store.docs, today), "text/csv;charset=utf-8")}>{T("ส่งออก CSV (ให้นักบัญชี)", "Export CSV (for your accountant)")}</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ VIEWER */
function Viewer({ doc, ctx, onPrint }: { doc: Doc; ctx: Ctx; onPrint: (d: Doc) => void }) {
  const { store, actions, act, role, cloud, T, money, show, today, open, edit } = ctx;
  const fid = useId();
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const bal = doc.type === "INV" ? balance(doc) : 0;
  const [pay, setPay] = useState({ date: today, amount: String(bal), method: "transfer" as Payment["method"], note: "", receipt: true });
  const [err, setErr] = useState("");
  /** Idempotency-Key ผูกกับเนื้อหาคำขอ: กดซ้ำ/ส่งซ้ำหลังเน็ตหลุด → key เดิม (เซิร์ฟเวอร์ไม่รับเงินซ้ำ) · แก้ยอด → key ใหม่ */
  const payKey = useRef({ body: "", key: "" });
  const children = store.docs.filter((d) => d.refId === doc.id);
  const parent = doc.refId ? store.docs.find((d) => d.id === doc.refId) : null;
  const canWrite = role !== "viewer";
  const editable = canWrite && !doc.voided && doc.type !== "RC" && !(doc.type === "INV" && doc.payments.length > 0);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      return await act(fn, ok);
    } finally {
      setBusy(false);
    }
  }
  function convert() {
    void run(async () => {
      const inv = await actions.convert(doc);
      show(T(`สร้างใบแจ้งหนี้ ${inv.no} แล้ว`, `Created invoice ${inv.no}`));
      open(inv.id);
    });
  }
  function duplicate() {
    const copy: Doc = { ...blankDoc(doc.type === "RC" ? "INV" : doc.type, store.docs, store.biz, null, today, uid()), customerId: doc.customerId, customer: doc.customer, lines: doc.lines.map((l) => ({ ...l, id: uid() })), discount: doc.discount, vatMode: doc.vatMode, whtRate: doc.whtRate, note: doc.note };
    edit(copy);
  }
  async function submitPay(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input: PayInput = { date: pay.date, amount: num(pay.amount), method: pay.method, note: pay.note, receipt: pay.receipt };
    if (!(input.amount > 0)) return setErr(T("ใส่จำนวนเงินมากกว่า 0", "Enter an amount above 0"));
    const body = JSON.stringify(input);
    if (payKey.current.body !== body) payKey.current = { body, key: cloud.newKey() };
    setBusy(true);
    try {
      const r = await actions.pay(doc, input, payKey.current.key);
      payKey.current = { body: "", key: "" };
      setPaying(false);
      setErr("");
      show(r.receiptNo ? T(`รับชำระแล้ว · ออกใบเสร็จ ${r.receiptNo}`, `Payment recorded · receipt ${r.receiptNo}`) : T("บันทึกการรับชำระแล้ว", "Payment recorded"));
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="viewer" aria-busy={busy || undefined}>
      <div className="viewer-actions side-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onPrint(doc)}>{T("พิมพ์ / บันทึก PDF", "Print / save PDF")}</button>
        {editable && <button type="button" className="btn btn-outline btn-sm" onClick={() => edit(doc)}>{T("แก้ไข", "Edit")}</button>}
        {canWrite && doc.type !== "RC" && <button type="button" className="btn btn-outline btn-sm" onClick={duplicate}>{T("ทำสำเนา", "Duplicate")}</button>}
        {canWrite && doc.type === "QT" && !doc.voided && !children.some((c) => c.type === "INV" && !c.voided) && doc.quoteStatus !== "rejected" && (
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={convert}>{T("แปลงเป็นใบแจ้งหนี้", "Convert to invoice")}</button>
        )}
        {canWrite && doc.type === "INV" && !doc.voided && bal > 0 && !paying && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPay({ date: today, amount: String(bal), method: "transfer", note: "", receipt: true }); setErr(""); setPaying(true); }}>{T("รับชำระเงิน", "Record payment")}</button>
        )}
      </div>

      {canWrite && doc.type === "QT" && !doc.voided && (
        <div className="seg qt-status" role="group" aria-label={T("สถานะใบเสนอราคา", "Quote status")}>
          {(Object.keys(QT_STATUS) as QuoteStatus[]).map((k) => (
            <button key={k} type="button" aria-pressed={doc.quoteStatus === k} disabled={busy} onClick={() => doc.quoteStatus !== k && void run(() => actions.setQuoteStatus(doc, k))}>{T(...QT_STATUS[k])}</button>
          ))}
        </div>
      )}

      {paying && (
        <form className="pay-form panel" onSubmit={submitPay} noValidate>
          <h3 className="mini-title">{T(`รับชำระ ${doc.no} (ค้าง ${money(bal)} บาท)`, `Payment for ${doc.no} (due ${money(bal)})`)}</h3>
          <div className="pay-grid">
            <div className="field"><label htmlFor={`${fid}-pd`}>{T("วันที่รับเงิน", "Date")}</label><input id={`${fid}-pd`} type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${fid}-pa`}>{T("จำนวนเงิน (บาท)", "Amount (baht)")}</label><input id={`${fid}-pa`} type="number" inputMode="decimal" min={0} step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-invalid={Boolean(err) || undefined} aria-describedby={`${fid}-pe`} /></div>
            <div className="field">
              <label htmlFor={`${fid}-pm`}>{T("ช่องทาง", "Method")}</label>
              <select id={`${fid}-pm`} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as Payment["method"] })}>
                {(Object.keys(METHOD) as Payment["method"][]).map((k) => <option key={k} value={k}>{T(...METHOD[k])}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor={`${fid}-pn`}>{T("หมายเหตุ", "Note")}</label><input id={`${fid}-pn`} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder={T("เช่น โอนเข้า KBank", "e.g. bank ref")} /></div>
          </div>
          {doc.whtRate > 0 && <p className="hint">{T(`ยอดนี้หักภาษี ณ ที่จ่าย ${doc.whtRate}% แล้ว — ขอหนังสือรับรองการหักภาษี (50 ทวิ) จากลูกค้าด้วย`, `Net of ${doc.whtRate}% withholding — ask the client for the WHT certificate.`)}</p>}
          <label className="check-row"><input type="checkbox" checked={pay.receipt} onChange={(e) => setPay({ ...pay, receipt: e.target.checked })} />{T("ออกใบเสร็จรับเงินอัตโนมัติ", "Issue a receipt automatically")}</label>
          <p className="field-error" id={`${fid}-pe`} role="alert">{err}</p>
          <div className="side-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? T("กำลังบันทึก…", "Saving…") : T("บันทึกรับชำระ", "Save payment")}</button>
            <button type="button" className="text-link" onClick={() => setPaying(false)}>{T("ยกเลิก", "Cancel")}</button>
          </div>
        </form>
      )}

      <div className="paper-wrap"><DocPaper doc={doc} biz={store.biz} today={today} docs={store.docs} /></div>

      {(parent || children.length > 0 || doc.payments.length > 0) && (
        <div className="doc-links">
          {parent && <p>{T("สร้างจาก", "Created from")} <button type="button" className="text-link" onClick={() => open(parent.id)}>{T(...TYPE_LABEL[parent.type])} {parent.no}</button></p>}
          {children.length > 0 && (
            <p>{T("เอกสารที่ออกต่อ", "Follow-up documents")}: {children.map((c, i) => <span key={c.id}>{i > 0 && ", "}<button type="button" className="text-link" onClick={() => open(c.id)}>{c.no}</button>{c.voided && ` (${T("ยกเลิก", "void")})`}</span>)}</p>
          )}
          {doc.payments.length > 0 && (
            <>
              <p className="mini-title">{T("ประวัติการรับชำระ", "Payments")}</p>
              <ul className="top-list">
                {doc.payments.map((p) => (
                  <li key={p.id}><span>{fmtDate(p.date)} · {T(...METHOD[p.method])}{p.note && ` · ${p.note}`}</span><span className="mono">{money(p.amount)}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {canWrite && !doc.voided && (
        <div className="side-actions">
          <ConfirmButton
            label={T("ยกเลิกเอกสารนี้", "Void this document")}
            confirmLabel={T("กดอีกครั้ง — เลขที่นี้จะถูกเก็บไว้แต่ไม่นับยอด", "Tap again — the number is kept but excluded")}
            onConfirm={() => void run(() => actions.voidDoc(doc), T(`ยกเลิก ${doc.no} แล้ว`, `${doc.no} voided`))}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ EDITOR */
function Editor({ draft, ctx, onCancel, onSave }: { draft: Doc; ctx: Ctx; onCancel: () => void; onSave: (d: Doc, newCustomer: Customer | null) => Promise<void> }) {
  const { store, T, money, today, online } = ctx;
  const fid = useId();
  const [d, setD] = useState<Doc>(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Doc>) => setD((x) => ({ ...x, ...p }));
  const setLine = (i: number, p: Partial<Line>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const addLine = (item?: CatalogItem) => setD((x) => ({ ...x, lines: [...x.lines, { id: uid(), description: item?.name ?? "", qty: 1, unit: item?.unit ?? "", price: item?.price ?? 0 }] }));
  const t = totalsOf(d);
  const isNew = !store.docs.some((x) => x.id === d.id);
  const tidErr = taxIdError(d.customer.taxId);
  const lastLine = useRef<HTMLInputElement>(null);
  const [focusLast, setFocusLast] = useState(false);
  useEffect(() => {
    if (focusLast) {
      lastLine.current?.focus();
      setFocusLast(false);
    }
  }, [focusLast, d.lines.length]);
  useEffect(() => {
    if (!draft.lines.length) addLine();
  }, []);

  function pickCustomer(id: string) {
    const c = store.customers.find((x) => x.id === id);
    set(c ? { customerId: c.id, customer: snapshot(c) } : { customerId: "", customer: { name: "", taxId: "", branch: "", address: "", phone: "", email: "" } });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const lines = d.lines.filter((l) => l.description.trim() || l.price);
    const errs: string[] = [];
    if (!d.customer.name.trim()) errs.push(T("ใส่ชื่อลูกค้า", "Enter the customer name"));
    if (!lines.length) errs.push(T("ใส่อย่างน้อย 1 รายการ", "Add at least one line"));
    if (lines.some((l) => !l.description.trim())) errs.push(T("ทุกรายการต้องมีชื่อ", "Every line needs a description"));
    if (lines.some((l) => !(l.qty > 0))) errs.push(T("จำนวนต้องมากกว่า 0", "Quantity must be above 0"));
    if (!online && !d.no.trim()) errs.push(T("ใส่เลขที่เอกสาร", "Enter a document number"));
    if (!online && store.docs.some((x) => x.id !== d.id && x.type === d.type && x.no === d.no.trim())) errs.push(T("เลขที่เอกสารซ้ำ", "Duplicate document number"));
    if (d.due && d.due < d.date) errs.push(d.type === "QT" ? T("วันยืนราคาต้องไม่ก่อนวันที่เอกสาร", "Valid-until date can't be before the document date") : T("วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร", "Due date can't be before the document date"));
    if (tidErr) errs.push(tidErr);
    setErrors(errs);
    if (errs.length) return;
    let newCustomer: Customer | null = null;
    let doc: Doc = { ...d, no: d.no.trim(), lines };
    if (!d.customerId) {
      const existing = store.customers.find((c) => c.name.trim() === d.customer.name.trim());
      if (existing) doc = { ...doc, customerId: existing.id };
      else {
        newCustomer = { id: uid(), ...d.customer, name: d.customer.name.trim() };
        doc = { ...doc, customerId: newCustomer.id };
      }
    }
    setSaving(true);
    try {
      await onSave(doc, newCustomer);
    } catch (x) {
      setErrors([errorText(x)]);
      setSaving(false);
    }
  }

  const itemsList = `${fid}-items`;
  return (
    <div className="editor">
      <form className="panel editor-form" onSubmit={save} noValidate>
        <div className="panel-row">
          <h2 className="panel-title">{isNew ? T(`สร้าง${TYPE_LABEL[d.type][0]}`, `New ${TYPE_LABEL[d.type][1].toLowerCase()}`) : T(`แก้ไข ${d.no}`, `Edit ${d.no}`)}</h2>
          <button type="button" className="text-link" onClick={onCancel}>{T("ยกเลิก", "Cancel")}</button>
        </div>

        <fieldset className="ed-group">
          <legend>{T("เอกสาร", "Document")}</legend>
          <div className="ed-grid-3">
            <div className="field">
              <label htmlFor={`${fid}-no`}>{T("เลขที่", "Number")}</label>
              {online ? (
                <>
                  <input id={`${fid}-no`} value={isNew ? T("ออกให้เมื่อบันทึก", "Assigned on save") : d.no} readOnly aria-describedby={`${fid}-noh`} />
                  <p className="field-hint-muted" id={`${fid}-noh`}>{T("เซิร์ฟเวอร์ออกเลขให้ ไม่ซ้ำ ไม่ข้าม", "Issued by the server — no gaps, no duplicates")}</p>
                </>
              ) : (
                <input id={`${fid}-no`} value={d.no} onChange={(e) => set({ no: e.target.value })} />
              )}
            </div>
            <div className="field"><label htmlFor={`${fid}-dt`}>{T("วันที่", "Date")}</label><input id={`${fid}-dt`} type="date" value={d.date} onChange={(e) => set({ date: e.target.value || today })} /></div>
            <div className="field">
              <label htmlFor={`${fid}-due`}>{d.type === "QT" ? T("ยืนราคาถึง", "Valid until") : T("ครบกำหนดชำระ", "Due date")}</label>
              <input id={`${fid}-due`} type="date" value={d.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} />
            </div>
          </div>
        </fieldset>

        <fieldset className="ed-group">
          <legend>{T("ลูกค้า", "Customer")}</legend>
          <div className="field">
            <label htmlFor={`${fid}-c`}>{T("เลือกลูกค้าเดิม", "Existing customer")}</label>
            <select id={`${fid}-c`} value={d.customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">{T("— ลูกค้าใหม่ (บันทึกให้อัตโนมัติ) —", "— New customer (saved automatically) —")}</option>
              {store.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ed-grid-2">
            <div className="field"><label htmlFor={`${fid}-cn`}>{T("ชื่อลูกค้า / บริษัท", "Name / company")}</label><input id={`${fid}-cn`} value={d.customer.name} onChange={(e) => set({ customer: { ...d.customer, name: e.target.value } })} /></div>
            <div className="field">
              <label htmlFor={`${fid}-ct`}>{T("เลขผู้เสียภาษี (ถ้ามี)", "Tax ID (optional)")}</label>
              <input id={`${fid}-ct`} inputMode="numeric" value={d.customer.taxId} onChange={(e) => set({ customer: { ...d.customer, taxId: e.target.value } })} aria-invalid={Boolean(tidErr) || undefined} aria-describedby={`${fid}-cte`} />
              <p className="field-error" id={`${fid}-cte`}>{tidErr ?? ""}</p>
            </div>
            <div className="field"><label htmlFor={`${fid}-cb`}>{T("สาขา", "Branch")}</label><input id={`${fid}-cb`} value={d.customer.branch} onChange={(e) => set({ customer: { ...d.customer, branch: e.target.value } })} placeholder={T("สำนักงานใหญ่", "Head office")} /></div>
            <div className="field"><label htmlFor={`${fid}-cp`}>{T("โทร", "Phone")}</label><input id={`${fid}-cp`} type="tel" value={d.customer.phone} onChange={(e) => set({ customer: { ...d.customer, phone: e.target.value } })} /></div>
          </div>
          <div className="field"><label htmlFor={`${fid}-ca`}>{T("ที่อยู่", "Address")}</label><textarea id={`${fid}-ca`} rows={2} value={d.customer.address} onChange={(e) => set({ customer: { ...d.customer, address: e.target.value } })} /></div>
          {d.customerId && <p className="hint">{T("แก้ข้อมูลตรงนี้มีผลกับเอกสารนี้เท่านั้น (ข้อมูลลูกค้าหลักแก้ที่แท็บ “ลูกค้า”)", "Changes here affect this document only.")}</p>}
        </fieldset>

        <fieldset className="ed-group">
          <legend>{T("รายการ", "Line items")}</legend>
          <datalist id={itemsList}>{store.items.map((it) => <option key={it.id} value={it.name} />)}</datalist>
          <ol className="ed-lines">
            {d.lines.map((l, i) => (
              <li key={l.id} className="ed-line">
                <div className="field ed-desc">
                  <label htmlFor={`${fid}-ld-${l.id}`}>{T(`รายการที่ ${i + 1}`, `Item ${i + 1}`)}</label>
                  <input
                    id={`${fid}-ld-${l.id}`}
                    ref={i === d.lines.length - 1 ? lastLine : undefined}
                    list={itemsList}
                    value={l.description}
                    onChange={(e) => {
                      const it = store.items.find((x) => x.name === e.target.value);
                      setLine(i, it && !l.price ? { description: it.name, unit: it.unit, price: it.price } : { description: e.target.value });
                    }}
                  />
                </div>
                <div className="field"><label htmlFor={`${fid}-lq-${l.id}`}>{T("จำนวน", "Qty")}</label><input id={`${fid}-lq-${l.id}`} type="number" inputMode="decimal" min={0} step="any" value={l.qty || ""} onChange={(e) => setLine(i, { qty: num(e.target.value) })} /></div>
                <div className="field"><label htmlFor={`${fid}-lu-${l.id}`}>{T("หน่วย", "Unit")}</label><input id={`${fid}-lu-${l.id}`} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></div>
                <div className="field"><label htmlFor={`${fid}-lp-${l.id}`}>{T("ราคา/หน่วย", "Unit price")}</label><input id={`${fid}-lp-${l.id}`} type="number" inputMode="decimal" min={0} step="any" value={l.price || ""} onChange={(e) => setLine(i, { price: num(e.target.value) })} /></div>
                <p className="ed-amt"><span className="sr-only">{T("จำนวนเงิน", "Amount")} </span>{money(Math.round(l.qty * l.price * 100) / 100)}</p>
                <button type="button" className="icon-btn icon-btn--sm" aria-label={T(`ลบรายการที่ ${i + 1}`, `Remove item ${i + 1}`)} onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>✕</button>
              </li>
            ))}
          </ol>
          <div className="side-actions" style={{ marginTop: "0.5rem" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { addLine(); setFocusLast(true); }}>+ {T("เพิ่มรายการ", "Add line")}</button>
            {store.items.length > 0 && (
              <select aria-label={T("เพิ่มจากรายการสินค้า/บริการ", "Add from catalog")} value="" onChange={(e) => { const it = store.items.find((x) => x.id === e.target.value); if (it) addLine(it); }} className="ed-catalog">
                <option value="">{T("+ เลือกจากสินค้า/บริการ…", "+ From catalog…")}</option>
                {store.items.map((it) => <option key={it.id} value={it.id}>{it.name} — {money(it.price)}</option>)}
              </select>
            )}
          </div>
        </fieldset>

        <fieldset className="ed-group">
          <legend>{T("ภาษีและส่วนลด", "Tax & discount")}</legend>
          <div className="seg seg--wide" role="group" aria-label={T("ภาษีมูลค่าเพิ่ม", "VAT")}>
            {([["none", "ไม่มี VAT", "No VAT"], ["exclusive", "บวก VAT 7%", "+7% VAT"], ["inclusive", "ราคารวม VAT แล้ว", "VAT included"]] as const).map(([k, th, en]) => (
              <button key={k} type="button" aria-pressed={d.vatMode === k} onClick={() => set({ vatMode: k })}>{T(th, en)}</button>
            ))}
          </div>
          <div className="ed-grid-2" style={{ marginTop: "0.75rem" }}>
            <div className="field"><label htmlFor={`${fid}-ds`}>{T("ส่วนลด (บาท)", "Discount (baht)")}</label><input id={`${fid}-ds`} type="number" inputMode="decimal" min={0} step="any" value={d.discount || ""} onChange={(e) => set({ discount: num(e.target.value) })} /></div>
            <div className="field">
              <label htmlFor={`${fid}-wt`}>{T("ลูกค้าหัก ณ ที่จ่าย", "Withholding tax")}</label>
              <select id={`${fid}-wt`} value={d.whtRate} onChange={(e) => set({ whtRate: Number(e.target.value) })} aria-describedby={`${fid}-wth`}>
                {WHT_RATES.map((r) => <option key={r} value={r}>{r === 0 ? T("ไม่หัก", "None") : `${r}%`}</option>)}
              </select>
              <p className="field-hint-muted" id={`${fid}-wth`}>{T("ค่าบริการที่นิติบุคคลจ่าย มักหัก 3% · ค่าโฆษณา 2% · ค่าขนส่ง 1% · ค่าเช่า 5%", "Services to companies: usually 3% · ads 2% · transport 1% · rent 5%")}</p>
            </div>
          </div>
          {d.vatMode !== "none" && !store.biz.vatRegistered && <p className="alert">{T("กิจการยังไม่ได้ตั้งค่าว่าจด VAT — ถ้ายังไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม ห้ามเรียกเก็บ VAT", "Your business isn't marked VAT-registered — don't charge VAT unless you are.")}</p>}
          <div className="field"><label htmlFor={`${fid}-nt`}>{T("หมายเหตุ / เงื่อนไข", "Notes / terms")}</label><textarea id={`${fid}-nt`} rows={2} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder={T("เช่น มัดจำ 50% ก่อนเริ่มงาน, โอนเข้าบัญชี …", "e.g. 50% deposit before work starts")} /></div>
        </fieldset>

        <div className="ed-sum" aria-live="polite">
          <span>{T("รวมทั้งสิ้น", "Total")} <b>{money(t.total)}</b></span>
          {t.wht > 0 && <span>{T("สุทธิหลังหัก ณ ที่จ่าย", "Net after WHT")} <b>{money(t.net)}</b></span>}
        </div>
        {errors.length > 0 && <div className="alert" role="alert"><ul>{errors.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        <div className="side-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? T("กำลังบันทึก…", "Saving…") : T("บันทึกเอกสาร", "Save document")}</button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>{T("ยกเลิก", "Cancel")}</button>
        </div>
      </form>
      <aside className="editor-preview" tabIndex={0} aria-label={T("ตัวอย่างเอกสาร", "Preview")}>
        <p className="mini-title">{T("ตัวอย่าง (อัปเดตทันที)", "Live preview")}</p>
        <div className="paper-wrap paper-wrap--scaled"><DocPaper doc={d} biz={store.biz} today={today} docs={store.docs} /></div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ CUSTOMERS */
function CustomersView({ store, actions, act, role, T, money, newDoc }: Ctx) {
  const fid = useId();
  const [busy, setBusy] = useState(false);
  const canWrite = role !== "viewer";
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    const done = await act(fn, ok);
    setBusy(false);
    if (done) setEdit(null);
  }
  const [edit, setEdit] = useState<Customer | null>(null);
  const [stmt, setStmt] = useState<Customer | null>(null);
  const [q, setQ] = useState("");
  const err = edit ? taxIdError(edit.taxId) : null;
  const list = store.customers.filter((c) => `${c.name} ${c.taxId} ${c.phone}`.toLowerCase().includes(q.trim().toLowerCase()));
  const outstanding = (id: string) => store.docs.filter((d) => d.type === "INV" && !d.voided && d.customerId === id).reduce((t, d) => t + Math.max(0, balance(d)), 0);
  const used = (id: string) => store.docs.some((d) => d.customerId === id);
  return (
    <section className="panel">
      <div className="panel-row">
        <h2 className="panel-title">{T("ลูกค้า", "Customers")} <span className="muted-count">({store.customers.length})</span></h2>
        {canWrite && <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ id: uid(), name: "", taxId: "", branch: "สำนักงานใหญ่", address: "", phone: "", email: "" })}>+ {T("เพิ่มลูกค้า", "Add customer")}</button>}
      </div>
      <div className="field field--inline bl-search"><label htmlFor={`${fid}-q`}>{T("ค้นหา", "Search")}</label><input id={`${fid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.length === 0 ? <p className="hint">{T("ยังไม่มีลูกค้า — ลูกค้าจะถูกบันทึกอัตโนมัติเมื่อออกเอกสารให้ลูกค้าใหม่", "No customers yet — they're saved automatically when you issue a document.")}</p> : (
        <ul className="cust-grid">
          {list.map((c) => {
            const out = outstanding(c.id);
            return (
              <li key={c.id} className="cust-card">
                <h3>{c.name}</h3>
                <p className="muted">{c.taxId ? `${T("เลขภาษี", "Tax ID")} ${c.taxId}` : T("บุคคลทั่วไป / ไม่มีเลขภาษี", "No tax ID")}{c.phone && ` · ${c.phone}`}</p>
                <p className={out > 0 ? "cust-due" : "muted"}>{out > 0 ? T(`ค้างชำระ ${money(out)} บาท`, `Owes ${money(out)}`) : T("ไม่มียอดค้าง", "Nothing owed")}</p>
                <div className="row-actions">
                  <button type="button" className="text-link" onClick={() => setEdit(structuredClone(c))}>{T("แก้ไข", "Edit")}<span className="sr-only"> {c.name}</span></button>
                  <button type="button" className="text-link" onClick={() => setStmt(c)}>{T("รายการเคลื่อนไหว", "Statement")}<span className="sr-only"> {c.name}</span></button>
                  <button type="button" className="text-link" onClick={() => newDoc("QT", c)}>{T("เสนอราคา", "Quote")}<span className="sr-only"> {c.name}</span></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit && store.customers.some((c) => c.id === edit.id) ? T("แก้ไขลูกค้า", "Edit customer") : T("เพิ่มลูกค้า", "Add customer")}>
        {edit && (
          <form className="stack-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (!edit.name.trim() || err || busy) return;
            const c = { ...edit, name: edit.name.trim() };
            void run(() => actions.saveCustomer(c, !store.customers.some((x) => x.id === c.id)), T("บันทึกลูกค้าแล้ว", "Customer saved"));
          }}>
            <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อ / บริษัท", "Name / company")}</label><input id={`${fid}-n`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-invalid={!edit.name.trim() || undefined} autoFocus /></div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`${fid}-t`}>{T("เลขผู้เสียภาษี", "Tax ID")}</label>
                <input id={`${fid}-t`} inputMode="numeric" value={edit.taxId} onChange={(e) => setEdit({ ...edit, taxId: e.target.value })} aria-invalid={Boolean(err) || undefined} aria-describedby={`${fid}-te`} />
                <p className="field-error" id={`${fid}-te`}>{err ?? ""}</p>
              </div>
              <div className="field"><label htmlFor={`${fid}-b`}>{T("สาขา", "Branch")}</label><input id={`${fid}-b`} value={edit.branch} onChange={(e) => setEdit({ ...edit, branch: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-p`}>{T("โทร", "Phone")}</label><input id={`${fid}-p`} type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${fid}-e`}>{T("อีเมล", "Email")}</label><input id={`${fid}-e`} type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            </div>
            <div className="field"><label htmlFor={`${fid}-a`}>{T("ที่อยู่ (สำหรับออกเอกสาร)", "Billing address")}</label><textarea id={`${fid}-a`} rows={3} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div className="side-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!canWrite || busy || !edit.name.trim() || Boolean(err)}>{busy ? T("กำลังบันทึก…", "Saving…") : T("บันทึก", "Save")}</button>
              {canWrite && store.customers.some((c) => c.id === edit.id) && (used(edit.id)
                ? <span className="hint">{T("ลบไม่ได้เพราะมีเอกสารของลูกค้านี้", "Can't delete — has documents")}</span>
                : <ConfirmButton label={T("ลบลูกค้า", "Delete")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again")} onConfirm={() => void run(() => actions.deleteCustomer(edit.id), T("ลบลูกค้าแล้ว", "Customer deleted"))} />)}
            </div>
          </form>
        )}
      </Modal>

      <Modal open={stmt !== null} onClose={() => setStmt(null)} title={stmt ? `${T("รายการเคลื่อนไหว", "Statement")} — ${stmt.name}` : ""} wide>
        {stmt && (() => {
          const rows = statement(store.docs, stmt.id);
          return rows.length === 0 ? <p className="hint">{T("ยังไม่มีใบแจ้งหนี้", "No invoices yet")}</p> : (
            <div className="table-wrap" tabIndex={0} role="region" aria-label={T("รายการเคลื่อนไหว", "Statement")}>
              <table className="docs">
                <thead><tr><th scope="col">{T("วันที่", "Date")}</th><th scope="col">{T("เอกสาร", "Ref")}</th><th scope="col">{T("รายการ", "Entry")}</th><th scope="col">{T("ยอดหนี้", "Charge")}</th><th scope="col">{T("รับชำระ", "Paid")}</th><th scope="col">{T("คงค้าง", "Balance")}</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}><td>{fmtDate(r.date)}</td><td>{r.ref}</td><td>{r.label === "รับชำระ" ? T("รับชำระ", "Payment") : T("ใบแจ้งหนี้", "Invoice")}</td><td className="num">{r.debit ? money(r.debit) : ""}</td><td className="num">{r.credit ? money(r.credit) : ""}</td><td className="num">{money(r.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ ITEMS */
function ItemsView({ store, actions, act, role, T, money }: Ctx) {
  const fid = useId();
  const [draft, setDraft] = useState({ name: "", unit: "", price: "" });
  const [busy, setBusy] = useState(false);
  const canWrite = role !== "viewer";
  return (
    <section className="panel">
      <h2 className="panel-title">{T("สินค้า / บริการ", "Products & services")} <span className="muted-count">({store.items.length})</span></h2>
      <p className="hint">{T("รายการที่ใช้บ่อย — ตอนออกเอกสารเลือกจากรายการนี้ได้ ราคาและหน่วยจะเติมให้เอง", "Frequently used items — pick them in the editor to fill unit and price.")}</p>
      {canWrite && (
        <form className="item-add" onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.name.trim() || busy) return;
          setBusy(true);
          const ok = await act(() => actions.addItem({ name: draft.name.trim(), unit: draft.unit.trim(), price: Math.max(0, num(draft.price)) }));
          setBusy(false);
          if (ok) setDraft({ name: "", unit: "", price: "" });
        }}>
          <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อสินค้า/บริการ", "Name")}</label><input id={`${fid}-n`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${fid}-u`}>{T("หน่วย", "Unit")}</label><input id={`${fid}-u`} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder={T("ชิ้น / งาน / ชั่วโมง", "pc / job / hr")} /></div>
          <div className="field"><label htmlFor={`${fid}-p`}>{T("ราคา", "Price")}</label><input id={`${fid}-p`} type="number" inputMode="decimal" min={0} step="any" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.name.trim() || busy}>{T("เพิ่ม", "Add")}</button>
        </form>
      )}
      {store.items.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางสินค้า/บริการ", "Items table")}>
          <table className="docs items-table">
            <thead><tr><th scope="col">{T("ชื่อ", "Name")}</th><th scope="col">{T("หน่วย", "Unit")}</th><th scope="col">{T("ราคา", "Price")}</th><th scope="col"><span className="sr-only">{T("ลบ", "Delete")}</span></th></tr></thead>
            <tbody>
              {store.items.map((it) => <ItemRow key={it.id} item={it} ctx={{ actions, act, T, money, canWrite }} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** แถวสินค้า: แก้ในช่องได้เลย บันทึกเมื่อออกจากช่อง (โหมดออนไลน์จึงไม่ยิง API ทุกตัวอักษร) */
function ItemRow({ item, ctx }: { item: CatalogItem; ctx: Pick<Ctx, "actions" | "act" | "T" | "money"> & { canWrite: boolean } }) {
  const { actions, act, T, money, canWrite } = ctx;
  const [v, setV] = useState({ name: item.name, unit: item.unit, price: String(item.price) });
  useEffect(() => setV({ name: item.name, unit: item.unit, price: String(item.price) }), [item.name, item.unit, item.price]);
  function commit() {
    const p: Partial<CatalogItem> = {};
    if (v.name.trim() && v.name.trim() !== item.name) p.name = v.name.trim();
    if (v.unit.trim() !== item.unit) p.unit = v.unit.trim();
    const price = Math.max(0, num(v.price));
    if (Number.isFinite(price) && price !== item.price) p.price = price;
    if (!v.name.trim()) setV((x) => ({ ...x, name: item.name }));
    if (Object.keys(p).length) void act(() => actions.updateItem(item.id, p));
  }
  return (
    <tr>
      <td><input aria-label={T("ชื่อ", "Name")} value={v.name} readOnly={!canWrite} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={commit} /></td>
      <td><input aria-label={`${T("หน่วยของ", "Unit of")} ${item.name}`} value={v.unit} readOnly={!canWrite} onChange={(e) => setV({ ...v, unit: e.target.value })} onBlur={commit} /></td>
      <td><input aria-label={`${T("ราคาของ", "Price of")} ${item.name}`} type="number" inputMode="decimal" min={0} step="any" value={v.price} readOnly={!canWrite} onChange={(e) => setV({ ...v, price: e.target.value })} onBlur={commit} /><span className="sr-only">{money(item.price)}</span></td>
      <td>{canWrite && <button type="button" className="icon-btn icon-btn--sm" aria-label={`${T("ลบ", "Delete")} ${item.name}`} onClick={() => void act(() => actions.deleteItem(item.id))}>✕</button>}</td>
    </tr>
  );
}

/* ------------------------------------------------------------------ SETTINGS */
const PREFIX = (v: string, fallback: string) => v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10) || fallback;

function SettingsView({ store, actions, act, online, role, local, cloud, T, show, today }: Ctx) {
  const fid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  // ฉบับร่างในฟอร์ม — บันทึกเมื่อออกจากช่อง (ออนไลน์: PATCH เฉพาะช่องที่เปลี่ยน)
  const [bz, setBz] = useState<Business>(store.biz);
  const [importing, setImporting] = useState(false);
  const canEdit = role === "owner";
  const set = (p: Partial<Business>) => setBz((x) => ({ ...x, ...p }));
  const tErr = taxIdError(bz.taxId);
  const ppOf = (b: Business) => sanitizeId(b.promptpay);
  const ppBad = (b: Business) => Boolean(ppOf(b)) && !detectKind(ppOf(b));
  const ppErr = ppBad(bz) ? T("ใส่เบอร์มือถือ 10 หลัก หรือเลข 13 หลัก", "Use a 10-digit mobile or 13-digit ID") : "";

  function flush(next: Business = bz) {
    if (!canEdit) return;
    const patch: Partial<Business> = {};
    for (const k of Object.keys(next) as (keyof Business)[]) {
      if (JSON.stringify(next[k]) !== JSON.stringify(store.biz[k])) (patch as Record<string, unknown>)[k] = next[k];
    }
    if (taxIdError(next.taxId)) delete patch.taxId;
    if (ppBad(next)) delete patch.promptpay;
    if (!next.name.trim()) delete patch.name;
    if (Object.keys(patch).length) void act(() => actions.updateBiz(patch), online ? T("บันทึกแล้ว", "Saved") : undefined);
  }
  const blur = { onBlur: () => flush() };

  async function importLocal() {
    setImporting(true);
    try {
      const r = await cloud.importLocal(local);
      show(T(`นำขึ้นแล้ว: เอกสาร ${r.docs} ใบ ลูกค้า ${r.customers} ราย สินค้า ${r.items} รายการ`, `Imported ${r.docs} documents, ${r.customers} customers, ${r.items} items`));
    } catch (e) {
      show(errorText(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="report-grid">
      <section className="panel">
        <h2 className="panel-title">{T("ข้อมูลกิจการ (หัวเอกสาร)", "Business details (letterhead)")}</h2>
        {!canEdit && <p className="hint">{T("เฉพาะเจ้าของร้านแก้ข้อมูลส่วนนี้ได้", "Only the owner can change these.")}</p>}
        <fieldset className="stack-form plain-fieldset" disabled={!canEdit}>
          <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อกิจการ / บริษัท", "Business name")}</label><input id={`${fid}-n`} value={bz.name} onChange={(e) => set({ name: e.target.value })} {...blur} /></div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${fid}-t`}>{T("เลขประจำตัวผู้เสียภาษี", "Tax ID")}</label>
              <input id={`${fid}-t`} inputMode="numeric" value={bz.taxId} onChange={(e) => set({ taxId: e.target.value })} {...blur} aria-invalid={Boolean(tErr) || undefined} aria-describedby={`${fid}-te`} />
              <p className="field-error" id={`${fid}-te`}>{tErr ?? ""}</p>
            </div>
            <div className="field"><label htmlFor={`${fid}-b`}>{T("สาขา", "Branch")}</label><input id={`${fid}-b`} value={bz.branch} onChange={(e) => set({ branch: e.target.value })} {...blur} /></div>
            <div className="field"><label htmlFor={`${fid}-p`}>{T("โทร", "Phone")}</label><input id={`${fid}-p`} type="tel" value={bz.phone} onChange={(e) => set({ phone: e.target.value })} {...blur} /></div>
            <div className="field"><label htmlFor={`${fid}-e`}>{T("อีเมล", "Email")}</label><input id={`${fid}-e`} type="email" value={bz.email} onChange={(e) => set({ email: e.target.value })} {...blur} /></div>
          </div>
          <div className="field"><label htmlFor={`${fid}-a`}>{T("ที่อยู่", "Address")}</label><textarea id={`${fid}-a`} rows={2} value={bz.address} onChange={(e) => set({ address: e.target.value })} {...blur} /></div>
          <div className="field"><label htmlFor={`${fid}-s`}>{T("ชื่อผู้ลงนาม", "Signatory")}</label><input id={`${fid}-s`} value={bz.signer} onChange={(e) => set({ signer: e.target.value })} {...blur} /></div>
          <div className="field">
            <label htmlFor={`${fid}-pp`}>{T("พร้อมเพย์รับเงิน (QR จะขึ้นบนใบแจ้งหนี้ที่ยังค้าง)", "PromptPay (QR on unpaid invoices)")}</label>
            <input id={`${fid}-pp`} inputMode="numeric" value={bz.promptpay} onChange={(e) => set({ promptpay: e.target.value })} {...blur} aria-invalid={Boolean(ppErr) || undefined} aria-describedby={`${fid}-ppe`} />
            <p className="field-error" id={`${fid}-ppe`}>{ppErr}</p>
          </div>
        </fieldset>
      </section>
      <section className="panel">
        <h2 className="panel-title">{T("การออกเอกสาร", "Document settings")}</h2>
        <fieldset className="stack-form plain-fieldset" disabled={!canEdit}>
          <label className="check-row"><input type="checkbox" checked={bz.vatRegistered} onChange={(e) => { const n = { ...bz, vatRegistered: e.target.checked }; setBz(n); flush(n); }} />{T("จดทะเบียนภาษีมูลค่าเพิ่ม (VAT) แล้ว", "VAT-registered")}</label>
          <p className="hint">{T("ถ้าจด VAT เอกสารใหม่จะตั้งเป็น “บวก VAT 7%” และใบเสร็จจะเป็น “ใบเสร็จรับเงิน/ใบกำกับภาษี”", "New documents default to +7% VAT and receipts become tax invoices.")}</p>
          <div className="grid-2">
            <div className="field"><label htmlFor={`${fid}-dd`}>{T("เครดิต (วัน)", "Payment terms (days)")}</label><input id={`${fid}-dd`} type="number" min={0} max={365} value={bz.dueDays} onChange={(e) => set({ dueDays: Math.min(365, Math.max(0, Math.round(num(e.target.value)))) })} {...blur} /></div>
            <div className="field"><label htmlFor={`${fid}-vd`}>{T("ยืนราคา (วัน)", "Quote valid (days)")}</label><input id={`${fid}-vd`} type="number" min={0} max={365} value={bz.validDays} onChange={(e) => set({ validDays: Math.min(365, Math.max(0, Math.round(num(e.target.value)))) })} {...blur} /></div>
          </div>
          <fieldset className="ed-group">
            <legend>{T("ตัวนำหน้าเลขที่เอกสาร", "Number prefixes")}</legend>
            <div className="ed-grid-3">
              {(["QT", "INV", "RC"] as const).map((k) => (
                <div className="field" key={k}><label htmlFor={`${fid}-px-${k}`}>{T(...TYPE_LABEL[k])}</label><input id={`${fid}-px-${k}`} value={bz.prefixes[k]} maxLength={10} onChange={(e) => set({ prefixes: { ...bz.prefixes, [k]: PREFIX(e.target.value, k) } })} {...blur} /></div>
              ))}
            </div>
            <p className="hint">{T(`รูปแบบ: ${bz.prefixes.INV}-${today.slice(0, 7).replace("-", "")}-001 (เริ่มนับใหม่ทุกเดือน)`, `Format: ${bz.prefixes.INV}-${today.slice(0, 7).replace("-", "")}-001 (resets monthly)`)}</p>
          </fieldset>
        </fieldset>
        <p className="mini-title">{T(`ข้อมูล (${store.docs.length} เอกสาร, ${store.customers.length} ลูกค้า)`, `Data (${store.docs.length} documents, ${store.customers.length} customers)`)}</p>
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => download(`billing-backup-${today}.json`, JSON.stringify(store), "application/json")}>{T("สำรองข้อมูล", "Back up")}</button>
          {online ? (
            canEdit && store.docs.length === 0 && (local.docs.length > 0 || local.customers.length > 0) && (
              <button type="button" className="btn btn-primary btn-sm" disabled={importing} onClick={() => void importLocal()}>
                {importing ? T("กำลังนำขึ้น…", "Importing…") : T(`นำข้อมูลในเครื่องขึ้นร้านนี้ (${local.docs.length} เอกสาร)`, `Import this device's data (${local.docs.length} documents)`)}
              </button>
            )
          ) : (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("กู้คืนจากไฟล์", "Restore")}</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const d = JSON.parse(await readFile(f)) as Store;
                  if (!Array.isArray(d.docs) || !Array.isArray(d.customers) || typeof d.biz !== "object") throw new Error();
                  const next = { ...empty(), ...d, biz: { ...defaultBiz, ...d.biz } };
                  await actions.replaceAll?.(next);
                  setBz(next.biz);
                  show(T("กู้คืนข้อมูลแล้ว", "Restored"));
                } catch {
                  show(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบเอกสาร", "Not a billing backup file"));
                }
              }} />
              <ConfirmButton label={T("ล้างข้อมูลทั้งหมด", "Delete all data")} confirmLabel={T("กดอีกครั้งเพื่อลบทุกอย่าง", "Tap again to delete everything")} onConfirm={() => { void actions.replaceAll?.(empty()); setBz(defaultBiz); }} />
            </>
          )}
        </div>
        {online && store.docs.length > 0 && local.docs.length > 0 && <p className="hint">{T("นำข้อมูลในเครื่องขึ้นได้เฉพาะร้านที่ยังไม่มีเอกสาร (กันข้อมูลซ้ำ) — สมัครอีกบัญชีหรือสร้างร้านใหม่ถ้าต้องการ", "Local data can only be imported into an empty business (to avoid duplicates).")}</p>}
        <p className="privacy">
          {online
            ? T("ข้อมูลเก็บบนเซิร์ฟเวอร์ของโปรเจกต์สาธิต (PostgreSQL) เข้าถึงได้เฉพาะสมาชิกของร้าน — เป็นงานพอร์ตโฟลิโอ ไม่รับประกันการเก็บรักษาข้อมูล ควรสำรองไฟล์ไว้ · ระบบนี้ช่วยออกเอกสาร ไม่ใช่คำแนะนำทางภาษี", "Data is stored on a demo server (PostgreSQL), visible only to members of this business — it's a portfolio project, keep your own backups · this tool prepares documents; it isn't tax advice.")
            : T("ข้อมูลลูกค้าและเอกสารเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ถูกส่งไปที่ใด — สำรองไฟล์เป็นประจำ · ระบบนี้ช่วยออกเอกสาร ไม่ใช่คำแนะนำทางภาษี ควรตรวจกับนักบัญชี", "Data stays in this browser. Back up regularly. This tool prepares documents; it isn't tax advice — check with your accountant.")}
        </p>
      </section>
    </div>
  );
}
