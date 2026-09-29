/**
 * อ่านจำนวนเงินเป็นตัวหนังสือ (แบบ BAHTTEXT ของ Excel) และเครื่องมือภาษาไทยอื่นๆ
 * กฎ "เอ็ด": เลข 1 ในหลักหน่วยใช้ "เอ็ด" เมื่อมีหลักที่สูงกว่า (11, 101, 1,000,001)
 */
const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** อ่านตัวเลข 0–999,999 (หนึ่งกลุ่มหกหลัก) */
function readGroup(n: number, hasHigher: boolean): string {
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const place = s.length - 1 - i;
    if (d === 0) continue;
    if (place === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : DIGITS[d] + "สิบ";
    else if (place === 0) out += d === 1 && (hasHigher || n > 9) ? "เอ็ด" : DIGITS[d]!;
    else out += DIGITS[d]! + PLACES[place]!;
  }
  return out;
}

/** อ่านจำนวนเต็มไม่ติดลบ (รองรับหลักล้านซ้อนกัน เช่น ล้านล้าน) */
export function readInteger(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("ต้องเป็นจำนวนเต็มไม่ติดลบ");
  if (n === 0) return DIGITS[0]!;
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.unshift(rest % 1_000_000);
    rest = Math.floor(rest / 1_000_000);
  }
  let out = "";
  groups.forEach((g, i) => {
    const hasHigher = i > 0;
    if (g > 0) out += readGroup(g, hasHigher);
    if (i < groups.length - 1) out += "ล้าน";
  });
  return out;
}

export function bahtText(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("จำนวนเงินไม่ถูกต้อง");
  const negative = amount < 0;
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  let out = "";
  if (baht > 0) out += readInteger(baht) + "บาท";
  if (satang > 0) out += readGroup(satang, false) + "สตางค์";
  else out += baht > 0 ? "ถ้วน" : "ศูนย์บาทถ้วน";
  return (negative && satangTotal > 0 ? "ลบ" : "") + out;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r]! : TENS[Math.floor(r / 10)]! + (r % 10 ? "-" + ONES[r % 10] : ""));
  return parts.join(" and ");
}

export function englishInteger(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  let i = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(under1000(chunk) + (SCALES[i] ? " " + SCALES[i] : ""));
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}

/** จำนวนเงินเป็นภาษาอังกฤษสำหรับใบแจ้งหนี้/ใบเสนอราคา เช่น "One thousand baht and fifty satang only" */
export function englishAmount(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  let s = `${englishInteger(baht)} baht`;
  if (satang) s += ` and ${englishInteger(satang)} satang`;
  s += " only";
  if (amount < 0 && satangTotal > 0) s = "minus " + s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
export const toThaiDigits = (s: string) => s.replace(/[0-9]/g, (d) => THAI_DIGITS[Number(d)]!);
export const fromThaiDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export const toBE = (ce: number) => ce + 543;
export const toCE = (be: number) => be - 543;

/** "YYYY-MM-DD" → วันที่แบบไทยหลายรูปแบบ */
export function thaiDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error("วันที่ไม่ถูกต้อง");
  const date = new Date(Date.UTC(y, m - 1, d));
  const be = toBE(y);
  return {
    formal: `วัน${DAYS[date.getUTCDay()]}ที่ ${d} ${MONTHS[m - 1]} พ.ศ. ${be}`,
    long: `${d} ${MONTHS[m - 1]} ${be}`,
    short: `${d} ${MONTHS_SHORT[m - 1]} ${String(be).slice(-2)}`,
    numeric: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${be}`,
    thaiDigits: toThaiDigits(`${d} ${MONTHS[m - 1]} ${be}`),
  };
}

/** จำนวนวันระหว่างสองวัน (ไม่ขึ้นกับ timezone) */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** บวกเดือนแบบปัดวันให้อยู่ในเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** อายุ/ระยะเวลาเป็นปี เดือน วัน (นับเดือนเต็มจากวันเริ่มต้น แล้วที่เหลือเป็นวัน) */
export function ymdBetween(a: string, b: string): { years: number; months: number; days: number; sign: number } {
  if (daysBetween(a, b) < 0) return { ...ymdBetween(b, a), sign: -1 };
  let months = 0;
  while (daysBetween(addMonths(a, months + 1), b) >= 0) months++;
  const days = daysBetween(addMonths(a, months), b);
  return { years: Math.floor(months / 12), months: months % 12, days, sign: 1 };
}
