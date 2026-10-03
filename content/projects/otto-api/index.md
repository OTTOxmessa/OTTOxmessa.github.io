---
title: { th: "OTTO API — Backend ระบบเอกสารขาย", en: "OTTO API — Billing backend" }
summary:
  th: "REST API ที่ทำให้ระบบใบเสนอราคา/ใบแจ้งหนี้ใช้ได้หลายเครื่องและหลายคน — บัญชีผู้ใช้ สิทธิ์ในร้าน เลขที่เอกสารไม่ซ้ำแม้สร้างพร้อมกัน รับชำระแบบกันซ้ำ และ test กับ Postgres จริง"
  en: "A REST API that takes the billing app multi-device and multi-user — accounts, per-business roles, gap-free document numbers under concurrency, idempotent payments, tested against real Postgres."
role: { th: "ทำคนเดียว — ออกแบบ API ฐานข้อมูล ระบบยืนยันตัวตน test และ deploy", en: "Solo — API & schema design, auth, tests and deployment" }
year: 2026
status: done
layers: [backend, database, infra]
stack: [Node.js, TypeScript, Fastify, PostgreSQL, Drizzle ORM, Zod, JWT, argon2id, OpenAPI, Vitest, GitHub Actions, Render, Neon]
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/apps/api
  demo: https://otto-api-14oc.onrender.com/docs
demoNote: { th: "เซิร์ฟเวอร์แผนฟรี เปิดครั้งแรกรอ ~1 นาที", en: "Free-tier server — first load can take ~1 minute" }
featured: true
order: 0
snippet:
  file: services/billing.ts
  code: |
    // ออกเลขที่เอกสารแบบ atomic — สร้างพร้อมกันกี่คำขอ
    // ก็ได้เลขไม่ซ้ำและไม่ข้าม (ล็อกแถวตัวนับจนจบ transaction)
    const [seq] = await tx
      .insert(numberSequences)
      .values({ orgId, type, period, last: 1 })
      .onConflictDoUpdate({
        target: [numberSequences.orgId, numberSequences.type, numberSequences.period],
        set: { last: sql`${numberSequences.last} + 1` },
      })
      .returning({ last: numberSequences.last });
metric: { label: "TESTS", value: "54" }
---

## โจทย์

[ระบบใบเสนอราคา/ใบแจ้งหนี้](/projects/billing-system/) เดิมเก็บข้อมูลในเบราว์เซอร์ ใช้ได้เครื่องเดียว คนเดียว ถ้าร้านมีพนักงานสองคนออกใบแจ้งหนี้พร้อมกันจะได้เลขที่ซ้ำ และถ้าเครื่องหายข้อมูลก็หายด้วย

เป้าหมายของ backend นี้คือให้แอปเดิม **ใช้ข้ามเครื่องและใช้ร่วมกันในร้านได้** โดยที่ยอดเงินยังถูกต้องทุกสตางค์ และไม่มีกรณีที่ "กดสองที รับเงินสองครั้ง"

**ลองได้เลย:** เปิด[แอป](/tools/billing/) → ปุ่ม "ใช้ออนไลน์" → "ทดลองใช้ทันที" ได้บัญชีทดลองพร้อมข้อมูลตัวอย่าง 5 เดือน (ลบอัตโนมัติใน 24 ชั่วโมง) หรือดู [เอกสาร API](https://otto-api-14oc.onrender.com/docs)

## สถาปัตยกรรม

```
หน้าเว็บ (Next.js static บน GitHub Pages)
   │  HTTPS + Bearer token  (คนละโดเมน → CORS เฉพาะ github.io)
   ▼
Fastify 5 บน Render ── Zod ตรวจทุก request/response → OpenAPI /docs
   │  Drizzle ORM + postgres.js
   ▼
PostgreSQL (Neon) ── constraint กันข้อมูลผิดอีกชั้น
```

- **logic คำนวณเงินชุดเดียวกับหน้าเว็บ** (`@portfolio/tools/billing`) — ฝั่งเว็บคำนวณไว้แสดงตัวอย่าง แต่ยอดที่บันทึกจริงคำนวณที่ server เสมอ ยอดจึงตรงกันทุกสตางค์
- เก็บเงินเป็น **สตางค์ (integer)** ในฐานข้อมูล ไม่มีทศนิยมลอยตัว
- **multi-tenant**: ทุกเส้นทางอยู่ใต้ `/orgs/:orgId` ตรวจสิทธิ์ owner / staff / viewer — คนนอกร้านได้ 404 ไม่รู้ด้วยซ้ำว่ามีร้านนั้น
- 38 endpoints, 12 ตาราง, migration ด้วย drizzle-kit รันอัตโนมัติตอน deploy

## จุดที่ยากและวิธีแก้

**1. เลขที่เอกสารต้องไม่ซ้ำและไม่ข้าม** — ใช้ตารางตัวนับต่อ ร้าน × ประเภท × เดือน แล้ว `INSERT … ON CONFLICT DO UPDATE SET last = last + 1 RETURNING` ในคำสั่งเดียว แถวถูกล็อกจนจบ transaction · test ยิงสร้าง 30 ใบพร้อมกัน ได้ `INV-…-001` ถึง `-030` ครบ

**2. รับเงินซ้ำ / รับเกินยอด** — ล็อกใบแจ้งหนี้ด้วย `SELECT … FOR UPDATE` คำขอที่มาพร้อมกันจึงเข้าคิวและเห็นยอดค้างล่าสุด · test ยิงรับชำระ 20 ครั้งพร้อมกันบนยอดที่รับได้ 10 ครั้ง → สำเร็จ 10 พอดี ยอดคงค้างถูกต้อง

**3. เน็ตหลุดแล้วกดส่งซ้ำ** — การรับชำระบังคับ `Idempotency-Key` เก็บ key + hash ของคำขอ + ผลลัพธ์ใน transaction เดียวกับงานจริง ส่งซ้ำได้ผลเดิม (ไม่ออกใบเสร็จใบที่สอง) ใช้ key เดิมกับยอดอื่นได้ 422 · หน้าเว็บสร้าง key ใหม่เฉพาะเมื่อเนื้อหาคำขอเปลี่ยน

**4. สองคนแก้เอกสารเดียวกัน** — optimistic locking ด้วยคอลัมน์ `version` ส่ง version เก่ามาได้ 409 แทนการเขียนทับเงียบๆ

**5. ล็อกอินข้ามโดเมนโดยไม่ใช้ cookie** — หน้าเว็บอยู่บน github.io แต่ API อยู่บน onrender.com จึงใช้ access token (JWT 15 นาที) + refresh token ที่ **หมุนทุกครั้งที่ใช้** เก็บในฐานข้อมูลเป็น hash · ถ้า token เก่าถูกนำมาใช้อีก (สัญญาณว่าถูกขโมย) ยกเลิกทั้งตระกูล · เจอปัญหาจริงว่าเปิดสองแท็บแล้วแลก token พร้อมกันจนหลุด จึงเพิ่มช่วงผ่อนผัน 20 วินาที และให้ client แลก token ครั้งเดียว (single-flight) แล้วแชร์ผ่าน storage

## การทดสอบ

- **44 test ของ API รันกับ PostgreSQL จริง** (ทั้งในเครื่องและใน GitHub Actions ผ่าน service container) — ไม่ mock ฐานข้อมูล เพราะบั๊กที่สำคัญคือเรื่อง transaction และ lock
- 10 test ของตัวเชื่อมฝั่งเว็บ: refresh อัตโนมัติ, หลายคำขอแลก token ครั้งเดียว, แท็บอื่นแลกไปแล้ว, เซสชันถูกเพิกถอน
- ทดสอบ end-to-end ในเบราว์เซอร์: บัญชีทดลอง → ออกใบเสนอราคา → แปลงเป็นใบแจ้งหนี้ → รับชำระบางส่วน → รับเกินถูกปฏิเสธ → reload แล้วยังอยู่ → logout แล้วอีกแท็บออกตาม

## Deploy

GitHub Actions ตรวจ lint / typecheck / test (มี Postgres) / build ทุก push · Render build จาก `render.yaml` (Blueprint) และ deploy อัตโนมัติเมื่อไฟล์ใน `apps/api` หรือ `packages` เปลี่ยน · Neon เป็นฐานข้อมูล · `/health` ตรวจการเชื่อมต่อฐานข้อมูลจริง ใช้ทั้งเป็น health check และให้หน้าเว็บ "ปลุก" เซิร์ฟเวอร์แผนฟรีพร้อมแสดงสถานะรอ

ปัญหาที่เจอตอน deploy: connection string ของ Neon มี `channel_binding=require` ซึ่ง driver ไม่รองรับและทำให้เซิร์ฟเวอร์ล้มตอนเริ่ม — แก้ด้วยการ normalize URL ก่อนเชื่อมต่อ และให้ config ตรวจ env ทุกตัวตอนเริ่มแล้วบอกชัดว่าผิดตรงไหน

## ข้อจำกัดที่รู้อยู่

- token อยู่ใน localStorage — ถ้าเว็บโดน XSS จะถูกอ่านได้ (แลกกับการใช้ข้ามโดเมนได้โดยไม่ต้องมี cookie) ลดความเสี่ยงด้วยอายุ token สั้นและการตรวจจับการใช้ซ้ำ
- แผนฟรี: เซิร์ฟเวอร์หลับเมื่อไม่มีคนใช้ (ครั้งแรกรอ ~1 นาที) และฐานข้อมูลอยู่คนละ region กับเซิร์ฟเวอร์
- ยังไม่มีรีเซ็ตรหัสผ่านทางอีเมล และเชิญสมาชิกได้เฉพาะคนที่มีบัญชีแล้ว
