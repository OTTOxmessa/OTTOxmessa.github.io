---
title: { th: "เว็บ Portfolio นี้", en: "This portfolio site" }
summary:
  th: "Monorepo Next.js + TypeScript ที่ตรวจข้อมูลผลงานด้วย Zod ตอน build และ deploy อัตโนมัติขึ้น GitHub Pages ผ่าน GitHub Actions"
  en: "A Next.js + TypeScript monorepo that validates project content with Zod at build time and ships to GitHub Pages via GitHub Actions."
role: { th: "ทำคนเดียวทั้งหมด", en: "Solo — design, code, CI/CD" }
year: 2026
status: in-progress
layers: [frontend, infra]
stack: [Next.js, TypeScript, Zod, pnpm workspaces, Vitest, GitHub Actions, GitHub Pages]
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io
order: 5
snippet:
  file: .github/workflows/ci.yml
  code: |
    # ทุก push ขึ้น main
    - run: pnpm lint
    - run: pnpm typecheck
    - run: pnpm test
    - run: pnpm build # → GitHub Pages
metric: { label: "DEPLOY", value: "auto" }
---

## ภาพรวม

เว็บนี้เป็น static site ที่สร้างจากไฟล์ Markdown ใน repo ทุกครั้งที่ push ขึ้น `main` GitHub Actions จะ lint → typecheck → test → build แล้ว deploy ขึ้น GitHub Pages

## จุดที่ออกแบบไว้ให้ต่อยอด

- Schema ของข้อมูลอยู่ใน package `shared` ใช้ร่วมกับ API ในอนาคตได้
- หน้าเว็บอ่านข้อมูลผ่าน `lib/content.ts` ที่เดียว — ถ้าย้ายไปใช้ API + MongoDB ก็แก้แค่ไฟล์นี้
- ข้อมูลผลงานผิดรูปแบบจะทำให้ CI fail ก่อนขึ้นเว็บจริง
