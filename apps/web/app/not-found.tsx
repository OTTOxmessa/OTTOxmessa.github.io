import Link from "next/link";
import { T } from "@/components/public/T";

export default function NotFound() {
  return (
    <section className="section section--top" aria-labelledby="nf-title">
      <div className="wrap">
        <p className="eyebrow">404</p>
        <h1 className="display display--md" id="nf-title"><T th="ไม่พบหน้านี้" en="Page not found." /></h1>
        <p className="lead"><T th="ลิงก์อาจเปลี่ยนไปแล้ว ลองเริ่มจากหน้าแรก" en="The link may have moved. Try the home page." /></p>
        <p><Link href="/" className="btn btn-primary"><T th="กลับหน้าแรก" en="Back home" /></Link></p>
      </div>
    </section>
  );
}
