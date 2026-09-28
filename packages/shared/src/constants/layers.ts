/**
 * Layer ของระบบที่ใช้จัดกลุ่มผลงาน
 * เพิ่ม layer ใหม่: เพิ่ม object ในอาร์เรย์นี้ แล้วกำหนดสี `--layer-<id>` ใน apps/web/app/globals.css
 */
export const LAYERS = [
  { id: "frontend", label: { th: "Frontend", en: "Frontend" }, hint: { th: "UI ที่ผู้ใช้เห็น", en: "What users see" } },
  { id: "backend", label: { th: "Backend / API", en: "Backend / API" }, hint: { th: "business logic และ API", en: "Business logic & APIs" } },
  { id: "database", label: { th: "Database", en: "Database" }, hint: { th: "ออกแบบและจัดการข้อมูล", en: "Data modelling & storage" } },
  { id: "infra", label: { th: "Deploy & Infra", en: "Deploy & Infra" }, hint: { th: "CI/CD, cloud, deploy", en: "CI/CD, cloud, deploy" } },
  { id: "systems", label: { th: "Systems / OS", en: "Systems / OS" }, hint: { th: "system call, process, security", en: "Syscalls, processes, security" } },
  { id: "ml", label: { th: "Machine Learning", en: "Machine Learning" }, hint: { th: "โมเดลและข้อมูล", en: "Models & data" } },
] as const;

export type LayerId = (typeof LAYERS)[number]["id"];

export const LAYER_IDS = LAYERS.map((l) => l.id) as [LayerId, ...LayerId[]];
