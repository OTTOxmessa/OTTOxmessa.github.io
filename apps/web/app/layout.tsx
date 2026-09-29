import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/public/Footer";
import { Header } from "@/components/public/Header";
import { Reveal } from "@/components/public/Reveal";
import { getProfile } from "@/lib/content";
import { SITE_URL, BASE_PATH } from "@/lib/site";
import "./globals.css";

const profile = getProfile();

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}${BASE_PATH}/`),
  title: { default: `${profile.name.en} — Portfolio`, template: `%s — ${profile.name.en}` },
  description: profile.intro.en,
  openGraph: { type: "website", title: `${profile.name.en} — Portfolio`, description: profile.intro.en },
  twitter: { card: "summary" },
  icons: { icon: `${BASE_PATH}/icon.svg` },
};

export const viewport: Viewport = {
  themeColor: "#f6f5f1",
};

/** ตั้งภาษา/ธีมก่อนหน้าเว็บวาด เพื่อไม่ให้กะพริบ — ธีมสว่างเป็นค่าเริ่มต้นเสมอ โหมดมืดเปิดจากปุ่มเท่านั้น (จำค่าไว้) */
const bootScript = `(function(){var d=document.documentElement;d.classList.add("js");try{var l=localStorage.getItem("lang");if(l==="en"||l==="th"){d.dataset.lang=l;d.lang=l}var t=localStorage.getItem("theme");d.dataset.theme=t==="dark"?"dark":"light"}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-lang="th" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body id="top">
        <a className="skip-link" href="#main">
          <span className="i18n-th">ข้ามไปยังเนื้อหาหลัก</span>
          <span className="i18n-en">Skip to main content</span>
        </a>
        <Header brand={profile.name.en} />
        <main id="main">{children}</main>
        <Footer name={profile.name.en} />
        <Reveal />
      </body>
    </html>
  );
}
