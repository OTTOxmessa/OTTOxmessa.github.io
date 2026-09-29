/**
 * ตารางเรียน: ตรวจคาบชน, หาคาบถัดไป, และส่งออกเป็นไฟล์ปฏิทิน .ics (RFC 5545)
 * เพื่อนำเข้า Google Calendar / Apple Calendar / Outlook ได้ พร้อมเกิดซ้ำทุกสัปดาห์จนจบเทอม
 */
export type Slot = { id: string; code: string; name: string; day: number; start: string; end: string; room: string; color: number };
export type Semester = { start: string; end: string };

/** 0 = จันทร์ … 6 = อาทิตย์ */
export const DAY_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
export const DAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ICS_DAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export function validSlot(s: Pick<Slot, "start" | "end" | "day">): boolean {
  return /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end) && toMin(s.end) > toMin(s.start) && s.day >= 0 && s.day <= 6;
}

/** คู่คาบที่เวลาทับกันในวันเดียวกัน */
export function conflicts(slots: Slot[]): [Slot, Slot][] {
  const out: [Slot, Slot][] = [];
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      if (a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) out.push([a, b]);
    }
  return out;
}

/** ช่วงเวลาที่ต้องแสดงบนตาราง (ปัดเป็นชั่วโมง) */
export function hourRange(slots: Slot[]): [number, number] {
  if (!slots.length) return [8, 17];
  const lo = Math.min(...slots.map((s) => Math.floor(toMin(s.start) / 60)));
  const hi = Math.max(...slots.map((s) => Math.ceil(toMin(s.end) / 60)));
  return [Math.min(lo, 8), Math.max(hi, lo + 4)];
}

/** day ของ JS (0 = อาทิตย์) → day ของเรา (0 = จันทร์) */
export const jsDayToMon0 = (d: number) => (d + 6) % 7;

/** คาบที่กำลังเรียนอยู่ หรือคาบถัดไปภายใน 7 วัน */
export function nextClass(slots: Slot[], now: Date) {
  const today = jsDayToMon0(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: { slot: Slot; minutes: number; ongoing: boolean } | null = null;
  for (const s of slots) {
    const start = toMin(s.start);
    const end = toMin(s.end);
    if (s.day === today && start <= nowMin && nowMin < end) return { slot: s, minutes: end - nowMin, ongoing: true };
    let delta = ((s.day - today + 7) % 7) * 1440 + start - nowMin;
    if (delta <= 0) delta += 7 * 1440;
    if (!best || delta < best.minutes) best = { slot: s, minutes: delta, ongoing: false };
  }
  return best;
}

function esc(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** ตัดบรรทัดที่ยาวเกิน 75 byte ตามสเปก (ไม่ตัดกลางตัวอักษร UTF-8) */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) {
      parts.push(cur);
      cur = ch;
      limit = 74; // บรรทัดต่อขึ้นต้นด้วยช่องว่าง 1 byte
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const ymd = (iso: string) => iso.replace(/-/g, "");

/** วันแรกที่ตรงกับวันในสัปดาห์นั้น นับจากวันเปิดเทอม */
export function firstDate(semesterStart: string, day: number): string {
  const [y, m, d] = semesterStart.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const diff = (day - jsDayToMon0(date.getUTCDay()) + 7) % 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function toIcs(slots: Slot[], sem: Semester, stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OTTO//Timetable//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ตารางเรียน",
    "X-WR-TIMEZONE:Asia/Bangkok",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Bangkok",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:ICT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const s of slots) {
    if (!validSlot(s)) continue;
    const first = ymd(firstDate(sem.start, s.day));
    const title = [s.code, s.name].filter(Boolean).join(" ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@timetable.ottoxmessa.github.io`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Bangkok:${first}T${s.start.replace(":", "")}00`,
      `DTEND;TZID=Asia/Bangkok:${first}T${s.end.replace(":", "")}00`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY[s.day]};UNTIL=${ymd(sem.end)}T165959Z`,
      `SUMMARY:${esc(title || "คาบเรียน")}`,
      ...(s.room ? [`LOCATION:${esc(s.room)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** หน่วยชั่วโมงเรียนต่อสัปดาห์ */
export function weeklyHours(slots: Slot[]): number {
  return Math.round((slots.reduce((s, x) => s + Math.max(0, toMin(x.end) - toMin(x.start)), 0) / 60) * 10) / 10;
}
