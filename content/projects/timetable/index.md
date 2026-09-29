---
title: { th: "ตารางเรียน + ส่งเข้าปฏิทิน", en: "Class Timetable + Calendar Export" }
summary:
  th: "จัดตารางเรียนรายสัปดาห์ เตือนเมื่อเวลาชนกัน บอกคาบถัดไป และส่งออกไฟล์ .ics ให้ทุกคาบขึ้นในปฏิทินมือถือซ้ำทุกสัปดาห์จนปิดเทอม"
  en: "Build your weekly timetable, catch clashes, see your next class, and export an .ics file so every class repeats in your phone calendar."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, iCalendar (RFC 5545), Vitest]
app: /tools/timetable/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 4
snippet:
  file: tools/timetable.ts
  code: |
    // คาบชน = วันเดียวกัน และช่วงเวลาทับกัน
    if (a.day === b.day
      && toMin(a.start) < toMin(b.end)
      && toMin(b.start) < toMin(a.end)) out.push([a, b]);
    // เกิดซ้ำทุกสัปดาห์จนปิดเทอม
    `RRULE:FREQ=WEEKLY;BYDAY=${day};UNTIL=${end}`
metric: { label: "TESTS", value: "7" }
---

## ใช้ทำอะไร

- ใส่วิชา วัน เวลา ห้อง → เห็น **ตารางรายสัปดาห์** ทันที
- **เวลาชนกัน** จะถูกไฮไลต์และแจ้งเตือน (เช่นตอนลงทะเบียนเรียน)
- การ์ด **"คาบถัดไป"** บอกว่าคาบต่อไปคืออะไร ห้องไหน อีกกี่นาที
- **ส่งออก .ics** → เปิดใน Google Calendar / ปฏิทิน iPhone แล้วทุกคาบขึ้นซ้ำทุกสัปดาห์จนวันปิดเทอม
- พิมพ์ตารางได้

## รายละเอียดทางเทคนิค

- ไฟล์ .ics สร้างตาม RFC 5545 เอง: `VTIMEZONE` Asia/Bangkok, `RRULE` รายสัปดาห์, escape `, ;` และ **ตัดบรรทัดที่ยาวเกิน 75 byte โดยไม่ตัดกลางตัวอักษรไทย** (UTF-8 หลาย byte) — มี test ตรวจ
- หาวันแรกของแต่ละวิชาจากวันเปิดเทอม (เช่น เปิดวันพุธ วิชาวันจันทร์เริ่มสัปดาห์ถัดไป)
- ตารางแบบกราฟิกซ่อนจาก screen reader แล้วมี **รายการแยกตามวัน** ที่อ่านได้ครบแทน
