"use client";

import {
  addDays,
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
  type VatMode,
} from "@portfolio/tools/billing";
import { detectKind, sanitizeId } from "@portfolio/tools/promptpay";
import { bahtText } from "@portfolio/tools/thai-text";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { baht, ConfirmButton, download, num, readFile, todayIso, uid, useStoredState, useToast } from "./common";
import { PromptPayQr } from "./PromptPayQr";
import { Modal, PrintSheet, printNow, Tabs, useHashView } from "./ui";

type Store = { docs: Doc[]; customers: Customer[]; items: CatalogItem[]; biz: Business };
type View = "dashboard" | "docs" | "customers" | "items" | "settings";
const VIEWS = ["dashboard", "docs", "customers", "items", "settings"] as const;
type TFn = (th: string, en: string) => string;
type SetStore = (f: (s: Store) => Store) => void;

const defaultBiz: Business = {
  name: "ธุรกิจของฉัน",
  taxId: "",
  branch: "สำนักงานใหญ่",
  address: "",
  phone: "",
  email: "",
  promptpay: "",
  vatRegistered: false,
  signer: "",
  dueDays: 30,
  validDays: 15,
  prefixes: { QT: "QT", INV: "INV", RC: "RC" },
};
const empty = (): Store => ({ docs: [], customers: [], items: [], biz: defaultBiz });

const TYPE_LABEL: Record<DocType, [string, string]> = { QT: ["ใบเสนอราคา", "Quotation"], INV: ["ใบแจ้งหนี้", "Invoice"], RC: ["ใบเสร็จ", "Receipt"] };
const INV_STATUS: Record<InvoiceStatus, [string, string]> = { unpaid: ["รอชำระ", "Unpaid"], partial: ["ชำระบางส่วน", "Partly paid"], paid: ["ชำระแล้ว", "Paid"], overdue: ["เลยกำหนด", "Overdue"], void: ["ยกเลิก", "Void"] };
const QT_STATUS: Record<QuoteStatus, [string, string]> = { draft: ["ร่าง", "Draft"], sent: ["ส่งแล้ว", "Sent"], accepted: ["ลูกค้าตกลง", "Accepted"], rejected: ["ไม่ผ่าน", "Declined"] };
const METHOD: Record<Payment["method"], [string, string]> = { transfer: ["โอนเงิน", "Bank transfer"], promptpay: ["พร้อมเพย์", "PromptPay"], cash: ["เงินสด", "Cash"], cheque: ["เช็ค", "Cheque"] };

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

/* ------------------------------------------------------------------ SAMPLE */
function sample(today: string): Store {
  const biz: Business = {
    ...defaultBiz,
    name: "OTTO Studio",
    taxId: "0105566012344",
    address: "99/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    phone: "043-000-000",
    email: "hello@otto.studio",
    vatRegistered: true,
    signer: "ออตโต้",
  };
  const c = (name: string, taxId: string, address: string, phone = "", branch = "สำนักงานใหญ่"): Customer => ({ id: uid(), name, taxId, branch, address, phone, email: "" });
  const customers = [
    c("บริษัท ขอนแก่นเบเกอรี่ จำกัด", "0405561000019", "12 ถ.ศรีจันทร์ อ.เมือง จ.ขอนแก่น", "081-111-2222"),
    c("ร้านกาแฟบ้านสวน", "", "45 หมู่ 3 ต.ศิลา อ.เมือง จ.ขอนแก่น", "089-222-3333", ""),
    c("ห้างหุ้นส่วนจำกัด สยามก่อสร้าง", "0403550000029", "8/1 ถ.กลางเมือง จ.ขอนแก่น", "043-222-111"),
    c("คลินิกทันตกรรมยิ้มสวย", "", "77 ถ.หน้าเมือง จ.ขอนแก่น", "082-333-4444", ""),
    c("บริษัท อีสานโลจิสติกส์ จำกัด", "0405563000032", "200 ถ.มิตรภาพ จ.ขอนแก่น", "043-555-666", "สาขา 00001"),
  ];
  const it = (name: string, unit: string, price: number): CatalogItem => ({ id: uid(), name, unit, price });
  const items = [
    it("ออกแบบเว็บไซต์ (5 หน้า)", "งาน", 25000),
    it("พัฒนาเว็บไซต์ + CMS", "งาน", 45000),
    it("ดูแลเว็บไซต์รายเดือน", "เดือน", 3500),
    it("ออกแบบโลโก้ + CI", "งาน", 12000),
    it("ถ่ายภาพสินค้า", "ภาพ", 350),
    it("โดเมน + โฮสติ้ง 1 ปี", "ปี", 4200),
    it("ยิงโฆษณาออนไลน์ (ค่าบริการ)", "เดือน", 6000),
    it("ชั่วโมงให้คำปรึกษา", "ชั่วโมง", 1500),
  ];
  const L = (i: number, qty = 1): Line => ({ id: uid(), description: items[i]!.name, qty, unit: items[i]!.unit, price: items[i]!.price });
  let docs: Doc[] = [];
  const add = (d: Doc) => (docs = [...docs, d]);
  const quote = (ci: number, daysAgo: number, lines: Line[], status: QuoteStatus, wht = 0) => {
    const d = { ...blankDoc("QT", docs, biz, customers[ci]!, addDays(today, -daysAgo), uid()), lines, quoteStatus: status, whtRate: wht };
    add(d);
    return d;
  };
  const invoiceFrom = (q: Doc, daysAgo: number) => {
    const d = quoteToInvoice(q, docs, biz, addDays(today, -daysAgo), uid(), uid);
    add(d);
    return d;
  };
  const pay = (inv: Doc, daysAgo: number, amount: number | "all", method: Payment["method"] = "transfer") => {
    const cur = docs.find((x) => x.id === inv.id)!;
    const amt = amount === "all" ? balance(cur) : amount;
    docs = receivePayment(docs, inv.id, { date: addDays(today, -daysAgo), amount: amt, method, note: "" }, biz, { payment: uid(), receipt: uid(), line: uid }).docs;
  };
  // ย้อนหลังราว 5 เดือน
  const q1 = quote(0, 150, [L(0), L(1), L(5)], "accepted", 3);
  const i1 = invoiceFrom(q1, 140);
  pay(i1, 120, "all");
  const q2 = quote(2, 120, [L(3), L(4, 20)], "accepted", 3);
  const i2 = invoiceFrom(q2, 110);
  pay(i2, 100, 10000);
  pay(i2, 70, "all");
  quote(3, 100, [L(0), L(5)], "rejected");
  const q4 = quote(1, 80, [L(3), L(4, 12)], "accepted");
  const i4 = invoiceFrom(q4, 75);
  pay(i4, 60, "all", "promptpay");
  for (const m of [95, 65, 35, 5]) {
    const inv = { ...blankDoc("INV", docs, biz, customers[0]!, addDays(today, -m), uid()), lines: [L(2)], whtRate: 3, note: "ค่าดูแลเว็บไซต์ประจำเดือน" };
    add(inv);
    if (m > 40) pay(inv, m - 12, "all");
  }
  const q5 = quote(4, 50, [L(1), L(6, 3)], "accepted", 3);
  const i5 = invoiceFrom(q5, 45);
  pay(i5, 20, 30000);
  const q6 = quote(3, 30, [L(7, 6)], "accepted");
  invoiceFrom(q6, 28); // ยังไม่จ่าย (ใกล้ครบกำหนด)
  const oldInv = { ...blankDoc("INV", docs, biz, customers[1]!, addDays(today, -70), uid()), lines: [L(4, 30)], vatMode: "none" as VatMode, note: "ถ่ายภาพเมนูใหม่" };
  add(oldInv); // ค้างนาน
  quote(2, 6, [L(0), L(1), L(2, 12)], "sent", 3);
  quote(4, 2, [L(6, 6), L(7, 4)], "draft", 3);
  return { docs, customers, items, biz };
}

/* ------------------------------------------------------------------ APP */
export function BillingApp() {
  const lang = useLang();
  const T: TFn = (th, en) => (lang === "th" ? th : en);
  const [store, setStore, ready] = useStoredState<Store>("tool-billing-v1", empty);
  const [view, setViewRaw] = useState<View>("dashboard");
  const setView = useHashView(VIEWS, "dashboard", setViewRaw);
  const [toast, show] = useToast();
  const [today, setToday] = useState("");
  const [editing, setEditing] = useState<Doc | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Doc | null>(null);
  useEffect(() => setToday(todayIso()), []);
  const money = (n: number) => baht(n, lang);

  if (!ready || !today) return <div className="bigapp billing" aria-busy="true" />;

  const overdue = store.docs.filter((d) => d.type === "INV" && invoiceStatus(d, today) === "overdue").length;
  const tabs = [
    { id: "dashboard" as const, label: T("ภาพรวม", "Overview") },
    { id: "docs" as const, label: T("เอกสาร", "Documents"), badge: overdue || undefined },
    { id: "customers" as const, label: T("ลูกค้า", "Customers") },
    { id: "items" as const, label: T("สินค้า/บริการ", "Items") },
    { id: "settings" as const, label: T("ข้อมูลกิจการ", "Business") },
  ];

  function newDoc(type: DocType, customer: Customer | null = null) {
    setEditing(blankDoc(type, store.docs, store.biz, customer, today, uid()));
    setOpenId(null);
  }
  function print(d: Doc) {
    setPrinting(d);
    printNow();
  }

  const ctx: Ctx = { store, setStore, T, money, show, today, open: setOpenId, newDoc, edit: (d) => { setOpenId(null); setEditing(structuredClone(d)); } };
  const current = store.docs.find((d) => d.id === openId) ?? null;

  return (
    <div className="bigapp billing">
      {toast}
      <div className="bigapp-bar">
        <p className="bigapp-name">{store.biz.name}</p>
        <Tabs tabs={tabs} value={view} onChange={(v) => { setEditing(null); setView(v); }} label={T("เมนูระบบเอกสาร", "Billing sections")} />
      </div>

      {store.docs.length === 0 && store.customers.length === 0 && !editing && view !== "settings" && (
        <div className="panel empty-state">
          <p>{T("เริ่มจากกรอกข้อมูลกิจการในแท็บ “ข้อมูลกิจการ” แล้วออกใบเสนอราคาใบแรกได้เลย — หรือลองข้อมูลตัวอย่างของสตูดิโอรับทำเว็บ (มีเอกสารย้อนหลัง 5 เดือน ลูกหนี้ค้างชำระ และใบเสร็จ)", "Fill in your business details, then create your first quotation — or load a sample web studio with 5 months of documents.")}</p>
          <div className="side-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setStore(() => sample(today)); show(T("โหลดข้อมูลตัวอย่างแล้ว", "Sample loaded")); }}>{T("ใช้ข้อมูลตัวอย่าง", "Load sample")}</button>
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
            onSave={(d, newCustomer) => {
              setStore((s) => ({
                ...s,
                customers: newCustomer ? [...s.customers, newCustomer] : s.customers,
                docs: s.docs.some((x) => x.id === d.id) ? s.docs.map((x) => (x.id === d.id ? d : x)) : [...s.docs, d],
              }));
              setEditing(null);
              setView("docs");
              setOpenId(d.id);
              show(T(`บันทึก ${d.no} แล้ว`, `Saved ${d.no}`));
            }}
          />
        ) : (
          <>
            {view === "dashboard" && <Dashboard {...ctx} />}
            {view === "docs" && <DocsView {...ctx} />}
            {view === "customers" && <CustomersView {...ctx} />}
            {view === "items" && <ItemsView {...ctx} />}
            {view === "settings" && <SettingsView {...ctx} />}
          </>
        )}
      </div>

      <Modal open={current !== null} onClose={() => setOpenId(null)} title={current ? `${T(...TYPE_LABEL[current.type])} ${current.no}` : ""} wide>
        {current && <Viewer doc={current} ctx={ctx} onPrint={print} />}
      </Modal>

      <PrintSheet>{printing && <DocPaper doc={printing} biz={store.biz} today={today} docs={store.docs} />}</PrintSheet>
    </div>
  );
}

type Ctx = {
  store: Store;
  setStore: SetStore;
  T: TFn;
  money: (n: number) => string;
  show: (m: string) => void;
  today: string;
  open: (id: string) => void;
  newDoc: (type: DocType, customer?: Customer | null) => void;
  edit: (d: Doc) => void;
};

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
  const { store, setStore, T, money, show, today, open, edit } = ctx;
  const fid = useId();
  const [paying, setPaying] = useState(false);
  const bal = doc.type === "INV" ? balance(doc) : 0;
  const [pay, setPay] = useState({ date: today, amount: String(bal), method: "transfer" as Payment["method"], note: "", receipt: true });
  const [err, setErr] = useState("");
  const children = store.docs.filter((d) => d.refId === doc.id);
  const parent = doc.refId ? store.docs.find((d) => d.id === doc.refId) : null;
  const editable = !doc.voided && doc.type !== "RC" && !(doc.type === "INV" && doc.payments.length > 0);
  const setDoc = (p: Partial<Doc>) => setStore((s) => ({ ...s, docs: s.docs.map((d) => (d.id === doc.id ? { ...d, ...p } : d)) }));

  function convert() {
    const inv = quoteToInvoice(doc, store.docs, store.biz, today, uid(), uid);
    setStore((s) => ({ ...s, docs: [...s.docs.map((d) => (d.id === doc.id ? { ...d, quoteStatus: "accepted" as const } : d)), inv] }));
    show(T(`สร้างใบแจ้งหนี้ ${inv.no} แล้ว`, `Created invoice ${inv.no}`));
    open(inv.id);
  }
  function duplicate() {
    const copy: Doc = { ...blankDoc(doc.type === "RC" ? "INV" : doc.type, store.docs, store.biz, null, today, uid()), customerId: doc.customerId, customer: doc.customer, lines: doc.lines.map((l) => ({ ...l, id: uid() })), discount: doc.discount, vatMode: doc.vatMode, whtRate: doc.whtRate, note: doc.note };
    edit(copy);
  }
  function submitPay(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = receivePayment(store.docs, doc.id, { date: pay.date, amount: num(pay.amount), method: pay.method, note: pay.note }, store.biz, { payment: uid(), receipt: pay.receipt ? uid() : null, line: uid });
      setStore((s) => ({ ...s, docs: r.docs }));
      setPaying(false);
      setErr("");
      show(r.receipt ? T(`รับชำระแล้ว · ออกใบเสร็จ ${r.receipt.no}`, `Payment recorded · receipt ${r.receipt.no}`) : T("บันทึกการรับชำระแล้ว", "Payment recorded"));
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="viewer">
      <div className="viewer-actions side-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onPrint(doc)}>{T("พิมพ์ / บันทึก PDF", "Print / save PDF")}</button>
        {editable && <button type="button" className="btn btn-outline btn-sm" onClick={() => edit(doc)}>{T("แก้ไข", "Edit")}</button>}
        {doc.type !== "RC" && <button type="button" className="btn btn-outline btn-sm" onClick={duplicate}>{T("ทำสำเนา", "Duplicate")}</button>}
        {doc.type === "QT" && !doc.voided && !children.some((c) => c.type === "INV" && !c.voided) && doc.quoteStatus !== "rejected" && (
          <button type="button" className="btn btn-outline btn-sm" onClick={convert}>{T("แปลงเป็นใบแจ้งหนี้", "Convert to invoice")}</button>
        )}
        {doc.type === "INV" && !doc.voided && bal > 0 && !paying && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPay({ date: today, amount: String(bal), method: "transfer", note: "", receipt: true }); setErr(""); setPaying(true); }}>{T("รับชำระเงิน", "Record payment")}</button>
        )}
      </div>

      {doc.type === "QT" && !doc.voided && (
        <div className="seg qt-status" role="group" aria-label={T("สถานะใบเสนอราคา", "Quote status")}>
          {(Object.keys(QT_STATUS) as QuoteStatus[]).map((k) => (
            <button key={k} type="button" aria-pressed={doc.quoteStatus === k} onClick={() => setDoc({ quoteStatus: k })}>{T(...QT_STATUS[k])}</button>
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
            <button type="submit" className="btn btn-primary btn-sm">{T("บันทึกรับชำระ", "Save payment")}</button>
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

      {!doc.voided && (
        <div className="side-actions">
          <ConfirmButton
            label={T("ยกเลิกเอกสารนี้", "Void this document")}
            confirmLabel={T("กดอีกครั้ง — เลขที่นี้จะถูกเก็บไว้แต่ไม่นับยอด", "Tap again — the number is kept but excluded")}
            onConfirm={() => { setDoc({ voided: true }); show(T(`ยกเลิก ${doc.no} แล้ว`, `${doc.no} voided`)); }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ EDITOR */
function Editor({ draft, ctx, onCancel, onSave }: { draft: Doc; ctx: Ctx; onCancel: () => void; onSave: (d: Doc, newCustomer: Customer | null) => void }) {
  const { store, T, money, today } = ctx;
  const fid = useId();
  const [d, setD] = useState<Doc>(draft);
  const [errors, setErrors] = useState<string[]>([]);
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
  function save(e: React.FormEvent) {
    e.preventDefault();
    const lines = d.lines.filter((l) => l.description.trim() || l.price);
    const errs: string[] = [];
    if (!d.customer.name.trim()) errs.push(T("ใส่ชื่อลูกค้า", "Enter the customer name"));
    if (!lines.length) errs.push(T("ใส่อย่างน้อย 1 รายการ", "Add at least one line"));
    if (lines.some((l) => !l.description.trim())) errs.push(T("ทุกรายการต้องมีชื่อ", "Every line needs a description"));
    if (lines.some((l) => !(l.qty > 0))) errs.push(T("จำนวนต้องมากกว่า 0", "Quantity must be above 0"));
    if (!d.no.trim()) errs.push(T("ใส่เลขที่เอกสาร", "Enter a document number"));
    if (store.docs.some((x) => x.id !== d.id && x.type === d.type && x.no === d.no.trim())) errs.push(T("เลขที่เอกสารซ้ำ", "Duplicate document number"));
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
    onSave(doc, newCustomer);
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
            <div className="field"><label htmlFor={`${fid}-no`}>{T("เลขที่", "Number")}</label><input id={`${fid}-no`} value={d.no} onChange={(e) => set({ no: e.target.value })} /></div>
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
          <button type="submit" className="btn btn-primary">{T("บันทึกเอกสาร", "Save document")}</button>
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
function CustomersView({ store, setStore, T, money, show, newDoc }: Ctx) {
  const fid = useId();
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
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ id: uid(), name: "", taxId: "", branch: "สำนักงานใหญ่", address: "", phone: "", email: "" })}>+ {T("เพิ่มลูกค้า", "Add customer")}</button>
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
            if (!edit.name.trim() || err) return;
            const c = { ...edit, name: edit.name.trim() };
            setStore((s) => ({ ...s, customers: s.customers.some((x) => x.id === c.id) ? s.customers.map((x) => (x.id === c.id ? c : x)) : [...s.customers, c] }));
            setEdit(null);
            show(T("บันทึกลูกค้าแล้ว", "Customer saved"));
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
              <button type="submit" className="btn btn-primary btn-sm" disabled={!edit.name.trim() || Boolean(err)}>{T("บันทึก", "Save")}</button>
              {store.customers.some((c) => c.id === edit.id) && (used(edit.id)
                ? <span className="hint">{T("ลบไม่ได้เพราะมีเอกสารของลูกค้านี้", "Can't delete — has documents")}</span>
                : <ConfirmButton label={T("ลบลูกค้า", "Delete")} confirmLabel={T("กดอีกครั้งเพื่อลบ", "Tap again")} onConfirm={() => { setStore((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== edit.id) })); setEdit(null); }} />)}
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
function ItemsView({ store, setStore, T, money }: Ctx) {
  const fid = useId();
  const [draft, setDraft] = useState({ name: "", unit: "", price: "" });
  const setItem = (id: string, p: Partial<CatalogItem>) => setStore((s) => ({ ...s, items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  return (
    <section className="panel">
      <h2 className="panel-title">{T("สินค้า / บริการ", "Products & services")} <span className="muted-count">({store.items.length})</span></h2>
      <p className="hint">{T("รายการที่ใช้บ่อย — ตอนออกเอกสารเลือกจากรายการนี้ได้ ราคาและหน่วยจะเติมให้เอง", "Frequently used items — pick them in the editor to fill unit and price.")}</p>
      <form className="item-add" onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim()) return;
        setStore((s) => ({ ...s, items: [...s.items, { id: uid(), name: draft.name.trim(), unit: draft.unit.trim(), price: num(draft.price) }] }));
        setDraft({ name: "", unit: "", price: "" });
      }}>
        <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อสินค้า/บริการ", "Name")}</label><input id={`${fid}-n`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${fid}-u`}>{T("หน่วย", "Unit")}</label><input id={`${fid}-u`} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder={T("ชิ้น / งาน / ชั่วโมง", "pc / job / hr")} /></div>
        <div className="field"><label htmlFor={`${fid}-p`}>{T("ราคา", "Price")}</label><input id={`${fid}-p`} type="number" inputMode="decimal" min={0} step="any" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.name.trim()}>{T("เพิ่ม", "Add")}</button>
      </form>
      {store.items.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={T("ตารางสินค้า/บริการ", "Items table")}>
          <table className="docs items-table">
            <thead><tr><th scope="col">{T("ชื่อ", "Name")}</th><th scope="col">{T("หน่วย", "Unit")}</th><th scope="col">{T("ราคา", "Price")}</th><th scope="col"><span className="sr-only">{T("ลบ", "Delete")}</span></th></tr></thead>
            <tbody>
              {store.items.map((it) => (
                <tr key={it.id}>
                  <td><input aria-label={T("ชื่อ", "Name")} value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} /></td>
                  <td><input aria-label={`${T("หน่วยของ", "Unit of")} ${it.name}`} value={it.unit} onChange={(e) => setItem(it.id, { unit: e.target.value })} /></td>
                  <td><input aria-label={`${T("ราคาของ", "Price of")} ${it.name}`} type="number" inputMode="decimal" min={0} step="any" value={it.price} onChange={(e) => setItem(it.id, { price: num(e.target.value) })} /><span className="sr-only">{money(it.price)}</span></td>
                  <td><button type="button" className="icon-btn icon-btn--sm" aria-label={`${T("ลบ", "Delete")} ${it.name}`} onClick={() => setStore((s) => ({ ...s, items: s.items.filter((x) => x.id !== it.id) }))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ SETTINGS */
function SettingsView({ store, setStore, T, show, today }: Ctx) {
  const fid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const bz = store.biz;
  const set = (p: Partial<Business>) => setStore((s) => ({ ...s, biz: { ...s.biz, ...p } }));
  const tErr = taxIdError(bz.taxId);
  const pp = sanitizeId(bz.promptpay);
  const ppErr = pp && !detectKind(pp) ? T("ใส่เบอร์มือถือ 10 หลัก หรือเลข 13 หลัก", "Use a 10-digit mobile or 13-digit ID") : "";
  return (
    <div className="report-grid">
      <section className="panel">
        <h2 className="panel-title">{T("ข้อมูลกิจการ (หัวเอกสาร)", "Business details (letterhead)")}</h2>
        <div className="stack-form">
          <div className="field"><label htmlFor={`${fid}-n`}>{T("ชื่อกิจการ / บริษัท", "Business name")}</label><input id={`${fid}-n`} value={bz.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${fid}-t`}>{T("เลขประจำตัวผู้เสียภาษี", "Tax ID")}</label>
              <input id={`${fid}-t`} inputMode="numeric" value={bz.taxId} onChange={(e) => set({ taxId: e.target.value })} aria-invalid={Boolean(tErr) || undefined} aria-describedby={`${fid}-te`} />
              <p className="field-error" id={`${fid}-te`}>{tErr ?? ""}</p>
            </div>
            <div className="field"><label htmlFor={`${fid}-b`}>{T("สาขา", "Branch")}</label><input id={`${fid}-b`} value={bz.branch} onChange={(e) => set({ branch: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${fid}-p`}>{T("โทร", "Phone")}</label><input id={`${fid}-p`} type="tel" value={bz.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${fid}-e`}>{T("อีเมล", "Email")}</label><input id={`${fid}-e`} type="email" value={bz.email} onChange={(e) => set({ email: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor={`${fid}-a`}>{T("ที่อยู่", "Address")}</label><textarea id={`${fid}-a`} rows={2} value={bz.address} onChange={(e) => set({ address: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${fid}-s`}>{T("ชื่อผู้ลงนาม", "Signatory")}</label><input id={`${fid}-s`} value={bz.signer} onChange={(e) => set({ signer: e.target.value })} /></div>
          <div className="field">
            <label htmlFor={`${fid}-pp`}>{T("พร้อมเพย์รับเงิน (QR จะขึ้นบนใบแจ้งหนี้ที่ยังค้าง)", "PromptPay (QR on unpaid invoices)")}</label>
            <input id={`${fid}-pp`} inputMode="numeric" value={bz.promptpay} onChange={(e) => set({ promptpay: e.target.value })} aria-invalid={Boolean(ppErr) || undefined} aria-describedby={`${fid}-ppe`} />
            <p className="field-error" id={`${fid}-ppe`}>{ppErr}</p>
          </div>
        </div>
      </section>
      <section className="panel">
        <h2 className="panel-title">{T("การออกเอกสาร", "Document settings")}</h2>
        <div className="stack-form">
          <label className="check-row"><input type="checkbox" checked={bz.vatRegistered} onChange={(e) => set({ vatRegistered: e.target.checked })} />{T("จดทะเบียนภาษีมูลค่าเพิ่ม (VAT) แล้ว", "VAT-registered")}</label>
          <p className="hint">{T("ถ้าจด VAT เอกสารใหม่จะตั้งเป็น “บวก VAT 7%” และใบเสร็จจะเป็น “ใบเสร็จรับเงิน/ใบกำกับภาษี”", "New documents default to +7% VAT and receipts become tax invoices.")}</p>
          <div className="grid-2">
            <div className="field"><label htmlFor={`${fid}-dd`}>{T("เครดิต (วัน)", "Payment terms (days)")}</label><input id={`${fid}-dd`} type="number" min={0} value={bz.dueDays} onChange={(e) => set({ dueDays: Math.max(0, num(e.target.value)) })} /></div>
            <div className="field"><label htmlFor={`${fid}-vd`}>{T("ยืนราคา (วัน)", "Quote valid (days)")}</label><input id={`${fid}-vd`} type="number" min={0} value={bz.validDays} onChange={(e) => set({ validDays: Math.max(0, num(e.target.value)) })} /></div>
          </div>
          <fieldset className="ed-group">
            <legend>{T("ตัวนำหน้าเลขที่เอกสาร", "Number prefixes")}</legend>
            <div className="ed-grid-3">
              {(["QT", "INV", "RC"] as const).map((k) => (
                <div className="field" key={k}><label htmlFor={`${fid}-px-${k}`}>{T(...TYPE_LABEL[k])}</label><input id={`${fid}-px-${k}`} value={bz.prefixes[k]} onChange={(e) => set({ prefixes: { ...bz.prefixes, [k]: e.target.value.replace(/\s/g, "").toUpperCase() || k } })} /></div>
              ))}
            </div>
            <p className="hint">{T(`รูปแบบ: ${bz.prefixes.INV}-${today.slice(0, 7).replace("-", "")}-001 (เริ่มนับใหม่ทุกเดือน)`, `Format: ${bz.prefixes.INV}-${today.slice(0, 7).replace("-", "")}-001 (resets monthly)`)}</p>
          </fieldset>
        </div>
        <p className="mini-title">{T(`ข้อมูล (${store.docs.length} เอกสาร, ${store.customers.length} ลูกค้า)`, `Data (${store.docs.length} documents, ${store.customers.length} customers)`)}</p>
        <div className="side-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => download(`billing-backup-${today}.json`, JSON.stringify(store), "application/json")}>{T("สำรองข้อมูล", "Back up")}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{T("กู้คืนจากไฟล์", "Restore")}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const d = JSON.parse(await readFile(f)) as Store;
              if (!Array.isArray(d.docs) || !Array.isArray(d.customers) || typeof d.biz !== "object") throw new Error();
              setStore(() => ({ ...empty(), ...d, biz: { ...defaultBiz, ...d.biz } }));
              show(T("กู้คืนข้อมูลแล้ว", "Restored"));
            } catch {
              show(T("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบเอกสาร", "Not a billing backup file"));
            }
          }} />
          <ConfirmButton label={T("ล้างข้อมูลทั้งหมด", "Delete all data")} confirmLabel={T("กดอีกครั้งเพื่อลบทุกอย่าง", "Tap again to delete everything")} onConfirm={() => setStore(() => empty())} />
        </div>
        <p className="privacy">{T("ข้อมูลลูกค้าและเอกสารเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ถูกส่งไปที่ใด — สำรองไฟล์เป็นประจำ · ระบบนี้ช่วยออกเอกสาร ไม่ใช่คำแนะนำทางภาษี ควรตรวจกับนักบัญชี", "Data stays in this browser. Back up regularly. This tool prepares documents; it isn't tax advice — check with your accountant.")}</p>
      </section>
    </div>
  );
}
