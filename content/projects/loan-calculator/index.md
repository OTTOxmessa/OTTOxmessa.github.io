---
title: { th: "คำนวณผ่อน รถ บ้าน สินค้า", en: "Loan & Instalment Calculator" }
summary:
  th: "คำนวณค่างวดแบบดอกเบี้ยคงที่ (ผ่อนรถ/สินค้า) และลดต้นลดดอก (บ้าน) พร้อมแปลงเป็นดอกเบี้ยที่แท้จริงต่อปี จะได้รู้ว่าสัญญาไหนถูกกว่า"
  en: "Monthly payments for flat-rate (cars, gadgets) and reducing-balance (homes) loans, plus the real annual rate so you can compare offers."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, Numerical methods, Vitest]
app: /tools/loan/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 5
snippet:
  file: tools/loan.ts
  code: |
    // หาอัตราดอกเบี้ยจริงจากค่างวด (bisection)
    const pv = payment * (1 - (1 + mid) ** -months) / mid;
    if (pv > principal) lo = mid; else hi = mid;
    return ((lo + hi) / 2) * 12 * 100; // % ต่อปี
metric: { label: "TESTS", value: "8" }
---

## ทำไมถึงทำ

โฆษณาผ่อนรถ "ดอกเบี้ย 2.49%" กับสินเชื่อบ้าน "6%" ดูเหมือนรถถูกกว่ามาก แต่จริงๆ คิดคนละแบบ:

- **ดอกเบี้ยคงที่ (flat rate)** คิดดอกจากยอดเต็มตลอดสัญญา แม้จะจ่ายคืนไปเรื่อยๆ แล้ว
- **ลดต้นลดดอก** คิดดอกจากเงินต้นที่ยังค้างเท่านั้น

เครื่องมือนี้แปลง flat rate เป็น **ดอกเบี้ยที่แท้จริงต่อปี** (เช่น flat 2.5% 5 ปี ≈ 4.7% ต่อปี) จะได้เทียบกันได้ตรงๆ

## มีอะไรบ้าง

- ค่างวด ดอกเบี้ยรวม ยอดจ่ายทั้งสัญญา
- กราฟเงินต้น vs ดอกเบี้ยรายปี และตารางผ่อนรายงวด (ดาวน์โหลด CSV ได้)
- ตัวอย่างสำเร็จรูป: ผ่อนรถ ผ่อนมือถือ สินเชื่อบ้าน

## รายละเอียดทางเทคนิค

- ลดต้นลดดอกใช้สูตร annuity งวดสุดท้ายปรับเศษให้ยอดคงเหลือเป็น 0 พอดี
- ตาราง flat rate ตัดดอกแบบ Rule of 78 (ดอกเบี้ยหนักช่วงแรก) ตามที่ไฟแนนซ์ใช้
- อัตราดอกเบี้ยจริงหาด้วยวิธี bisection — มี test ตรวจว่าแปลงไปกลับกับสูตร annuity ได้ค่าเดิม
