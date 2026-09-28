import type { NextConfig } from "next";

/**
 * Static export สำหรับ GitHub Pages
 * - NEXT_PUBLIC_BASE_PATH: GitHub Actions ตั้งให้อัตโนมัติ (เช่น "/portfolio")
 *   ถ้า repo ชื่อ <username>.github.io ค่านี้จะว่าง
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@portfolio/shared"],
};

export default nextConfig;
