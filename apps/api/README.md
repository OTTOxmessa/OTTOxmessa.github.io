# OTTO API

Backend ของระบบใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ (และระบบสต็อกในเฟส 2) — เปลี่ยนแอปที่เก็บข้อมูลใน localStorage ให้มีบัญชีผู้ใช้ ใช้ร่วมกันหลายคนในร้าน และ sync ข้ามเครื่องได้

**Stack:** Fastify 5 · TypeScript · PostgreSQL 16 · Drizzle ORM · Zod · Vitest (ทดสอบกับ Postgres จริง)

คำนวณเงินด้วย `@portfolio/tools/billing` ตัวเดียวกับหน้าเว็บ — server เป็นผู้คำนวณยอดจริง ฝั่งเว็บคำนวณไว้แสดงตัวอย่างเท่านั้น

## รันในเครื่อง

```bash
# 1) ฐานข้อมูล (หรือใช้ Postgres ที่มีอยู่แล้ว)
docker compose -f apps/api/docker-compose.yml up -d

# 2) ตั้งค่า
cp apps/api/.env.example apps/api/.env

# 3) รัน (migration จะรันให้อัตโนมัติตอนเริ่ม)
pnpm --filter @portfolio/api dev        # http://localhost:3001/health
pnpm --filter @portfolio/api test       # ใช้ฐาน otto_test (ล้างทุกครั้งที่รัน)
```

แก้ `src/db/schema.ts` แล้วสร้าง migration ใหม่ด้วย `pnpm --filter @portfolio/api db:generate --name <ชื่อ>` — ไฟล์ใน `drizzle/` ต้อง commit ด้วยเสมอ

## Deploy (Render + Neon แผนฟรี)

1. สร้างฐานข้อมูลที่ [Neon](https://neon.com) แล้วคัดลอก connection string (มี `?sslmode=require`)
2. Render → **New → Blueprint** → เลือก repo นี้ (อ่านค่าจาก `render.yaml`)
3. ใส่ `DATABASE_URL` ใน Environment ของบริการ `otto-api`
4. เปิด `https://<ชื่อบริการ>.onrender.com/health` ต้องได้ `{"status":"ok","db":"ok"}`

ข้อจำกัดแผนฟรี: เครื่องหลับเมื่อไม่มีคนใช้ ~15 นาที request แรกจะช้า — หน้าเว็บต้องเรียก `/health` เพื่อปลุกและแสดงสถานะ "กำลังเปิดเซิร์ฟเวอร์" ระหว่างรอ

## โครงสร้างฐานข้อมูล

| ตาราง | หน้าที่ |
|---|---|
| `users`, `organizations`, `memberships` | ผู้ใช้ ร้าน และสิทธิ์ (owner / staff / viewer) |
| `customers`, `items` | ลูกค้าและสินค้า/บริการของแต่ละร้าน |
| `documents`, `document_lines`, `payments` | เอกสาร QT / INV / RC รายการ และการรับชำระ |
| `number_sequences` | ตัวนับเลขที่เอกสาร ต่อร้าน × ประเภท × เดือน (กันเลขซ้ำเมื่อสร้างพร้อมกัน) |
| `idempotency_keys` | กันการรับชำระซ้ำเมื่อกดส่งซ้ำ / เน็ตหลุด |
| `audit_log` | ใครทำอะไร เมื่อไร |

กติกาที่บังคับไว้ในฐานข้อมูล (ทำงานแม้โค้ดมีบั๊ก): อีเมลไม่ซ้ำแบบไม่สนตัวพิมพ์, เลขเอกสารไม่ซ้ำในร้านเดียวกัน, อัตราหัก ณ ที่จ่ายต้องเป็น 0/1/2/3/5, วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร, ยอดรับชำระและจำนวนต้องมากกว่า 0, ลบร้านแล้วข้อมูลของร้านหายตามทั้งหมด

## ความคืบหน้า

- [x] **สัปดาห์ 1** — โครงโปรเจกต์, config ที่ตรวจ env ตอนเริ่ม, `/health`, schema + migration, test กับ Postgres จริงใน CI, `render.yaml`
- [ ] สัปดาห์ 2 — สมัคร/เข้าสู่ระบบ, ร้านและสิทธิ์, rate limit
- [ ] สัปดาห์ 3 — ลูกค้า สินค้า เอกสาร เลขที่เอกสารแบบไม่ซ้ำ
- [ ] สัปดาห์ 4 — รับชำระ ใบเสร็จ ยกเลิก idempotency audit log + concurrency test
- [ ] สัปดาห์ 5 — เชื่อมหน้าเว็บ (login, โหมดออนไลน์, นำเข้าข้อมูลเดิม)
- [ ] สัปดาห์ 6 — เอกสาร OpenAPI, บัญชี demo, หน้า case study
