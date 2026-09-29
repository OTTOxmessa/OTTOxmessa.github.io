---
title: { th: "จดรายรับรายจ่าย", en: "Money Diary" }
summary:
  th: "จดรายรับรายจ่ายได้ในไม่กี่วินาที เห็นว่าเงินหมดไปกับอะไร ตั้งงบแต่ละหมวด และส่งออกเป็น CSV เปิดใน Excel ได้ — ไม่ต้องสมัครสมาชิก"
  en: "Log income and spending in seconds, see where the money goes, set category budgets and export to CSV for Excel — no sign-up."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, CSV, Vitest]
app: /tools/money/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 3
snippet:
  file: tools/money.ts
  code: |
    // ใส่ BOM ให้ Excel อ่านภาษาไทยถูก
    return "\uFEFF" + [HEADER, ...rows].join("\r\n");
    // คาดการณ์ทั้งเดือนจากค่าเฉลี่ยต่อวัน
    return (spent / day) * daysInMonth;
metric: { label: "TESTS", value: "5" }
---

## ใช้ทำอะไร

- **จดเร็ว:** พิมพ์จำนวนเงิน เลือกหมวด กด Enter — ช่องจำนวนเงินกลับมารอพิมพ์รายการถัดไปทันที
- **สรุปรายเดือน:** รายรับ รายจ่าย คงเหลือ และกราฟว่าใช้ไปกับหมวดไหนมากสุด
- **คาดการณ์:** "ถ้าใช้แบบนี้ต่อ ทั้งเดือนจะใช้ประมาณ …"
- **งบประมาณ:** ตั้งงบรายหมวด เตือนเมื่อใช้ถึง 80% และเมื่อเกินงบ
- **ส่งออก / นำเข้า:** CSV เปิดใน Excel ได้ภาษาไทยไม่เพี้ยน และไฟล์สำรองสำหรับย้ายเครื่อง
- ลบผิดกด "เอาคืน" ได้

## รายละเอียดทางเทคนิค

- CSV เขียน parser เองรองรับ `"` และ `,` และการขึ้นบรรทัดใหม่ในโน้ต มี test ตรวจว่าส่งออกแล้วนำเข้ากลับได้ข้อมูลเดิมทุกตัว
- บรรทัดที่ผิดรูปแบบจะถูกข้ามพร้อมบอกเลขบรรทัด
- แถบงบประมาณใช้ `role="progressbar"` ให้ screen reader อ่านค่าได้

## ความเป็นส่วนตัว

ข้อมูลการเงินอยู่ในเบราว์เซอร์เครื่องนั้นเท่านั้น ไม่มีการส่งออกไปที่ใด
