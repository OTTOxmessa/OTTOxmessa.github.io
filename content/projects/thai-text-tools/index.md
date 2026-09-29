---
title: { th: "อ่านจำนวนเงิน & วันที่ไทย", en: "Thai Baht Text & Dates" }
summary:
  th: "แปลงตัวเลขเป็นคำอ่านเงินบาทแบบ BAHTTEXT และภาษาอังกฤษสำหรับใบเสร็จ/ใบแจ้งหนี้ แปลงวันที่แบบไทย พ.ศ.↔ค.ศ. เลขไทย และนับวัน/คำนวณอายุ"
  en: "Baht amounts in Thai words (like Excel BAHTTEXT) and English for invoices, Thai date formats, BE↔CE years, Thai numerals, and day/age counting."
role: { th: "ทำคนเดียว — logic, UI และ test", en: "Solo — logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, Vitest]
app: /tools/thai-text/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 8
snippet:
  file: tools/thai-text.ts
  code: |
    // กฎ "เอ็ด": 1 ในหลักหน่วยเมื่อมีหลักที่สูงกว่า
    else if (place === 0)
      out += d === 1 && (hasHigher || n > 9)
        ? "เอ็ด" : DIGITS[d];
    // 1,000,001 → หนึ่งล้านเอ็ดบาทถ้วน
metric: { label: "TESTS", value: "22" }
---

## ใช้ทำอะไร

- **จำนวนเงินเป็นตัวหนังสือ**: 15,999.95 → หนึ่งหมื่นห้าพันเก้าร้อยเก้าสิบเก้าบาทเก้าสิบห้าสตางค์ — สำหรับใบเสร็จ เช็ค สัญญา
- **ภาษาอังกฤษสำหรับ invoice**: "Fifteen thousand nine hundred and ninety-nine baht and ninety-five satang only"
- **วันที่แบบไทย**: แบบหนังสือราชการ แบบเต็ม แบบย่อ ตัวเลข และเลขไทย
- **พ.ศ. ↔ ค.ศ.**, **เลขไทย ↔ อารบิก**, **นับวัน/คำนวณอายุ** เป็นปี เดือน วัน
- ทุกผลลัพธ์มีปุ่มคัดลอก

## ความถูกต้อง

- ผลลัพธ์ตรงกับฟังก์ชัน BAHTTEXT ของ Excel — test 17 กรณี รวมกรณีที่มักผิด เช่น 101, 1,000,001 (หนึ่งล้าน**เอ็ด**), 11,000,000, สตางค์ และการปัดเศษ
- รองรับหลักล้านล้าน
- นับเดือนแบบปฏิทินจริง (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) และคิดปีอธิกสุรทิน
