import type { Localized } from "@portfolio/shared";

/**
 * ข้อความสองภาษา — render ทั้ง TH และ EN ลง HTML แล้วให้ CSS ซ่อนภาษาที่ไม่ได้เลือก
 * ข้อดี: เป็น static HTML ล้วน, SEO เห็นทั้งสองภาษา, สลับภาษาไม่ต้องโหลดใหม่
 */
export function T({ th, en, text }: { th?: string; en?: string; text?: Localized }) {
  const t = text?.th ?? th ?? "";
  const e = text?.en ?? en ?? t;
  if (t === e) return <>{t}</>;
  return (
    <>
      <span lang="th" className="i18n-th">{t}</span>
      <span lang="en" className="i18n-en">{e}</span>
    </>
  );
}

export function TBlock({ th, en, className }: { th: string; en: string; className?: string }) {
  return (
    <>
      <div lang="th" className={`i18n-th ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: th }} />
      <div lang="en" className={`i18n-en ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: en }} />
    </>
  );
}
