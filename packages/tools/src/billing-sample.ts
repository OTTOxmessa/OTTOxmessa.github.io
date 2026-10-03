/**
 * ข้อมูลตัวอย่างของระบบใบเสนอราคา/ใบแจ้งหนี้ — สตูดิโอรับทำเว็บ ย้อนหลังราว 5 เดือน
 * ใช้ร่วมกันทั้งปุ่ม "ใช้ข้อมูลตัวอย่าง" ในหน้าเว็บ และบัญชีทดลองของ API
 */
import { addDays, balance, blankDoc, quoteToInvoice, receivePayment, type Business, type CatalogItem, type Customer, type Doc, type Line, type Payment, type QuoteStatus, type VatMode } from "./billing";

export const defaultBusiness: Business = {
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

export function billingSample(today: string, id: () => string): { docs: Doc[]; customers: Customer[]; items: CatalogItem[]; biz: Business } {
  const biz: Business = {
    ...defaultBusiness,
    name: "OTTO Studio",
    taxId: "0105566012344",
    address: "99/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    phone: "043-000-000",
    email: "hello@otto.studio",
    vatRegistered: true,
    signer: "ออตโต้",
  };
  const c = (name: string, taxId: string, address: string, phone = "", branch = "สำนักงานใหญ่"): Customer => ({ id: id(), name, taxId, branch, address, phone, email: "" });
  const customers = [
    c("บริษัท ขอนแก่นเบเกอรี่ จำกัด", "0405561000019", "12 ถ.ศรีจันทร์ อ.เมือง จ.ขอนแก่น", "081-111-2222"),
    c("ร้านกาแฟบ้านสวน", "", "45 หมู่ 3 ต.ศิลา อ.เมือง จ.ขอนแก่น", "089-222-3333", ""),
    c("ห้างหุ้นส่วนจำกัด สยามก่อสร้าง", "0403550000029", "8/1 ถ.กลางเมือง จ.ขอนแก่น", "043-222-111"),
    c("คลินิกทันตกรรมยิ้มสวย", "", "77 ถ.หน้าเมือง จ.ขอนแก่น", "082-333-4444", ""),
    c("บริษัท อีสานโลจิสติกส์ จำกัด", "0405563000032", "200 ถ.มิตรภาพ จ.ขอนแก่น", "043-555-666", "สาขา 00001"),
  ];
  const it = (name: string, unit: string, price: number): CatalogItem => ({ id: id(), name, unit, price });
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
  const L = (i: number, qty = 1): Line => ({ id: id(), description: items[i]!.name, qty, unit: items[i]!.unit, price: items[i]!.price });
  let docs: Doc[] = [];
  const add = (d: Doc) => (docs = [...docs, d]);
  const quote = (ci: number, daysAgo: number, lines: Line[], status: QuoteStatus, wht = 0) => {
    const d = { ...blankDoc("QT", docs, biz, customers[ci]!, addDays(today, -daysAgo), id()), lines, quoteStatus: status, whtRate: wht };
    add(d);
    return d;
  };
  const invoiceFrom = (q: Doc, daysAgo: number) => {
    const d = quoteToInvoice(q, docs, biz, addDays(today, -daysAgo), id(), id);
    add(d);
    return d;
  };
  const pay = (inv: Doc, daysAgo: number, amount: number | "all", method: Payment["method"] = "transfer") => {
    const cur = docs.find((x) => x.id === inv.id)!;
    const amt = amount === "all" ? balance(cur) : amount;
    docs = receivePayment(docs, inv.id, { date: addDays(today, -daysAgo), amount: amt, method, note: "" }, biz, { payment: id(), receipt: id(), line: id }).docs;
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
    const inv = { ...blankDoc("INV", docs, biz, customers[0]!, addDays(today, -m), id()), lines: [L(2)], whtRate: 3, note: "ค่าดูแลเว็บไซต์ประจำเดือน" };
    add(inv);
    if (m > 40) pay(inv, m - 12, "all");
  }
  const q5 = quote(4, 50, [L(1), L(6, 3)], "accepted", 3);
  const i5 = invoiceFrom(q5, 45);
  pay(i5, 20, 30000);
  const q6 = quote(3, 30, [L(7, 6)], "accepted");
  invoiceFrom(q6, 28); // ยังไม่จ่าย (ใกล้ครบกำหนด)
  const oldInv = { ...blankDoc("INV", docs, biz, customers[1]!, addDays(today, -70), id()), lines: [L(4, 30)], vatMode: "none" as VatMode, note: "ถ่ายภาพเมนูใหม่" };
  add(oldInv); // ค้างนาน
  quote(2, 6, [L(0), L(1), L(2, 12)], "sent", 3);
  quote(4, 2, [L(6, 6), L(7, 4)], "draft", 3);
  return { docs, customers, items, biz };
}

