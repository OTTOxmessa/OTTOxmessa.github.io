---
title: { th: "จับเวลาโฟกัส (Pomodoro)", en: "Focus Timer (Pomodoro)" }
summary:
  th: "จับเวลาอ่านหนังสือ 25 นาที พัก 5 นาที ผูกกับรายการงาน นับว่าแต่ละงานใช้กี่รอบ และดูสถิติการโฟกัส 7 วัน"
  en: "25-minute focus / 5-minute break cycles tied to a task list, with rounds per task and a 7-day focus history."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, Web Audio, Notifications API, Vitest]
app: /tools/focus/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 6
snippet:
  file: tools/focus.ts
  code: |
    // จับเวลาจาก "เวลาสิ้นสุด" ไม่ใช่นับ setInterval
    // จึงแม่นแม้สลับแท็บหรือเครื่องหน่วง
    if (state.status === "running")
      return Math.max(0, state.endsAt - now);
metric: { label: "TESTS", value: "7" }
---

## ใช้ทำอะไร

- โฟกัส 25 นาที → พักสั้น 5 นาที → ครบ 4 รอบได้พักยาว 15 นาที (ปรับเวลาได้)
- เพิ่มรายการงาน เลือกงานที่กำลังทำ — ทุกรอบที่ครบจะนับให้งานนั้น
- สถิติ: วันนี้กี่นาที, 7 วันล่าสุด, ทำต่อเนื่องกี่วัน
- เสียงเตือนและการแจ้งเตือนเมื่ออยู่แท็บอื่น, เวลาขึ้นบนชื่อแท็บ
- กด **Space** เริ่ม/หยุดได้

## รายละเอียดทางเทคนิค

- ตัวจับเวลาเก็บ "เวลาสิ้นสุด" แล้วคำนวณเวลาที่เหลือจากนาฬิกาจริง — browser มักหน่วง `setInterval` ในแท็บพื้นหลัง ถ้านับทีละวินาทีเวลาจะคลาด
- logic เป็น state machine (idle / running / paused) ที่ test ได้โดยไม่ต้องรอเวลาจริง
- ข้ามรอบ (Skip) จะไม่นับเป็นเวลาโฟกัส
- เสียงสร้างด้วย Web Audio ไม่ต้องโหลดไฟล์
