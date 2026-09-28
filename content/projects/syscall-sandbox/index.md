---
title: "Syscall Sandbox Visualizer"
summary:
  th: "ดูทีละขั้นว่า online judge ใช้ fork, setrlimit, seccomp และ execve กันโค้ดอันตรายอย่างไร ลองส่งลูปไม่รู้จบหรือ fork bomb แล้วดูผลได้เลย"
  en: "Step through how an online judge uses fork, setrlimit, seccomp and execve to contain hostile code — try an infinite loop or a fork bomb."
role: { th: "ทำคนเดียว — ออกแบบ แอนิเมชัน และตัวจำลอง", en: "Solo — design, animation and the simulator" }
year: 2026
status: done
layers: [frontend, systems]
stack: [TypeScript, React, Linux syscalls, Vitest]
lab: /lab/syscall-sandbox/
links:
  github: https://github.com/OTTOxmessa/OTTOxmessa.github.io/tree/main/packages/labs/src/sandbox
order: 6
snippet:
  file: sandbox/index.ts
  code: |
    // ทุก scenario เริ่มด้วยลำดับเดียวกัน
    const setup = [fork, rlimitCpu, rlimitMem,
                   seccompLoad, execve];
    export function simulate(id: ScenarioId) {
      return [...setup, ...RUNS[id]().steps];
    }
metric: { label: "SCENARIOS", value: "5" }
---

## ทำไมถึงทำ

ต่อยอดจากโปรเจกต์วิชา Operating Systems (Secure Code Judge Sandbox) — อธิบายเรื่อง system call ด้วยคำพูดอย่างเดียวเข้าใจยาก เลยทำเป็นภาพที่กดเดินทีละขั้นได้

## ทำงานอย่างไร

- ตัวจำลองเป็นฟังก์ชัน TypeScript ล้วน `simulate(scenario)` คืนลำดับ system call และผลตัดสิน (AC / TLE / MLE / SV)
- มี unit test ตรวจว่าทุก scenario เรียก `fork → setrlimit → seccomp → execve` ตามลำดับ และจบด้วย `wait4`
- UI แยกบทบาท judge / process ลูก / kernel ให้เห็นว่าใครทำอะไร

## การเข้าถึง

- เดินทีละขั้นด้วยปุ่มหรือคีย์บอร์ด ไม่มีอะไรเล่นเองโดยไม่ได้กด
- ทุกขั้นประกาศผ่าน screen reader (aria-live)
- ถ้าตั้ง "ลดการเคลื่อนไหว" จะไม่มีแอนิเมชัน
