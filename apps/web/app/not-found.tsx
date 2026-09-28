import Link from "next/link";
import { T } from "@/components/public/T";

export default function NotFound() {
  return (
    <section className="section page-top">
      <div className="wrap narrow">
        <p className="hero-kicker">$ 404</p>
        <h1 className="case-title"><T th="ไม่พบหน้านี้" en="Page not found" /></h1>
        <p><Link href="/" className="section-link"><T th="← กลับหน้าแรก" en="← Back home" /></Link></p>
      </div>
    </section>
  );
}
