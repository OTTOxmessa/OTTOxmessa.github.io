---
title: { th: "คำนวณเกรด GPA / GPAX", en: "GPA / GPAX Calculator" }
summary:
  th: "คำนวณเกรดรายเทอมและเกรดเฉลี่ยสะสมแบบมหาวิทยาลัยไทย พร้อมบอกว่าต้องได้เกรดเท่าไหร่ถึงจะถึงเป้าหรือเกียรตินิยม"
  en: "Term GPA and cumulative GPAX the Thai-university way, plus a planner that tells you what you need to hit your target or honours."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, Vitest]
app: /tools/gpa/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 2
snippet:
  file: tools/gpa.ts
  code: |
    // ต้องได้เฉลี่ยเท่าไหร่ในหน่วยกิตที่เหลือ
    const need = (target * (graded + remaining)
                  - points) / remaining;
    return { need, possible: need <= 4 };
metric: { label: "TESTS", value: "9" }
---

## ใช้ทำอะไร

- ใส่วิชา หน่วยกิต และเกรด แยกทีละเทอม → ได้ **GPA รายเทอม** และ **GPAX สะสม** ทันที
- **วางแผนเกรด:** ใส่ GPAX ที่อยากได้กับหน่วยกิตที่เหลือ → บอกว่าต้องได้เฉลี่ยเท่าไหร่ หรือบอกตรงๆ ว่าเป็นไปไม่ได้แล้ว
- บอกว่าอยู่ในเกณฑ์เกียรตินิยมอันดับ 1 / 2 หรือไม่ (เกณฑ์ทั่วไป 3.60 / 3.25)
- กราฟ GPA แต่ละเทอม, สำรอง/นำเข้าข้อมูลเป็นไฟล์

## ตามระบบมหาวิทยาลัยไทย

- A = 4, B+ = 3.5 … F = 0
- S / U / W / I / P **ไม่นำมาคิดเกรดเฉลี่ย** แต่ S นับเป็นหน่วยกิตที่ผ่าน
- F นับในเกรดเฉลี่ยแต่ไม่นับเป็นหน่วยกิตที่ผ่าน
- แสดงผลแบบ **ตัดทศนิยม** 2 ตำแหน่ง (3.249 → 3.24) ตามที่มหาวิทยาลัยส่วนใหญ่ใช้ ไม่ปัดขึ้น

## ความเป็นส่วนตัว

เกรดเก็บในเบราว์เซอร์ของเครื่องนั้นเท่านั้น ไม่มีบัญชีผู้ใช้และไม่มี server
