/**
 * คำนวณเงินผ่อน 2 แบบที่ใช้ในไทย
 * - ดอกเบี้ยคงที่ (flat rate): ผ่อนรถ ผ่อนสินค้า — คิดดอกจากเงินต้นเต็มก้อนตลอดสัญญา
 * - ลดต้นลดดอก (effective rate): สินเชื่อบ้าน สินเชื่อบุคคล — คิดดอกจากเงินต้นคงเหลือ
 * พร้อมแปลง flat rate เป็นอัตราดอกเบี้ยที่แท้จริงต่อปี (effective rate) เพื่อเทียบกันได้
 */
export type Row = { month: number; payment: number; interest: number; principal: number; balance: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function flatLoan(principal: number, ratePct: number, months: number) {
  const totalInterest = principal * (ratePct / 100) * (months / 12);
  const payment = (principal + totalInterest) / months;
  return { payment: r2(payment), totalInterest: r2(totalInterest), totalPaid: r2(principal + totalInterest) };
}

/** ค่างวดแบบลดต้นลดดอก (สูตร annuity) */
export function annuityPayment(principal: number, ratePct: number, months: number): number {
  const i = ratePct / 100 / 12;
  if (i === 0) return principal / months;
  return (principal * i) / (1 - Math.pow(1 + i, -months));
}

/** ตารางผ่อนแบบลดต้นลดดอก — งวดสุดท้ายปรับเศษให้ยอดคงเหลือเป็น 0 พอดี */
export function reducingSchedule(principal: number, ratePct: number, months: number): Row[] {
  const i = ratePct / 100 / 12;
  const pay = r2(annuityPayment(principal, ratePct, months));
  const rows: Row[] = [];
  let balance = principal;
  for (let m = 1; m <= months; m++) {
    const interest = r2(balance * i);
    let principalPart = r2(pay - interest);
    let payment = pay;
    if (m === months || principalPart > balance) {
      principalPart = r2(balance);
      payment = r2(principalPart + interest);
    }
    balance = r2(balance - principalPart);
    rows.push({ month: m, payment, interest, principal: principalPart, balance });
  }
  return rows;
}

/** ตารางผ่อนแบบ flat: ดอกเบี้ยแต่ละงวดคิดแบบ "ผลรวมลำดับ" (Rule of 78) ที่ไฟแนนซ์ไทยใช้ตัดดอก */
export function flatSchedule(principal: number, ratePct: number, months: number): Row[] {
  const { payment, totalInterest } = flatLoan(principal, ratePct, months);
  const sumDigits = (months * (months + 1)) / 2;
  const rows: Row[] = [];
  let balance = principal;
  let interestLeft = totalInterest;
  for (let m = 1; m <= months; m++) {
    let interest = r2((totalInterest * (months - m + 1)) / sumDigits);
    if (m === months) interest = r2(interestLeft);
    interestLeft = r2(interestLeft - interest);
    let principalPart = r2(payment - interest);
    if (m === months) principalPart = r2(balance);
    balance = r2(balance - principalPart);
    rows.push({ month: m, payment: m === months ? r2(principalPart + interest) : payment, interest, principal: principalPart, balance });
  }
  return rows;
}

/** อัตราดอกเบี้ยที่แท้จริงต่อปี (APR) จากเงินต้นและค่างวด — หาด้วย bisection */
export function effectiveRate(principal: number, payment: number, months: number): number {
  if (payment * months <= principal + 1e-9) return 0;
  let lo = 0;
  let hi = 1; // 100% ต่อเดือน
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const pv = (payment * (1 - Math.pow(1 + mid, -months))) / mid;
    if (pv > principal) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

export function summarize(rows: Row[]) {
  return {
    totalPaid: r2(rows.reduce((s, r) => s + r.payment, 0)),
    totalInterest: r2(rows.reduce((s, r) => s + r.interest, 0)),
    months: rows.length,
  };
}

/** ดอกเบี้ย/เงินต้นรวมต่อปี สำหรับกราฟ */
export function byYear(rows: Row[]) {
  const years: { year: number; interest: number; principal: number }[] = [];
  for (const r of rows) {
    const y = Math.ceil(r.month / 12);
    const last = years[y - 1] ?? (years[y - 1] = { year: y, interest: 0, principal: 0 });
    last.interest = r2(last.interest + r.interest);
    last.principal = r2(last.principal + r.principal);
  }
  return years;
}

export function scheduleCsv(rows: Row[]): string {
  return "\uFEFF" + ["งวด,ค่างวด,ดอกเบี้ย,เงินต้น,คงเหลือ", ...rows.map((r) => [r.month, r.payment, r.interest, r.principal, r.balance].join(","))].join("\r\n");
}
