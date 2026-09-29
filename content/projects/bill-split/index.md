---
title: { th: "หารบิล + QR พร้อมเพย์", en: "Bill Splitter + PromptPay QR" }
summary:
  th: "หารค่าอาหารตามที่แต่ละคนกินจริง คิดค่าบริการและ VAT ให้ แล้วสร้าง QR พร้อมเพย์ยอดของแต่ละคน สแกนจ่ายได้ทุกธนาคาร"
  en: "Split a restaurant bill by who ate what, with service charge and VAT, then get a PromptPay QR with each person's exact amount."
role: { th: "ทำคนเดียว — ออกแบบ logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, EMVCo QR, Vitest]
app: /tools/bill-split/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 1
snippet:
  file: tools/bill.ts
  code: |
    // ใช้สตางค์ (จำนวนเต็ม) ตลอด แล้วแจกเศษให้ครบ
    const parts = allocate(cost, who.map(() => 1));
    // ส่วนลด → ค่าบริการ → VAT ของ (ยอด + ค่าบริการ)
    const service = round(afterDiscount * servicePct / 100);
    const vat = round((afterDiscount + service) * vatPct / 100);
metric: { label: "TESTS", value: "18" }
---

## ปัญหา

ไปกินข้าวกับเพื่อน สั่งของไม่เท่ากัน บางจานกินด้วยกัน บางอย่างสั่งคนเดียว แล้วยังมีค่าบริการ 10% กับ VAT 7% — สุดท้ายคนจ่ายต้องมานั่งกดเครื่องคิดเลข แล้วส่งเลขบัญชีให้ทุกคน

## ใช้ยังไง

1. ใส่ชื่อคนที่ไป (พิมพ์หลายชื่อคั่นด้วย `,` ได้)
2. ใส่รายการอาหาร แล้วกดชื่อคนที่กินรายการนั้น — ไม่เลือกใคร = หารทุกคน
3. ใส่ค่าบริการ / VAT / ส่วนลด
4. เลือกคนจ่ายและใส่เบอร์พร้อมเพย์ → ทุกคนได้ **QR ที่มียอดของตัวเอง** สแกนจ่ายได้ทันที
5. กด "คัดลอกสรุป" ไปวางใน LINE หรือ "แชร์ลิงก์บิล" ให้เพื่อนเปิดดูรายละเอียดเอง

## จุดที่ตั้งใจทำให้ถูกต้อง

- **ยอดทุกคนรวมกันเท่ายอดบิลเป๊ะ** — คำนวณเป็นสตางค์ (จำนวนเต็ม) แล้วแจกเศษด้วยวิธี largest remainder ไม่มีเศษ 0.01 หาย
- ลำดับการคิดแบบร้านอาหารไทย: ส่วนลด → ค่าบริการ → VAT ของ (ยอด + ค่าบริการ)
- ส่วนลด ค่าบริการ และ VAT แบ่งตามสัดส่วนที่แต่ละคนกิน ไม่ได้หารเท่า
- **QR พร้อมเพย์สร้างเองตามมาตรฐาน EMVCo** (TLV + CRC-16) มี test เทียบผลกับไลบรารี `promptpay-qr` ที่ใช้กันแพร่หลาย ทั้งเบอร์โทร เลขบัตร และ e-Wallet
- ตรวจเลขบัตรประชาชนด้วย checksum ก่อนสร้าง QR

## ความเป็นส่วนตัว

ทุกอย่างคำนวณในเบราว์เซอร์ ไม่มี server ลิงก์ที่แชร์เก็บข้อมูลบิลไว้ในส่วน `#` ของ URL (ไม่ถูกส่งไปที่ server ใดๆ)
