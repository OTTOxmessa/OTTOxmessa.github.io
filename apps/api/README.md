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

## API

เอกสารแบบโต้ตอบ (OpenAPI / Swagger UI): **`/docs`** — เช่น https://otto-api-14oc.onrender.com/docs

| กลุ่ม | เส้นทาง |
|---|---|
| auth | `POST /auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/demo` · `GET /me` · `POST /me/password` |
| ร้านและสมาชิก | `POST /orgs` · `GET/PATCH /orgs/:orgId` · `GET/POST /orgs/:orgId/members` · `PATCH/DELETE …/members/:userId` |
| ลูกค้า / สินค้า | `GET/POST /orgs/:orgId/customers` · `PATCH/DELETE …/:id` · `GET …/customers/:id/statement` · `…/items` (CRUD) |
| เอกสาร | `GET/POST /orgs/:orgId/documents` · `GET/PATCH …/:id` · `POST …/:id/status` · `…/convert` · `…/void` · `…/payments` |
| รายงาน | `GET /orgs/:orgId/reports/summary?month=` · `GET …/export.csv` · `GET …/audit` |
| หน้าเว็บ | `GET /orgs/:orgId/snapshot` (ข้อมูลทั้งร้านในรูปแบบของแอป) · `POST …/import` |

ทุกเส้นทางใต้ `/orgs/:orgId` ตรวจสิทธิ์สมาชิก — คนนอกร้านได้ 404 (ไม่บอกว่ามีร้านนี้อยู่), viewer เขียนไม่ได้ (403), ตั้งค่าร้าน/นำเข้า/ดู audit ได้เฉพาะ owner

### การยืนยันตัวตน

- **Access token** — JWT (HS256) อายุ 15 นาที ส่งเป็น `Authorization: Bearer …`
- **Refresh token** — สุ่ม 32 ไบต์ เก็บในฐานข้อมูลเป็น SHA-256 อายุ 30 วัน **ใช้ได้ครั้งเดียว** (หมุนทุกครั้ง) — ถ้า token เก่าถูกนำมาใช้อีกหลังพ้นช่วงผ่อนผัน 20 วินาที ถือว่าถูกขโมย → ยกเลิกทั้งตระกูล
- ไม่ใช้ cookie จึงใช้กับหน้าเว็บบน github.io (คนละโดเมน) ได้โดยไม่ต้องตั้ง SameSite/CSRF — แลกกับการที่ token อยู่ใน localStorage (ถ้าเว็บโดน XSS จะถูกอ่านได้) ซึ่งลดความเสี่ยงด้วยอายุ token สั้นและการตรวจจับการใช้ซ้ำ
- รหัสผ่าน argon2id, อีเมลที่ไม่มีในระบบก็ยัง verify กับ hash หลอก (เวลาตอบเท่ากัน เดาอีเมลไม่ได้), login จำกัด 10 ครั้ง/15 นาที ต่อ IP + อีเมล

### ความถูกต้องเมื่อใช้พร้อมกัน

- **เลขที่เอกสาร**: `INSERT … ON CONFLICT DO UPDATE SET last = last + 1 RETURNING last` — test ยิงสร้าง 30 ใบพร้อมกัน ได้เลข 001–030 ไม่ซ้ำไม่ข้าม
- **รับชำระ**: `SELECT … FOR UPDATE` ที่ใบแจ้งหนี้ — test ยิงรับชำระ 20 ครั้งพร้อมกันบนยอดที่รับได้ 10 ครั้ง สำเร็จ 10 ครั้งพอดี
- **Idempotency-Key** (บังคับสำหรับรับชำระ): ส่งซ้ำได้ผลเดิม (`idempotent-replayed: true`), ใช้ key เดิมกับเนื้อหาอื่น → 422
- **Optimistic locking**: แก้เอกสารต้องส่ง `version` ล่าสุด ไม่ตรง → 409 พร้อม `currentVersion`

### ตัวเชื่อมฝั่งหน้าเว็บ

`apps/web/lib/api.ts` — แนบ token, refresh ล่วงหน้าเมื่อใกล้หมดอายุ, เจอ 401 แลก token แล้วส่งคำขอเดิมซ้ำ (หลายคำขอพร้อมกันแลกครั้งเดียว), หลายแท็บใช้ token ชุดเดียวกันผ่าน storage และปลุกเซิร์ฟเวอร์แผนฟรีด้วย `/health` · โหมดออนไลน์ของแอปอยู่ที่ `apps/web/components/tools/billing-cloud.ts`

## Environment

| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | `postgres://…` (Neon: ค่า `channel_binding` ถูกตัดออกให้อัตโนมัติ) |
| `JWT_SECRET` | สุ่มยาว ≥ 32 ตัว — ถ้าไม่ตั้งใน production จะสุ่มใหม่ทุกครั้งที่เริ่ม (ผู้ใช้ไม่หลุดเพราะ refresh token อยู่ในฐานข้อมูล แต่ทุก access token จะถูกแลกใหม่) |
| `CORS_ORIGINS` | โดเมนหน้าเว็บ คั่นด้วย `,` |
| `ACCESS_TOKEN_TTL_SEC` / `REFRESH_TOKEN_TTL_DAYS` | ค่าเริ่มต้น 900 / 30 |
| `RATE_LIMIT` | `false` เพื่อปิด (ใช้ใน test) |
| `MIGRATE_ON_START` | `false` ถ้าจะรัน migration เอง |

## ความคืบหน้า

- [x] **สัปดาห์ 1** — โครงโปรเจกต์, config ที่ตรวจ env ตอนเริ่ม, `/health`, schema + migration, test กับ Postgres จริงใน CI, `render.yaml`
- [x] **สัปดาห์ 2** — สมัคร/เข้าสู่ระบบ, refresh token แบบหมุน, ร้านและสิทธิ์, rate limit
- [x] **สัปดาห์ 3** — ลูกค้า สินค้า เอกสาร เลขที่เอกสารแบบไม่ซ้ำ, optimistic locking
- [x] **สัปดาห์ 4** — รับชำระ ใบเสร็จ ยกเลิก idempotency audit log + concurrency test, รายงาน, CSV
- [x] **สัปดาห์ 5** — เชื่อมหน้าเว็บ (login/สมัคร/บัญชีทดลอง, โหมดออนไลน์, นำเข้าข้อมูลเดิม)
- [x] **สัปดาห์ 6** — เอกสาร OpenAPI, บัญชี demo, หน้า case study

ต่อไป (ถ้าทำเฟส 2): ระบบสต็อกบน API เดียวกัน, เชิญสมาชิกด้วยลิงก์/อีเมล, รีเซ็ตรหัสผ่านทางอีเมล, ย้ายฐานข้อมูลไป region เดียวกับเซิร์ฟเวอร์
