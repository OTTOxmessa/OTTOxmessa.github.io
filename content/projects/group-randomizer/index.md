---
title: { th: "สุ่มแบ่งกลุ่ม / สุ่มชื่อ", en: "Group Maker & Name Picker" }
summary:
  th: "วางรายชื่อแล้วสุ่มแบ่งกลุ่มให้ขนาดเท่ากัน ตั้งคู่ที่ห้ามอยู่กลุ่มเดียวกันได้ มีรหัสการสุ่มให้ตรวจสอบได้ว่ายุติธรรม และสุ่มเลือกคนตอบคำถาม"
  en: "Paste a class list to make even groups, keep certain pairs apart, share a shuffle code that proves the draw was fair, or pick someone at random."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, Seeded PRNG, Vitest]
app: /tools/groups/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 7
snippet:
  file: tools/groups.ts
  code: |
    // Fisher–Yates + PRNG ที่กำหนด seed ได้
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
metric: { label: "TESTS", value: "7" }
---

## ใช้ทำอะไร

- วางรายชื่อจาก Excel หรือ LINE (ตัดเลขลำดับและชื่อซ้ำให้เอง)
- แบ่งตาม **จำนวนกลุ่ม** หรือ **จำนวนคนต่อกลุ่ม** — ขนาดกลุ่มต่างกันไม่เกิน 1 คน
- ตั้ง **คู่ที่ห้ามอยู่กลุ่มเดียวกัน** ได้
- **รหัสการสุ่ม**: รหัสเดิม + รายชื่อเดิม = ผลเดิมทุกครั้ง ครูบอกรหัสให้นักเรียนตรวจได้ว่าไม่ได้ล็อกผล
- **สุ่มเลือก 1 คน** แบบไม่ซ้ำคนเดิม พร้อมประวัติ
- คัดลอกผลไปวางใน LINE ได้

## รายละเอียดทางเทคนิค

- สับรายชื่อด้วย Fisher–Yates และ PRNG mulberry32 ที่กำหนด seed ได้ (Math.random กำหนด seed ไม่ได้)
- แจกคนแบบวนทีละกลุ่มเพื่อให้ขนาดเท่ากัน แล้วค้นหาการสุ่มที่ละเมิดเงื่อนไขน้อยที่สุด ถ้าเป็นไปไม่ได้จะบอกตรงๆ
- แอนิเมชันตอนสุ่มปิดเองเมื่อตั้ง "ลดการเคลื่อนไหว" และประกาศผลให้ screen reader
