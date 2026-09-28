/**
 * จำลองการทำงานของ sandbox แบบ online judge ทีละ system call
 * ไม่ได้รันโค้ดจริง — เป็นลำดับเหตุการณ์ที่เกิดขึ้นจริงบน Linux เมื่อ judge รันโปรแกรมที่ส่งมา
 */
import type { L } from "../i18n";

export type ScenarioId = "ok" | "tle" | "mle" | "socket" | "forkbomb";
export type Actor = "judge" | "child" | "kernel";
export type Outcome = "ok" | "info" | "limit" | "blocked";
export type VerdictCode = "AC" | "TLE" | "MLE" | "SV";

export type Step = {
  actor: Actor;
  call: string;
  result: string;
  outcome: Outcome;
  title: L;
  detail: L;
};

export type Verdict = {
  code: VerdictCode;
  label: L;
  explain: L;
  timeMs: number;
  memoryKb: number;
  status: string;
};

export const LIMITS = { cpuSeconds: 1, memoryMb: 64 } as const;
const PID = 4213;

export const SCENARIOS: { id: ScenarioId; title: L; hint: L; code: string }[] = [
  {
    id: "ok",
    title: { th: "โปรแกรมปกติ", en: "Well-behaved program" },
    hint: { th: "พิมพ์ข้อความแล้วจบ", en: "Prints a line and exits" },
    code: `#include <stdio.h>\n\nint main(void) {\n  printf("Hello, judge!\\n");\n  return 0;\n}`,
  },
  {
    id: "tle",
    title: { th: "ลูปไม่รู้จบ", en: "Infinite loop" },
    hint: { th: "ใช้ CPU เกินเวลาที่กำหนด", en: "Burns past the CPU limit" },
    code: `int main(void) {\n  volatile long i = 0;\n  while (1) i++;   // never ends\n}`,
  },
  {
    id: "mle",
    title: { th: "จองหน่วยความจำเกิน", en: "Memory hog" },
    hint: { th: "ขอ RAM 256 MB", en: "Asks for 256 MB of RAM" },
    code: `#include <stdlib.h>\n#include <string.h>\n\nint main(void) {\n  char *p = malloc(256 << 20); // 256 MB\n  memset(p, 1, 256 << 20);\n}`,
  },
  {
    id: "socket",
    title: { th: "แอบต่ออินเทอร์เน็ต", en: "Sneaky network call" },
    hint: { th: "เรียก socket()", en: "Calls socket()" },
    code: `#include <sys/socket.h>\n\nint main(void) {\n  int fd = socket(AF_INET, SOCK_STREAM, 0);\n  /* ...send the test cases home */\n}`,
  },
  {
    id: "forkbomb",
    title: { th: "Fork bomb", en: "Fork bomb" },
    hint: { th: "สร้าง process ไม่หยุด", en: "Spawns processes forever" },
    code: `#include <unistd.h>\n\nint main(void) {\n  while (1) fork();\n}`,
  },
];

const setup: Step[] = [
  {
    actor: "judge",
    call: "gcc -O2 main.c -o main",
    result: "exit 0",
    outcome: "info",
    title: { th: "คอมไพล์โค้ด", en: "Compile the submission" },
    detail: { th: "judge คอมไพล์โค้ดที่ส่งมาเป็นไฟล์ ./main", en: "The judge compiles the submission into ./main." },
  },
  {
    actor: "judge",
    call: "fork()",
    result: `= ${PID}`,
    outcome: "ok",
    title: { th: "แยก process ลูก", en: "Fork a child process" },
    detail: {
      th: `ได้ process ลูก PID ${PID} — ทุกอย่างต่อจากนี้เกิดใน process ลูก judge ไม่เสี่ยงเอง`,
      en: `Child PID ${PID} is created. Everything risky happens there, not in the judge.`,
    },
  },
  {
    actor: "child",
    call: `setrlimit(RLIMIT_CPU, {${LIMITS.cpuSeconds}, ${LIMITS.cpuSeconds}})`,
    result: "= 0",
    outcome: "ok",
    title: { th: "จำกัดเวลา CPU", en: "Cap CPU time" },
    detail: {
      th: `ใช้ CPU ได้ไม่เกิน ${LIMITS.cpuSeconds} วินาที เกินเมื่อไหร่ kernel ส่ง SIGXCPU`,
      en: `At most ${LIMITS.cpuSeconds}s of CPU. Past that, the kernel sends SIGXCPU.`,
    },
  },
  {
    actor: "child",
    call: `setrlimit(RLIMIT_AS, ${LIMITS.memoryMb} MB)`,
    result: "= 0",
    outcome: "ok",
    title: { th: "จำกัดหน่วยความจำ", en: "Cap memory" },
    detail: {
      th: `address space รวมไม่เกิน ${LIMITS.memoryMb} MB ขอเกินจะได้ ENOMEM`,
      en: `Address space capped at ${LIMITS.memoryMb} MB; bigger requests get ENOMEM.`,
    },
  },
  {
    actor: "child",
    call: "seccomp_load(filter)",
    result: "= 0",
    outcome: "ok",
    title: { th: "ติดตั้งตัวกรอง system call", en: "Install the syscall filter" },
    detail: {
      th: "อนุญาตแค่ read, write, brk, mmap, exit ฯลฯ — ถ้าเรียก socket, fork, clone, ptrace จะถูก kill ทันที",
      en: "Only read, write, brk, mmap, exit… are allowed. socket, fork, clone or ptrace kill the process.",
    },
  },
  {
    actor: "child",
    call: 'execve("./main", argv, envp)',
    result: "= 0",
    outcome: "ok",
    title: { th: "เริ่มรันโปรแกรม", en: "Replace the child with the program" },
    detail: {
      th: "process ลูกกลายเป็นโปรแกรมที่ส่งมา โดยยังติดข้อจำกัดทั้งหมดไว้",
      en: "The child becomes the submitted program — with every limit still attached.",
    },
  },
];

function wait(status: string, outcome: Outcome): Step {
  return {
    actor: "judge",
    call: `wait4(${PID}, &status, 0, &usage)`,
    result: `= ${PID}  ${status}`,
    outcome,
    title: { th: "เก็บผลลัพธ์", en: "Collect the result" },
    detail: {
      th: "judge อ่านสถานะการจบ เวลา CPU และหน่วยความจำสูงสุดจาก struct rusage",
      en: "The judge reads the exit status, CPU time and peak memory from struct rusage.",
    },
  };
}

type Run = { steps: Step[]; verdict: Verdict };

const RUNS: Record<ScenarioId, () => Run> = {
  ok: () => ({
    steps: [
      {
        actor: "child",
        call: 'write(1, "Hello, judge!\\n", 14)',
        result: "= 14",
        outcome: "ok",
        title: { th: "พิมพ์ผลลัพธ์", en: "Write output" },
        detail: { th: "write() อยู่ในรายการที่อนุญาต ผ่านตัวกรองได้", en: "write() is on the allow-list, so it passes the filter." },
      },
      {
        actor: "child",
        call: "exit_group(0)",
        result: "",
        outcome: "ok",
        title: { th: "จบการทำงาน", en: "Exit" },
        detail: { th: "โปรแกรมจบเองด้วย exit code 0", en: "The program exits on its own with code 0." },
      },
      wait("WIFEXITED, code 0", "ok"),
    ],
    verdict: {
      code: "AC",
      label: { th: "ผ่าน (Accepted)", en: "Accepted" },
      explain: { th: "จบปกติ ไม่เกินข้อจำกัด และผลลัพธ์ตรงกับคำตอบ", en: "Exited normally, within limits, and the output matched." },
      timeMs: 2,
      memoryKb: 1180,
      status: "exited(0)",
    },
  }),
  tle: () => ({
    steps: [
      {
        actor: "child",
        call: "/* while (1) i++; */",
        result: "CPU 1.00 s",
        outcome: "limit",
        title: { th: "ใช้ CPU ครบโควตา", en: "CPU quota used up" },
        detail: { th: "ลูปไม่เรียก system call เลย จึงมีแค่ RLIMIT_CPU ที่หยุดได้", en: "The loop makes no syscalls — only RLIMIT_CPU can stop it." },
      },
      {
        actor: "kernel",
        call: "kill(4213, SIGXCPU)",
        result: "",
        outcome: "limit",
        title: { th: "kernel ส่งสัญญาณ SIGXCPU", en: "Kernel sends SIGXCPU" },
        detail: { th: "เกินเวลา CPU → process ถูกหยุดด้วย signal", en: "CPU limit hit → the process is terminated by a signal." },
      },
      wait("WIFSIGNALED, SIGXCPU", "limit"),
    ],
    verdict: {
      code: "TLE",
      label: { th: "เกินเวลา (Time Limit Exceeded)", en: "Time Limit Exceeded" },
      explain: { th: "ถูกหยุดด้วย SIGXCPU เพราะใช้ CPU เกิน 1 วินาที", en: "Stopped by SIGXCPU after 1 s of CPU time." },
      timeMs: 1000,
      memoryKb: 1024,
      status: "signaled(SIGXCPU)",
    },
  }),
  mle: () => ({
    steps: [
      {
        actor: "child",
        call: "mmap(NULL, 268435456, PROT_READ|PROT_WRITE, …)",
        result: "= -1 ENOMEM",
        outcome: "limit",
        title: { th: "ขอหน่วยความจำ 256 MB", en: "Ask for 256 MB" },
        detail: { th: "เกิน RLIMIT_AS 64 MB → kernel ปฏิเสธ malloc() ได้ NULL", en: "Exceeds RLIMIT_AS (64 MB) → the kernel refuses; malloc() returns NULL." },
      },
      {
        actor: "kernel",
        call: "kill(4213, SIGSEGV)",
        result: "",
        outcome: "limit",
        title: { th: "เขียนลง NULL → SIGSEGV", en: "Writing to NULL → SIGSEGV" },
        detail: { th: "memset() เขียนลง pointer ว่าง process จึงล่ม", en: "memset() writes through the NULL pointer and the process crashes." },
      },
      wait("WIFSIGNALED, SIGSEGV", "limit"),
    ],
    verdict: {
      code: "MLE",
      label: { th: "เกินหน่วยความจำ (Memory Limit Exceeded)", en: "Memory Limit Exceeded" },
      explain: {
        th: "การขอหน่วยความจำล้มเหลวเพราะ RLIMIT_AS judge จึงตัดสินเป็น MLE แทน Runtime Error",
        en: "The allocation failed on RLIMIT_AS, so the judge reports MLE rather than a plain runtime error.",
      },
      timeMs: 1,
      memoryKb: 65536,
      status: "signaled(SIGSEGV)",
    },
  }),
  socket: () => ({
    steps: [
      {
        actor: "child",
        call: "socket(AF_INET, SOCK_STREAM, 0)",
        result: "",
        outcome: "blocked",
        title: { th: "เรียก socket()", en: "Call socket()" },
        detail: { th: "system call นี้ไม่อยู่ในรายการที่อนุญาต", en: "This syscall is not on the allow-list." },
      },
      {
        actor: "kernel",
        call: "seccomp → SECCOMP_RET_KILL_PROCESS",
        result: "SIGSYS",
        outcome: "blocked",
        title: { th: "seccomp kill ทันที", en: "seccomp kills it instantly" },
        detail: { th: "ยังไม่ทันเปิดการเชื่อมต่อ process ก็ถูกฆ่าด้วย SIGSYS", en: "Before any connection opens, the process is killed with SIGSYS." },
      },
      wait("WIFSIGNALED, SIGSYS", "blocked"),
    ],
    verdict: {
      code: "SV",
      label: { th: "ละเมิดความปลอดภัย (Security Violation)", en: "Security Violation" },
      explain: { th: "เรียก system call ต้องห้าม (socket)", en: "Called a forbidden syscall (socket)." },
      timeMs: 0,
      memoryKb: 900,
      status: "signaled(SIGSYS)",
    },
  }),
  forkbomb: () => ({
    steps: [
      {
        actor: "child",
        call: "clone(…) /* fork() */",
        result: "",
        outcome: "blocked",
        title: { th: "พยายาม fork()", en: "Try to fork()" },
        detail: { th: "fork() ใน glibc เรียก clone() ซึ่งถูกบล็อก", en: "glibc's fork() calls clone(), which is blocked." },
      },
      {
        actor: "kernel",
        call: "seccomp → SECCOMP_RET_KILL_PROCESS",
        result: "SIGSYS",
        outcome: "blocked",
        title: { th: "หยุดก่อนจะมี process ที่ 2", en: "Stopped before process #2 exists" },
        detail: { th: "fork bomb ไม่มีโอกาสทำให้เครื่องล่ม", en: "The fork bomb never gets to take the machine down." },
      },
      wait("WIFSIGNALED, SIGSYS", "blocked"),
    ],
    verdict: {
      code: "SV",
      label: { th: "ละเมิดความปลอดภัย (Security Violation)", en: "Security Violation" },
      explain: { th: "พยายามสร้าง process ใหม่ (clone)", en: "Tried to create a new process (clone)." },
      timeMs: 0,
      memoryKb: 900,
      status: "signaled(SIGSYS)",
    },
  }),
};

export function simulate(id: ScenarioId): Run {
  const run = RUNS[id]();
  return { steps: [...setup, ...run.steps], verdict: run.verdict };
}
