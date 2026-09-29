/**
 * คำนวณเกรดเฉลี่ยแบบมหาวิทยาลัยไทย (A = 4 … F = 0)
 * S / U / W / I / P ไม่นำมาคิดเกรดเฉลี่ย
 */
export const GRADE_POINTS: Record<string, number | null> = {
  A: 4, "B+": 3.5, B: 3, "C+": 2.5, C: 2, "D+": 1.5, D: 1, F: 0,
  S: null, U: null, W: null, I: null, P: null,
};
export const GRADES = Object.keys(GRADE_POINTS);

export type Course = { id: string; code: string; credits: number; grade: string };
export type Term = { id: string; name: string; courses: Course[] };

export type TermStat = { gradedCredits: number; earnedCredits: number; points: number; gpa: number | null };

export function termStats(courses: Course[]): TermStat {
  let gradedCredits = 0;
  let earnedCredits = 0;
  let points = 0;
  for (const c of courses) {
    const credits = Number(c.credits);
    if (!(credits > 0)) continue;
    const gp = GRADE_POINTS[c.grade];
    if (gp === undefined) continue;
    if (c.grade !== "F" && c.grade !== "U" && c.grade !== "W" && c.grade !== "I") earnedCredits += credits;
    if (gp === null) continue;
    gradedCredits += credits;
    points += gp * credits;
  }
  return { gradedCredits, earnedCredits, points, gpa: gradedCredits ? points / gradedCredits : null };
}

export function cumulative(terms: Term[]): TermStat {
  return termStats(terms.flatMap((t) => t.courses));
}

/** ตัดทศนิยม 2 ตำแหน่ง (ไม่ปัดขึ้น) ตามที่มหาวิทยาลัยไทยส่วนใหญ่ใช้ */
export function formatGpa(gpa: number | null): string {
  if (gpa === null) return "–";
  return (Math.floor(gpa * 100 + 1e-9) / 100).toFixed(2);
}

/**
 * ต้องได้เกรดเฉลี่ยเท่าไหร่ในหน่วยกิตที่เหลือ เพื่อให้ GPAX ถึงเป้า
 * คืน null ถ้าไม่มีหน่วยกิตเหลือ
 */
export function requiredAverage(current: TermStat, target: number, remainingCredits: number) {
  if (!(remainingCredits > 0)) return null;
  const need = (target * (current.gradedCredits + remainingCredits) - current.points) / remainingCredits;
  return { need, possible: need <= 4 + 1e-9, alreadyThere: need <= 0 };
}

/** เกียรตินิยม (เกณฑ์ที่หลายมหาวิทยาลัยใช้ — ควรเช็กกับข้อบังคับของมหาวิทยาลัยตัวเอง) */
export function honors(gpax: number | null): "first" | "second" | null {
  if (gpax === null) return null;
  const g = Math.floor(gpax * 100 + 1e-9) / 100;
  if (g >= 3.6) return "first";
  if (g >= 3.25) return "second";
  return null;
}
