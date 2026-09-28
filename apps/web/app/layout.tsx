import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/public/Footer";
import { Header } from "@/components/public/Header";
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1826" },
    { media: "(prefers-color-scheme: light)", color: "#F3F6F9" },
  ],
};

/** ตั้งภาษา/ธีมก่อนหน้าเว็บวาด เพื่อไม่ให้กะพริบ */
const bootScript = `(function(){try{var d=document.documentElement;var l=localStorage.getItem("lang");if(l==="en"||l==="th"){d.dataset.lang=l;d.lang=l}var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.dataset.theme=t}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-lang="th" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          <span className="i18n-th">ข้ามไปยังเนื้อหาหลัก</span>
          <span className="i18n-en">Skip to main content</span>
        </a>
        <div className="grid-backdrop" aria-hidden="true" />
        <Header brand={profile.name.en} />
        <main id="main">{children}</main>
        <Footer name={profile.name.en} />
      </body>
    </html>
  );
}
