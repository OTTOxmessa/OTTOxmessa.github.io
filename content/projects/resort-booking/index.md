---
title: { th: "ระบบจองที่พักรีสอร์ท", en: "Resort Booking System" }
summary:
  th: "ระบบจองห้องพักครบวงจร แยกพอร์ทัลลูกค้าและพนักงาน มี OTP login แจ้งเตือนทางอีเมล และอัปโหลดรูปห้องพักขึ้น cloud"
  en: "End-to-end room booking with separate guest and staff portals, OTP login, email notifications and cloud image uploads."
role: { th: "Full-stack Developer", en: "Full-stack Developer" }
year: 2026
status: done
layers: [frontend, backend, database, infra]
stack: [Node.js, Express, PostgreSQL, JWT, Google Cloud Storage, Nodemailer, node-cron]
links:
  github: https://github.com/OTTOxmessa/Resort_System
  demo: https://resort-system-jo00.onrender.com/home.html
featured: true
order: 1
---

## ภาพรวม

ระบบจองที่พักรีสอร์ทที่แบ่งผู้ใช้เป็น 2 ฝั่ง

- **ลูกค้า** — สมัครสมาชิก, เข้าสู่ระบบด้วย OTP, ค้นหาและจองห้องพัก, กรอกข้อมูลผู้เข้าพัก, ดูประวัติการจอง และจัดการบัญชี
- **พนักงาน / เจ้าของ** — dashboard สำหรับพนักงาน, จัดการการจอง, จัดการห้องพักและรูปภาพ, จัดการสมาชิก และดูรายงาน

## สถาปัตยกรรม

```
client/ (HTML + JS)  ─┐
employee/ (HTML + JS) ┴─▶  Express API  ─▶  PostgreSQL
                            │
                            ├─▶ Google Cloud Storage (รูปห้องพัก)
                            └─▶ Email (Nodemailer / Resend) + node-cron
```

- แยก route ตามฟีเจอร์: `auth`, `booking`, `room`, `staff`, `dashboard`, `report-owner` ฯลฯ
- ยืนยันตัวตนด้วย JWT และ OTP ทางอีเมล
- งานตั้งเวลา (node-cron) สำหรับงานเบื้องหลังของระบบ
- มี DDL ทั้ง PostgreSQL และ Oracle

## Deploy

Deploy บน Render — หมายเหตุ: แผนฟรีจะหลับเมื่อไม่มีคนใช้ การเปิดครั้งแรกอาจใช้เวลาประมาณ 30–60 วินาที
