---
title: { th: "ระบบจัดการพอร์ตลงทุน", en: "Investment Portfolio Manager" }
summary:
  th: "ระบบติดตามพอร์ตลงทุนคล้าย Google Finance — สัดส่วนสินทรัพย์ แนวรับแนวต้าน แจ้งเตือนราคา และ rebalancing ด้วยราคาจริงจาก Yahoo Finance"
  en: "A Google Finance–style portfolio tracker — allocation, support/resistance, price alerts and rebalancing with live Yahoo Finance prices."
role: { th: "Full-stack Developer (โปรเจกต์วิชา CP353002)", en: "Full-stack Developer (CP353002 course project)" }
year: 2026
status: in-progress
layers: [frontend, backend, database]
stack: [Java, Spring Boot, React, Yahoo Finance API]
featured: true
order: 3
snippet:
  file: RebalanceController.java
  code: |
    // สัดส่วนเพี้ยนจากเป้า → แนะนำการ rebalance
    @GetMapping("/portfolios/{id}/rebalance")
    public List<Trade> rebalance(@PathVariable Long id) {
      return rebalancer.suggest(portfolios.get(id));
    }
metric: { label: "FEATURES", value: "5" }
---

## ภาพรวม

โปรเจกต์วิชา Principles of Software Design and Development (CP353002) ใช้ Spring Boot เป็น backend และ React เป็น frontend

## ฟีเจอร์ที่วางแผน

- สัดส่วนสินทรัพย์ (asset allocation)
- แนวรับ–แนวต้าน (support / resistance)
- แจ้งเตือนเมื่อราคาถึงเป้า
- เปรียบเทียบการเติบโตของพอร์ตกับตลาด
- คำแนะนำการ rebalance
