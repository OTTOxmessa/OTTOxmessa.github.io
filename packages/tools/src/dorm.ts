/**
 * ระบบจัดการหอพัก — ห้อง ผู้เช่า มิเตอร์ บิลรายเดือน และการเก็บเงิน
 */
export type Extra = { name: string; amount: number };
export type Room = {
  id: string;
  number: string;
  rent: number;
  tenant: { name: string; phone: string } | null;
  extras: Extra[];
};
export type Settings = {
  name: string;
  waterRate: number;
  waterMin: number; // ค่าน้ำขั้นต่ำ (บาท/เดือน) 0 = ไม่มี
  electricRate: number;
  dueDay: number; // ชำระภายในวันที่
  promptpay: string;
  note: string;
};
export type Reading = { roomId: string; month: string; water: number | null; electric: number | null }; // เลขมิเตอร์ ณ สิ้นเดือน (null = ยังไม่จด)
export type Line = { label: string; detail?: string; amount: number };
export type Invoice = {
  id: string;
  roomId: string;
  month: string;
  lines: Line[];
  total: number;
  status: "unpaid" | "paid";
  paidAt: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function reading(readings: Reading[], roomId: string, month: string) {
  return readings.find((r) => r.roomId === roomId && r.month === month) ?? null;
}

/** หน่วยที่ใช้ = เลขเดือนนี้ − เลขเดือนก่อน (ถ้าเลขลดลง ถือว่าผิด ต้องตรวจ) */
export function units(prev: number | null, curr: number | null): { units: number; error: string | null } {
  if (curr === null || prev === null) return { units: 0, error: curr === null ? "ยังไม่ได้จด" : "ไม่มีเลขเดือนก่อน" };
  if (curr < prev) return { units: 0, error: "เลขมิเตอร์น้อยกว่าเดือนก่อน" };
  return { units: r2(curr - prev), error: null };
}

export function buildInvoice(room: Room, prev: Reading | null, curr: Reading | null, st: Settings, month: string, id: string): Invoice {
  const w = units(prev?.water ?? null, curr?.water ?? null);
  const e = units(prev?.electric ?? null, curr?.electric ?? null);
  const waterByUnits = r2(w.units * st.waterRate);
  const minApplied = st.waterMin > 0 && waterByUnits < st.waterMin;
  const waterAmount = minApplied ? st.waterMin : waterByUnits;
  const lines: Line[] = [
    { label: "ค่าเช่าห้อง", amount: room.rent },
    {
      label: "ค่าน้ำ",
      detail: `${prev?.water ?? "-"} → ${curr?.water ?? "-"} = ${w.units} หน่วย × ${st.waterRate}${minApplied ? ` (คิดขั้นต่ำ ${st.waterMin})` : ""}`,
      amount: r2(waterAmount),
    },
    {
      label: "ค่าไฟ",
      detail: `${prev?.electric ?? "-"} → ${curr?.electric ?? "-"} = ${e.units} หน่วย × ${st.electricRate}`,
      amount: r2(e.units * st.electricRate),
    },
    ...room.extras.filter((x) => x.amount).map((x) => ({ label: x.name, amount: x.amount })),
  ];
  return { id, roomId: room.id, month, lines, total: r2(lines.reduce((t, l) => t + l.amount, 0)), status: "unpaid", paidAt: null };
}

/**
 * ออกบิลของเดือนให้ทุกห้องที่มีผู้เช่า — ห้องที่ออกบิลแล้วจะไม่ถูกทับ (ยกเว้นบิลที่ยังไม่จ่ายและสั่ง regenerate)
 * คืนรายการปัญหา (เช่น ยังไม่จดมิเตอร์) ให้ UI แจ้งเตือน
 */
export function generateInvoices(rooms: Room[], readings: Reading[], invoices: Invoice[], st: Settings, month: string, makeId: () => string, regenerateUnpaid = false) {
  const problems: { room: string; message: string }[] = [];
  let next = [...invoices];
  let created = 0;
  for (const room of rooms) {
    if (!room.tenant) continue;
    const existing = next.find((i) => i.roomId === room.id && i.month === month);
    if (existing && (existing.status === "paid" || !regenerateUnpaid)) continue;
    const prev = reading(readings, room.id, prevMonth(month));
    const curr = reading(readings, room.id, month);
    for (const [kind, key] of [["น้ำ", "water"], ["ไฟ", "electric"]] as const) {
      const u = units(prev?.[key] ?? null, curr?.[key] ?? null);
      if (u.error) problems.push({ room: room.number, message: `${kind}: ${u.error}` });
    }
    const inv = buildInvoice(room, prev, curr, st, month, existing?.id ?? makeId());
    next = existing ? next.map((i) => (i.id === existing.id ? inv : i)) : [...next, inv];
    created++;
  }
  return { invoices: next, created, problems };
}

export function daysOverdue(inv: Invoice, st: Settings, today: string): number {
  if (inv.status === "paid") return 0;
  const [y, m] = inv.month.split("-").map(Number) as [number, number];
  // บิลของเดือน X ชำระภายในวันที่ dueDay ของเดือนถัดไป
  const due = Date.UTC(y, m, Math.min(st.dueDay, 28));
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - due) / 86_400_000));
}

export function monthReport(rooms: Room[], invoices: Invoice[], month: string) {
  const list = invoices.filter((i) => i.month === month);
  const billed = r2(list.reduce((t, i) => t + i.total, 0));
  const collected = r2(list.filter((i) => i.status === "paid").reduce((t, i) => t + i.total, 0));
  const sum = (label: string) => r2(list.reduce((t, i) => t + (i.lines.find((l) => l.label === label)?.amount ?? 0), 0));
  return {
    rooms: rooms.length,
    occupied: rooms.filter((r) => r.tenant).length,
    occupancy: rooms.length ? Math.round((rooms.filter((r) => r.tenant).length / rooms.length) * 100) : 0,
    invoices: list.length,
    paid: list.filter((i) => i.status === "paid").length,
    billed,
    collected,
    outstanding: r2(billed - collected),
    rent: sum("ค่าเช่าห้อง"),
    water: sum("ค่าน้ำ"),
    electric: sum("ค่าไฟ"),
  };
}

export function lastMonths(month: string, n: number): string[] {
  const out = [month];
  while (out.length < n) out.unshift(prevMonth(out[0]!));
  return out;
}
