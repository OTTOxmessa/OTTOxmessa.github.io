# OTTO — Portfolio

เว็บ portfolio แบบ monorepo (Next.js + TypeScript) ที่ build เป็น static site และ deploy ขึ้น **GitHub Pages** อัตโนมัติด้วย GitHub Actions

โปรเจกต์นี้ทำตามแผน Full-stack ในเอกสารออกแบบเดิม **Phase 1–2** โดยปรับให้เข้ากับ GitHub Pages (ซึ่งรันได้แค่ไฟล์ static) — ข้อมูลผลงานจึงอยู่ในไฟล์ Markdown แทน MongoDB และโครงสร้างถูกเตรียมไว้ให้เพิ่ม API / Admin ภายหลังได้โดยไม่ต้องรื้อ

---

## โครงสร้าง

```
portfolio/
├── apps/web/                    # Next.js (output: "export")
│   ├── app/
│   │   ├── page.tsx             # หน้าแรก: hero + Stack Explorer, ผลงาน, Lab, เครื่องมือ, ติดต่อ
│   │   ├── lab/<ชื่อ>/page.tsx   # หน้า Lab ที่กดเล่นได้ (3 ชิ้น)
│   │   ├── projects/page.tsx    # รายการผลงาน + ตัวกรองตาม layer (?layer=backend)
│   │   ├── projects/[slug]/     # หน้า case study
│   │   ├── sitemap.ts, robots.ts
│   │   └── globals.css          # design tokens + สีของแต่ละ layer
│   ├── components/public/       # Header, StackExplorer, ProjectRow, WorkList, LabCard, T (สองภาษา)
│   ├── components/lab/          # UI ของแต่ละ Lab (SandboxApp, RebalancerApp, AggregationApp)
│   └── lib/content.ts           # ★ จุดเดียวที่อ่านข้อมูล (ตอนนี้อ่านไฟล์, อนาคตเปลี่ยนเป็น API)
├── packages/shared/             # Zod schemas + LAYERS ใช้ร่วมกันทุก app
├── packages/tools/              # logic ของแอปใช้งานจริง (พร้อมเพย์, หารบิล, เกรด, รายรับรายจ่าย) + test
├── packages/labs/               # logic ของ Lab เป็น TypeScript ล้วน + unit test (ไม่ผูกกับ React)
│   ├── src/sandbox/             # จำลองลำดับ system call ของ online judge
│   ├── src/rebalance/           # คำนวณการปรับสมดุลพอร์ต
│   └── src/aggregate/           # MongoDB aggregation engine ขนาดเล็ก + ข้อมูลตัวอย่าง
├── content/                     # ★ ข้อมูลทั้งหมดของเว็บ — แก้ตรงนี้
│   ├── profile.json            # ชื่อ, kicker, headline (*คำ* = เน้นสี), intro, อีเมล, ลิงก์
│   ├── skills.json             # ทักษะ แบ่งตาม group (ใส่ layer เพื่อให้ขึ้นใน Stack Explorer)
│   └── projects/<slug>/
│       ├── index.md             # frontmatter + เนื้อหาภาษาไทย
│       └── en.md                # เนื้อหาภาษาอังกฤษ (ไม่ใส่ก็ได้ จะใช้ภาษาไทยแทน)
└── .github/workflows/ci.yml     # lint → typecheck → test → build → deploy Pages
```

## เริ่มใช้งาน

ต้องมี Node.js 20+ และ pnpm (`corepack enable` หรือ `npm i -g pnpm`)

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # Vitest — ตรวจ schema และตรวจว่าไฟล์ใน content/ ถูกต้องทุกไฟล์
pnpm lint && pnpm typecheck
pnpm build        # ได้ static site ที่ apps/web/out
```

## เพิ่ม / แก้ผลงาน

1. สร้างโฟลเดอร์ `content/projects/<slug>/` (slug = ตัวพิมพ์เล็ก ตัวเลข ขีด เช่น `my-new-app`)
2. สร้าง `index.md`:

```markdown
---
title: { th: "ชื่อไทย", en: "English title" }   # หรือใส่ string เดียวถ้าเหมือนกันสองภาษา
summary: { th: "...", en: "..." }               # ไม่เกิน 200 ตัวอักษร
role: { th: "ส่วนที่ผมทำ", en: "What I did" }
team: { th: "ทีม 4 คน", en: "Team of 4" }       # ไม่บังคับ
year: 2026
status: done                                    # done | in-progress
layers: [frontend, backend, database]           # frontend | backend | database | infra | systems | ml
stack: [React, Express, MongoDB]
links:
  github: https://github.com/...
  demo: https://...
lab: /lab/my-demo/     # ถ้าเป็นเดโมที่อยู่ในเว็บนี้ → ขึ้นในส่วน Lab (ไม่บังคับ)
snippet:              # หน้าต่างโค้ดในหน้า case study (ไม่บังคับ, ไม่เกิน 600 ตัวอักษร)
  file: server/app.js
  code: |
    app.use('/api/auth', authRoutes);
metric: { label: "TEAM", value: "6" }   # ป้ายตัวเลขใต้หน้าต่างโค้ด (ไม่บังคับ)
order: 1              # เลขน้อยแสดงก่อน
published: true       # false = draft ไม่แสดงบนเว็บ
---

## ภาพรวม
เนื้อหา case study แบบ Markdown...
```

3. (ไม่บังคับ) สร้าง `en.md` สำหรับเนื้อหาภาษาอังกฤษ
4. commit + push ขึ้น `main` → เว็บอัปเดตเองใน ~1–2 นาที

ถ้าข้อมูลผิด (เช่น `status: finished`, ลิงก์ไม่ใช่ URL, summary ยาวเกิน) CI จะ fail พร้อมบอกชื่อไฟล์และ field ที่ผิด เว็บจริงจะไม่พัง

> แก้ได้จากหน้าเว็บ GitHub โดยตรง (กดไฟล์ → ✏️ Edit → Commit) ไม่ต้องเปิดคอมก็อัปเดตผลงานได้

**ตัวเลขใน hero** (ผลงานทั้งหมด / layer / ขึ้นใช้งานจริง) คำนวณจากไฟล์ผลงานอัตโนมัติ — ไม่ต้องแก้มือ

**เพิ่ม layer ใหม่** (เช่น mobile): เพิ่มใน `packages/shared/src/constants/layers.ts` แล้วเพิ่มสี `--layer-mobile` และ `[data-layer="mobile"]` ใน `apps/web/app/globals.css`

---

## แอปใช้งานจริง

| แอป | ทำอะไรได้ |
|---|---|
| [หารบิล + QR พร้อมเพย์](https://ottoxmessa.github.io/tools/bill-split/) | หารตามที่แต่ละคนกิน คิดค่าบริการ/VAT แล้วสร้าง QR พร้อมเพย์ยอดของแต่ละคน, แชร์บิลเป็นลิงก์ |
| [คำนวณเกรด GPA / GPAX](https://ottoxmessa.github.io/tools/gpa/) | GPA รายเทอม, GPAX, วางแผนว่าต้องได้เกรดเท่าไหร่, เกณฑ์เกียรตินิยม |
| [จดรายรับรายจ่าย](https://ottoxmessa.github.io/tools/money/) | จดเร็ว สรุปรายเดือน งบรายหมวด ส่งออก/นำเข้า CSV |

ทั้งหมดทำงานในเบราว์เซอร์ ข้อมูลเก็บใน localStorage ของผู้ใช้ ไม่มี server — logic อยู่ใน `packages/tools` พร้อม test (QR พร้อมเพย์ทดสอบเทียบกับไลบรารี `promptpay-qr`)

## Lab — โปรเจกต์เล็กที่กดเล่นได้

| Lab | ต่อยอดจาก | สิ่งที่โชว์ |
|---|---|---|
| [Syscall Sandbox Visualizer](https://ottoxmessa.github.io/lab/syscall-sandbox/) | Secure Code Judge (วิชา OS) | fork / setrlimit / seccomp / execve / wait4 ทีละขั้น |
| [Portfolio Rebalancer](https://ottoxmessa.github.io/lab/portfolio-rebalancer/) | ระบบจัดการพอร์ต (CP353002) | algorithm ซื้อ/ขาย และแบบซื้ออย่างเดียว |
| [Aggregation Playground](https://ottoxmessa.github.io/lab/aggregation-playground/) | Boardgame Everyday | query engine ที่เขียนเอง ดูผลทุก stage |

logic ทั้งหมดอยู่ใน `packages/labs` แยกจาก UI จึงทดสอบได้ด้วย `pnpm test` โดยไม่ต้องเปิดเบราว์เซอร์

**เพิ่ม Lab ใหม่:** เขียน logic ใน `packages/labs/src/<ชื่อ>/` + test → สร้าง UI ใน `apps/web/components/lab/` → หน้า `apps/web/app/lab/<ชื่อ>/page.tsx` (ก๊อปจาก lab อื่น) → สร้างไฟล์ผลงานใน `content/projects/<ชื่อ>/` พร้อม `lab: /lab/<ชื่อ>/`

## การเข้าถึง (Accessibility)

ออกแบบให้ผ่าน WCAG 2.2 AA — ตรวจด้วย axe-core ทั้ง 2 ธีม × 2 ภาษา × desktop/mobile ได้ 0 violation

- สีทุกคู่ contrast ≥ 4.5:1, ขอบช่องกรอก ≥ 3:1, รองรับ `prefers-contrast: more`
- ใช้งานด้วยคีย์บอร์ดได้ทั้งหมด: skip link, focus ring ชัด, ปุ่มกรองใช้ `aria-pressed`, `Esc` ปิดเมนูมือถือ
- ปุ่ม/ลิงก์สูง ≥ 44px, ไม่ล้นจอที่ความกว้าง 320px (ซูม 400%)
- ฟอร์มมี label ทุกช่อง, แจ้ง error ด้วย `role="alert"` และย้าย focus ไปช่องที่ผิด
- แอนิเมชันพิมพ์โค้ดปิดเองเมื่อผู้ใช้ตั้ง "ลดการเคลื่อนไหว" (reduce motion)
- ภาษาไทยไม่ใช้ letter-spacing และใส่ `lang` ถูกต้อง ให้ screen reader อ่านสำเนียงถูก
- จำนวนผลงานที่กรองแล้วประกาศผ่าน `aria-live`
- ฟอร์มติดต่อเปิดแอปอีเมล (เพราะเว็บ static ไม่มี server) และมีปุ่มคัดลอกอีเมลสำรอง

## Deploy ขึ้น GitHub Pages

1. สร้าง repo ใหม่บน GitHub
   - **แนะนำ:** ตั้งชื่อ `OTTOxmessa.github.io` → เว็บอยู่ที่ `https://ottoxmessa.github.io/`
   - ถ้าใช้ชื่ออื่น เช่น `portfolio` → เว็บอยู่ที่ `https://ottoxmessa.github.io/portfolio/` (workflow ตั้ง base path ให้เอง)
2. Push โค้ด:
   ```bash
   git init -b main
   git add .
   git commit -m "Initial portfolio"
   git remote add origin https://github.com/OTTOxmessa/OTTOxmessa.github.io.git
   git push -u origin main
   ```
3. ใน repo ไปที่ **Settings → Pages → Build and deployment → Source** เลือก **GitHub Actions**
4. ดูสถานะที่แท็บ **Actions** — เสร็จแล้วลิงก์เว็บจะแสดงใน job `deploy`
5. ถ้าเปลี่ยนชื่อ repo ให้แก้ลิงก์ใน `content/projects/portfolio-site/index.md` ด้วย

### Custom domain (ไม่บังคับ)
Settings → Pages → Custom domain แล้วตั้ง DNS ตามที่ GitHub บอก (CNAME ไปที่ `ottoxmessa.github.io`)

---

## ข้อจำกัดของ GitHub Pages และทางออก

| ข้อจำกัด | ผลกระทบ | ทางออก |
|---|---|---|
| รันได้แค่ไฟล์ static ไม่มี server | ไม่มี Express API, MongoDB, หน้า Admin, login | ตอนนี้แก้ผลงานผ่านไฟล์ใน `content/` (แก้บนเว็บ GitHub ได้) |
| ไม่มี ISR / server actions / route handlers แบบ dynamic | ข้อมูลเปลี่ยน = ต้อง build ใหม่ | Actions build ให้อัตโนมัติทุก push (~1–2 นาที) |
| ฟอร์มติดต่อส่งข้อมูลไม่ได้ | ใช้ `mailto:` แทน | ถ้าต้องการฟอร์มจริง ใช้ Formspree / Web3Forms (ฟรี) หรือรอทำ API |
| แผนฟรีต้องเป็น **public repo** | ทุกคนเห็นโค้ดและไฟล์ใน repo | ห้าม commit `.env` / secret ใดๆ (มีใน `.gitignore` แล้ว) |
| next/image ปรับขนาดรูปไม่ได้ | รูปโหลดขนาดเต็ม | ย่อรูปก่อนใส่ `public/` หรือใช้ Cloudinary URL |
| `robots.txt` ใช้ได้เฉพาะเมื่อเว็บอยู่ที่ root domain | ถ้า repo ไม่ได้ชื่อ `<user>.github.io` ไฟล์นี้ไม่มีผล | ตั้งชื่อ repo เป็น `OTTOxmessa.github.io` |
| จำกัด ~1 GB ต่อเว็บ, bandwidth ~100 GB/เดือน | เกินพอสำหรับ portfolio | — |

---

## แผนต่อยอด (จากเอกสารออกแบบเดิม)

### ✅ Phase 1: รากฐาน
- [x] monorepo pnpm workspaces, ESLint, Prettier, TypeScript
- [x] package `shared` (Zod schemas + layers)
- [x] อ่านข้อมูลจาก Markdown พร้อม validate (แทน DB ในเวอร์ชัน static)
- [ ] Docker Compose สำหรับ MongoDB — ทำตอนเริ่ม Phase 3

### ✅ Phase 2: หน้าเว็บสาธารณะ
- [x] หน้าแรก + แผนภาพ layer, หน้ารายการผลงาน + ตัวกรอง, หน้า case study
- [x] สองภาษา TH/EN, โหมดมืด/สว่าง (จำค่าไว้)
- [x] Metadata, Open Graph, sitemap
- [x] Vitest + GitHub Actions CI + deploy GitHub Pages
- [ ] OG image รายผลงาน

### Phase 3: Admin + API (ต้องย้ายออกจาก GitHub Pages บางส่วน)
เมื่อต้องการ Admin/API จริง มี 2 ทาง:

- **A — เก็บหน้าเว็บไว้บน GitHub Pages** + เพิ่ม `apps/api` (Express) บน Render/Railway + MongoDB Atlas
  หน้าเว็บ build จาก API ตอน build (ใช้ webhook สั่ง rebuild เมื่อแก้ข้อมูล), หน้า `/admin` เป็น client-side เรียก API ตรง
  ⚠️ web กับ API อยู่คนละโดเมน → cookie ต้องตั้ง `SameSite=None; Secure` และ Safari อาจบล็อก third-party cookie; ทางแก้คือใช้ custom domain เดียวกัน (เช่น `otto.dev` + `api.otto.dev`)
- **B — ย้ายหน้าเว็บไป Vercel** (ยัง deploy จาก GitHub อัตโนมัติเหมือนเดิม) ได้ ISR และ route handlers ครบตามแผนเดิม

ทั้งสองทางแก้แค่ `apps/web/lib/content.ts` ให้ดึงจาก API — schema ใน `packages/shared` ใช้ต่อได้เลย (มี `contactSchema` เตรียมไว้แล้ว)

### Phase 4
- [ ] ฟอร์มติดต่อ + หน้าดูข้อความ
- [ ] E2E test ด้วย Playwright
- [ ] Custom domain
