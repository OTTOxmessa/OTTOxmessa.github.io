---
title: "Aggregation Playground"
summary:
  th: "ลองเขียน MongoDB aggregation pipeline กับข้อมูลการเล่นบอร์ดเกม แล้วดูข้อมูลเปลี่ยนไปทีละ stage — engine เขียนเองทั้งหมด รันในเบราว์เซอร์"
  en: "Write a MongoDB aggregation pipeline against board-game play data and watch the documents change stage by stage — a hand-written engine that runs in the browser."
role: { th: "ทำคนเดียว — query engine, UI และ test", en: "Solo — query engine, UI and tests" }
year: 2026
status: done
layers: [frontend, database]
stack: [TypeScript, React, MongoDB, Vitest]
lab: /lab/aggregation-playground/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/labs/src/aggregate
order: 18
snippet:
  file: aggregate/engine.ts
  code: |
    // คืนผลหลัง "ทุก" stage ให้ UI ไล่ดูได้
    export function runPipeline(docs, pipeline) {
      const outputs = [];
      pipeline.forEach((stage, i) =>
        outputs.push(docs = runStage(docs, stage, i)));
      return outputs;
    }
metric: { label: "STAGES", value: "7" }
---

## ทำไมถึงทำ

ใน Boardgame Everyday ผมดูแลส่วนสถิติที่ใช้ aggregation pipeline — ตอนเขียนจริงมักงงว่าข้อมูลหน้าตาเป็นยังไงระหว่างแต่ละ stage เลยทำเครื่องมือที่เห็นผลทุก stage

## Engine

- รองรับ `$match` (`$gt $gte $lt $lte $in $nin $ne $exists $or $and`), `$group` (`$sum $avg $min $max $count $first $last $push $addToSet`), `$sort`, `$limit`, `$skip`, `$project`, `$count`
- บอกได้ว่า stage ไหนผิดและผิดเพราะอะไร
- ไม่แก้ข้อมูลต้นฉบับ (immutable) — มี test ตรวจ

## การเข้าถึง

- ผลลัพธ์เป็นตาราง HTML จริง อ่านด้วย screen reader ได้
- ข้อความ error ผูกกับช่องแก้ไข และประกาศทันที
