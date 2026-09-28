---
title: { th: "เครื่องคำนวณปรับสมดุลพอร์ต", en: "Portfolio Rebalancer" }
summary:
  th: "ใส่สินทรัพย์ที่ถือกับสัดส่วนเป้าหมาย แล้วดูว่าต้องซื้อหรือขายเท่าไหร่ — มีโหมด 'ซื้ออย่างเดียว' ใช้เงินที่เติมเข้ามาโดยไม่ต้องขาย"
  en: "Enter your holdings and target mix to see exactly what to buy or sell — including a buy-only mode that rebalances with new cash."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, Vitest]
lab: /lab/portfolio-rebalancer/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/labs/src/rebalance
order: 7
snippet:
  file: rebalance/index.ts
  code: |
    // ซื้ออย่างเดียว: แบ่งเงินตามส่วนที่ขาด
    const deficits = holdings.map((h, i) =>
      Math.max(0, targets[i] - h.value));
    const need = sum(deficits);
    deltas = deficits.map((d) => cash * d / need);
metric: { label: "TESTS", value: "9" }
---

## ทำไมถึงทำ

แยกส่วน "rebalancing" ออกมาจากโปรเจกต์ระบบจัดการพอร์ตลงทุน (CP353002) ให้ลองใช้ได้ทันทีโดยไม่ต้องมี backend

## Logic

- **ซื้อ/ขายได้**: ปรับทุกตัวให้ตรงเป้า `เป้า − ปัจจุบัน`
- **ซื้ออย่างเดียว**: แบ่งเงินสดใหม่ตามสัดส่วนของ "ส่วนที่ขาด" — พิสูจน์ได้ว่าผลรวมส่วนที่ขาด ≥ เงินสดเสมอ จึงไม่มีตัวไหนเกินเป้า
- ตรวจว่าเป้ารวมได้ 100% และไม่มีค่าติดลบ ก่อนคำนวณ

## การเข้าถึง

- ตารางกรอกมี label ทุกช่อง และแสดงผลเป็นตาราง (ไม่ใช่กราฟอย่างเดียว)
- แถบสัดส่วนมีตัวเลขกำกับ ไม่ใช้สีอย่างเดียวในการสื่อความหมาย
