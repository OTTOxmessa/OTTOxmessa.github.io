---
title: { th: "ระบบจัดการหอพัก", en: "Dorm & Apartment Manager" }
summary:
  th: "จัดการห้องและผู้เช่า จดมิเตอร์น้ำ-ไฟ ออกบิลทุกห้องในคลิกเดียวพร้อม QR พร้อมเพย์ พิมพ์ใบแจ้งหนี้ ติดตามค้างชำระ และสรุปรายรับรายเดือน"
  en: "Rooms and tenants, water/electric meter readings, one-click monthly invoices with PromptPay QR, printable bills, overdue tracking and monthly income."
role: { th: "ทำคนเดียว — ออกแบบระบบ logic, UI และ test", en: "Solo — system design, logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, EMVCo QR, Print CSS, Vitest]
app: /tools/dorm/
featured: true
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 2
snippet:
  file: tools/dorm.ts
  code: |
    // หน่วยที่ใช้ = เลขเดือนนี้ − เลขเดือนก่อน
    const w = units(prev?.water ?? null, curr?.water ?? null);
    const byUnits = r2(w.units * st.waterRate);
    // ค่าน้ำขั้นต่ำ (หอส่วนใหญ่มี)
    const water = st.waterMin > byUnits ? st.waterMin : byUnits;
    // บิลที่จ่ายแล้วจะไม่ถูกคำนวณทับ
    if (existing?.status === "paid") continue;
metric: { label: "TESTS", value: "7" }
---

## ปัญหา

เจ้าของหอพักเล็กๆ ทุกสิ้นเดือนต้องเดินจดมิเตอร์ แล้วนั่งคิดค่าน้ำค่าไฟทีละห้องด้วยเครื่องคิดเลข เขียนบิล และจำเองว่าห้องไหนยังไม่จ่าย — พลาดง่ายและเสียเวลาหลายชั่วโมง

## ขั้นตอนทุกเดือน

1. **จดมิเตอร์** — ตารางเดียว ใส่เลขน้ำ/ไฟของทุกห้อง ระบบลบเลขเดือนก่อนให้ และเตือนถ้าเลขลดลง (จดผิด)
2. **ออกบิล** — กดครั้งเดียวได้บิลทุกห้องที่มีผู้เช่า: ค่าเช่า + ค่าน้ำ (รองรับขั้นต่ำ) + ค่าไฟ + ค่าอื่นๆ ประจำห้อง (เน็ต ที่จอดรถ)
3. **พิมพ์/ส่งบิล** — ใบแจ้งหนี้มีจำนวนเงินเป็นตัวอักษร วันครบกำหนด และ **QR พร้อมเพย์ยอดตรง** พิมพ์ทุกห้องได้ในครั้งเดียว (ห้องละหน้า)
4. **เก็บเงิน** — ติ๊กจ่ายแล้ว ระบบแสดงห้องค้างชำระพร้อมจำนวนวันที่เลยกำหนด

## จุดที่ตั้งใจทำ

- บิลที่ **จ่ายแล้วจะไม่ถูกคำนวณทับ** แม้กดออกบิลใหม่ ส่วนบิลที่ยังไม่จ่ายสั่งคำนวณใหม่ได้เมื่อแก้เลขมิเตอร์
- แจ้งปัญหาก่อนออกบิล เช่น ยังไม่จดมิเตอร์ ไม่มีเลขเดือนก่อน
- สรุปรายรับ 6 เดือน อัตราการเข้าพัก และยอดค้างรับ
- ตารางใช้งานด้วยคีย์บอร์ดได้ ทุกช่องมีชื่อที่ screen reader อ่านได้ (เช่น "ห้อง 203 น้ำเดือนนี้")

## ข้อมูล

เก็บในเบราว์เซอร์เครื่องนี้ ไม่มี server — สำรองเป็นไฟล์ได้
