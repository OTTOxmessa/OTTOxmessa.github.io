export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ottoxmessa.github.io").replace(/\/$/, "");
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL เต็มของหน้า (ใช้กับ sitemap / canonical / OG) */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${BASE_PATH}${path}`;
}
