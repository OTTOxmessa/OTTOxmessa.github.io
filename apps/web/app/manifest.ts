import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/site";

export const dynamic = "force-static";

/** ให้ติดตั้งเป็นแอปบนมือถือได้ (Add to Home Screen) — เปิดตรงไปที่แอปจดรายรับรายจ่าย/หารบิลได้จาก shortcuts */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OTTO — Portfolio & Apps",
    short_name: "OTTO",
    start_url: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#0b7a6f",
    icons: [{ src: `${BASE_PATH}/icon.svg`, sizes: "any", type: "image/svg+xml" }],
    shortcuts: [
      { name: "หารบิล", url: `${BASE_PATH}/tools/bill-split/` },
      { name: "คำนวณเกรด", url: `${BASE_PATH}/tools/gpa/` },
      { name: "รายรับรายจ่าย", url: `${BASE_PATH}/tools/money/` },
    ],
  };
}
