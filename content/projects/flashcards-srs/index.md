---
title: { th: "บัตรคำทวนสอบ (Spaced Repetition)", en: "Flashcards with Spaced Repetition" }
summary:
  th: "ท่องศัพท์/สูตรด้วยอัลกอริทึม SM-2 — ระบบเลือกบัตรที่ใกล้ลืมมาให้ทบทวนทุกวัน วางคำศัพท์จาก Excel ได้ มีโหมดเลือกตอบ คีย์ลัด และสถิติ"
  en: "Learn vocab or formulas with SM-2 — cards return right before you'd forget. Paste from a spreadsheet, multiple-choice mode, shortcuts and stats."
role: { th: "ทำคนเดียว — อัลกอริทึม, UI และ test", en: "Solo — algorithm, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, SM-2, Vitest]
app: /tools/flashcards/
featured: true
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 4
snippet:
  file: tools/srs.ts
  code: |
    // SM-2: จำได้ → เว้นระยะนานขึ้น, ลืม → กลับมาพรุ่งนี้
    if (q < 3) { reps = 0; interval = 1; }
    else {
      reps += 1;
      interval = reps === 1 ? 1 : reps === 2 ? 6
        : Math.round(interval * ease);
    }
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
metric: { label: "TESTS", value: "6" }
---

## ปัญหา

ท่องศัพท์แบบอ่านทวนทั้งลิสต์ทุกวันเสียเวลากับคำที่จำได้แล้ว แต่ถ้าไม่ทวนเลยก็ลืม — งานวิจัยเรื่อง *spaced repetition* บอกว่าทบทวน **ตอนที่ใกล้จะลืม** ได้ผลที่สุด

## ใช้ยังไง

1. สร้างชุดบัตร แล้ว **วางคำศัพท์สองคอลัมน์จาก Excel/Google Sheets** หรือพิมพ์ "คำ - ความหมาย" ทีละบรรทัด (ระบบข้ามคำซ้ำให้)
2. กด "ทบทวน" — ดูด้านหน้า นึกคำตอบ กด `Space` ดูเฉลย
3. ให้คะแนนตัวเอง `1` ลืม · `2` ยาก · `3` จำได้ · `4` ง่ายมาก — **ปุ่มบอกล่วงหน้าว่าจะถามอีกทีเมื่อไร** (เช่น 1 วัน / 6 วัน / 15 วัน)
4. หรือเปิด **โหมดเลือกตอบ** — ระบบสุ่มตัวเลือกหลอกจากคำตอบของบัตรอื่นในชุด

## จุดที่ตั้งใจทำ

- ใช้อัลกอริทึม **SM-2** (SuperMemo) แบบมาตรฐาน มี test ตรวจลำดับช่วงห่าง 1 → 6 → interval × ease และค่า ease ไม่ต่ำกว่า 1.3
- จำกัดบัตรใหม่ต่อวัน ไม่ให้งานพอกในวันต่อๆ ไป
- บัตรที่ตอบ "ลืม" ถูกต่อท้ายคิวให้ถามซ้ำในรอบเดียวกัน
- สถิติ: บัตรที่จะถึงกำหนด 7 วัน ทบทวนต่อเนื่องกี่วัน อัตราการจำได้ และบัตรที่ลืมบ่อย
- คีย์ลัดครบ ใช้ได้โดยไม่ต้องแตะเมาส์

## ข้อมูล

เก็บในเบราว์เซอร์เครื่องนี้ ส่งออก CSV / สำรองเป็น JSON ได้
