---
title: { th: "ระบบขายหน้าร้าน (POS)", en: "Point of Sale (POS)" }
summary:
  th: "ระบบขายหน้าร้านครบวงจร — ขาย ตัดสต็อก รับเงินสด/QR พร้อมเพย์ พิมพ์ใบเสร็จ ดูยอดขายรายชั่วโมง/7 วัน และสินค้าขายดี ใช้บนแท็บเล็ตได้"
  en: "A complete shop till — sell, track stock, take cash or PromptPay QR, print receipts, and see hourly/7-day sales and best sellers. Tablet-friendly."
role: { th: "ทำคนเดียว — ออกแบบระบบ logic, UI และ test", en: "Solo — system design, logic, UI and tests" }
year: 2026
status: done
layers: [frontend]
stack: [TypeScript, React, EMVCo QR, Print CSS, Vitest]
app: /tools/pos/
featured: true
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/tools/src
order: 1
snippet:
  file: tools/pos.ts
  code: |
    // คิดเป็นสตางค์ (จำนวนเต็ม) กันเศษทศนิยมเพี้ยน
    const s = (baht: number) => Math.round(baht * 100);
    const t = totals(cart, discount);
    if (method === "cash" && change(t.total, received) === null)
      throw new Error("รับเงินไม่พอ");
    // ขายแล้วตัดสต็อก / ยกเลิกบิลแล้วคืนสต็อก
    return { products: adjustStock(products, cart, -1), sale };
metric: { label: "VIEWS", value: "5" }
---

## ปัญหา

ร้านเล็กๆ อย่างร้านกาแฟหรือร้านขนม มักจดยอดใส่สมุด ปิดร้านแล้วต้องมานั่งรวมเงิน ไม่รู้ว่าชั่วโมงไหนขายดี ของอะไรใกล้หมด ส่วนโปรแกรม POS ส่วนใหญ่ต้องสมัครสมาชิกรายเดือน

## ทำอะไรได้

- **ขาย** — ค้นหาสินค้า (กด `/`), กรองหมวด, กดเพิ่มลงตะกร้า ปรับจำนวน ใส่ส่วนลดเป็นบาทหรือ %
- **รับเงิน** — เงินสดมีปุ่มแบงก์ลัด (เช่น 100 / 500 / 1000) คำนวณเงินทอนให้ หรือแสดง **QR พร้อมเพย์ยอดตรงบิล** ให้ลูกค้าสแกน
- **ใบเสร็จ** — พิมพ์ได้ทันที (ขนาดกระดาษความร้อน 80 มม.) หรือเปิดดู/พิมพ์ซ้ำจากประวัติ
- **สินค้า & สต็อก** — เลือกได้ว่าสินค้าไหนนับสต็อก ตั้งจุดเตือนใกล้หมด ระบบเตือนก่อนขายเกินของที่มี
- **ยกเลิกบิล** — คืนสต็อกอัตโนมัติ และไม่นับในยอดขาย
- **รายงาน** — ยอดขาย จำนวนบิล ค่าเฉลี่ยต่อบิล แยกเงินสด/พร้อมเพย์ กราฟรายชั่วโมง 7 วันล่าสุด สินค้าขายดี และส่งออก CSV

## จุดที่ตั้งใจทำ

- เงินทั้งหมดคำนวณเป็น **สตางค์ (จำนวนเต็ม)** ส่วนลด % ไม่ทำให้ยอดเพี้ยน 0.01
- logic ทั้งหมดเป็นฟังก์ชันบริสุทธิ์ (ขาย ยกเลิก สรุปยอด) แยกจาก UI และมี test ครอบคลุม
- ใช้คีย์บอร์ดได้ทั้งระบบ กล่องชำระเงินเป็น `<dialog>` ที่ดัก focus และปิดด้วย Esc
- ปุ่มใหญ่ กดง่ายบนแท็บเล็ต แท็บจำไว้ใน URL กดย้อนกลับได้

## ข้อมูล

เก็บในเบราว์เซอร์เครื่องนี้ (localStorage) ไม่มี server — มีปุ่มสำรอง/กู้คืนเป็นไฟล์ JSON
