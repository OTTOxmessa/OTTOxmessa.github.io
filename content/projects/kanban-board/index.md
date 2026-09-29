---
title: { th: "บอร์ดจัดการงาน (Kanban)", en: "Kanban Task Board" }
summary:
  th: "บอร์ดงานแบบ Trello — หลายบอร์ด ลากวางการ์ด (หรือใช้คีย์บอร์ด) ป้ายกำกับ กำหนดส่ง เช็กลิสต์ จำกัดงานพร้อมกัน (WIP) ตัวกรอง และส่งออก/นำเข้าบอร์ด"
  en: "A Trello-style board — multiple boards, drag-and-drop (or keyboard) cards, labels, due dates, checklists, WIP limits, filters, and board import/export."
role: { th: "ทำคนเดียว — logic, UI, การเข้าถึง และ test", en: "Solo — logic, UI, accessibility and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, HTML5 Drag & Drop, WAI-ARIA, Vitest]
app: /tools/kanban/
featured: true
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 3
snippet:
  file: tools/kanban.ts
  code: |
    // Alt+ลูกศร: ซ้าย/ขวา = เปลี่ยนคอลัมน์, ขึ้น/ลง = ลำดับ
    export function nudge(board, cardId, dir) {
      const { columnIndex, index } = findCard(board, cardId)!;
      const target = board.columns[columnIndex + (dir === "left" ? -1 : 1)];
      return target
        ? moveCard(board, cardId, target.id, index)
        : board;
    }
metric: { label: "TESTS", value: "6" }
---

## ปัญหา

งานกลุ่มหรืองานส่วนตัวที่มีหลายขั้นตอน ถ้าจดเป็นลิสต์ธรรมดาจะมองไม่เห็นว่าอะไรค้างอยู่ตรงไหน บอร์ด Kanban ช่วยได้ แต่บอร์ดส่วนใหญ่ **ลากวางได้อย่างเดียว** คนที่ใช้คีย์บอร์ดหรือ screen reader ย้ายการ์ดไม่ได้

## ทำอะไรได้

- หลายบอร์ด เพิ่ม/ลบ/เรียงคอลัมน์ได้ ตั้ง **WIP limit** (เตือนเมื่องานในคอลัมน์เกินที่ตั้งไว้)
- การ์ดมีรายละเอียด ป้ายกำกับสี กำหนดส่ง (เตือนเลยกำหนด / วันนี้ / ใกล้ถึง) และเช็กลิสต์พร้อมแถบความคืบหน้า
- **ลากวาง** การ์ดข้ามคอลัมน์ พร้อมเส้นบอกตำแหน่งที่จะวาง
- **ย้ายด้วยคีย์บอร์ด** — โฟกัสการ์ดแล้วกด `Alt` + ลูกศร ระบบประกาศตำแหน่งใหม่ให้ screen reader ("ย้ายไป กำลังทำ ลำดับที่ 1 จาก 3")
- ค้นหา กรองตามป้ายหรือกำหนดส่ง และมุมมองตารางสำหรับดูทุกการ์ดเรียงตามวันส่ง
- ส่งออกบอร์ดเป็นไฟล์ JSON ให้เพื่อนร่วมทีมนำเข้า (ตรวจโครงสร้างไฟล์ก่อนนำเข้า)

## จุดที่ตั้งใจทำ

- logic เป็น immutable ทุกฟังก์ชันคืนบอร์ดใหม่ ทดสอบง่ายและไม่มีบั๊กข้อมูลถูกแก้ซ้อน
- การลากวางมี **ทางเลือกที่ไม่ต้องลาก** เสมอ (คีย์บอร์ด + เลือกคอลัมน์ในหน้ารายละเอียด) ตาม WCAG 2.2 ข้อ 2.5.7 Dragging Movements
