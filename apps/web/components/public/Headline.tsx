import type { Localized } from "@portfolio/shared";

/** แปลง "ข้อความ *เน้น*" → ข้อความ <em>เน้น</em> */
function accent(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? <em key={i}>{part.slice(1, -1)}</em> : part,
  );
}

export function Headline({ text }: { text: Localized }) {
  if (text.th === text.en) return <>{accent(text.th)}</>;
  return (
    <>
      <span lang="th" className="i18n-th">{accent(text.th)}</span>
      <span lang="en" className="i18n-en">{accent(text.en)}</span>
    </>
  );
}
