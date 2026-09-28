---
title: "Secure Code Judge Sandbox"
summary:
  th: "ตัวรันโค้ดแบบ online judge ที่คอมไพล์และรันโค้ดที่ไม่น่าไว้ใจอย่างปลอดภัย จำกัดเวลา/หน่วยความจำ และบล็อก system call อันตราย"
  en: "An online-judge style runner that compiles and runs untrusted code safely — time/memory limits and dangerous syscalls blocked."
role: { th: "สมาชิกทีม — วิชา Operating Systems and System Calls Programming", en: "Team member — Operating Systems and System Calls Programming" }
team: { th: "ทีม 3 คน", en: "Team of 3" }
year: 2026
status: in-progress
layers: [systems]
stack: [C, Linux, fork/execve, setrlimit, seccomp, signals]
order: 4
---

## ภาพรวม

Sandbox สำหรับรันโค้ดที่ส่งเข้ามาแบบ online judge โดยใช้ system call ของ Linux โดยตรง

## หลักการทำงาน

1. `fork()` แยก process ลูกสำหรับโค้ดที่จะรัน
2. ตั้งขีดจำกัดด้วย `setrlimit()` (CPU time, memory)
3. กรอง system call อันตรายด้วย `seccomp`
4. `execve()` รันโปรแกรม และใช้ `alarm()` / signal กันโปรแกรมค้าง
5. `wait4()` เก็บผลลัพธ์ เวลา และหน่วยความจำที่ใช้

มีแผนทำเว็บเดโมที่แสดงแต่ละขั้นตอนด้วยแอนิเมชัน
