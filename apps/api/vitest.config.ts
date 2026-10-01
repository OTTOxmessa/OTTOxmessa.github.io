import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // test ทุกไฟล์ใช้ฐานข้อมูลเดียวกัน — รันทีละไฟล์เพื่อไม่ให้ชนกัน
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
