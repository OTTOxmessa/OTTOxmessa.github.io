---
title: "Boardgame Everyday"
summary:
  th: "เว็บจองโต๊ะและเกมสำหรับร้านบอร์ดเกมคาเฟ่ งานกลุ่ม 6 คน — ผมดูแลฝั่ง backend ส่วน collection, plays, reviews และสถิติ"
  en: "Table and game booking web app for a board game café. Team of 6 — I own the collection, plays, reviews and stats backend modules."
role:
  th: "Backend — collection, plays, reviews, stats (business logic, aggregation, CRUD)"
  en: "Backend — collection, plays, reviews, stats (business logic, aggregation, CRUD)"
team: { th: "ทีม 6 คน (backend 2, frontend 4)", en: "Team of 6 (2 backend, 4 frontend)" }
year: 2026
status: in-progress
layers: [backend, database]
stack: [Node.js, Express, MongoDB, Mongoose]
featured: true
order: 2
---

## ภาพรวม

ระบบจองโต๊ะและบอร์ดเกมสำหรับร้านคาเฟ่ พัฒนาตามสเปกใน Plan.docx ของทีม

## ส่วนที่ผมรับผิดชอบ

- **Collection** — จัดการคลังเกมของร้าน
- **Plays** — บันทึกการเล่นแต่ละครั้ง
- **Reviews** — รีวิวและให้คะแนนเกม
- **Stats** — สรุปสถิติด้วย MongoDB aggregation pipeline

## การทำงานเป็นทีม

แต่ละคนพัฒนาบน branch ของตัวเองแล้ว merge เข้า `Develop` ก่อนขึ้น `main`
