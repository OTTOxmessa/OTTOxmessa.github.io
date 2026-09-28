import { T } from "./T";

export function Footer({ name }: { name: string }) {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <span className="footer-mark" aria-hidden="true">{name.slice(0, 2)}_</span>
        <p>
          © {new Date().getFullYear()} {name} ·{" "}
          <T th="สร้างด้วย Next.js · deploy บน GitHub Pages" en="Built with Next.js · deployed on GitHub Pages" />
        </p>
        <a href="#top" className="back-top">
          <T th="กลับขึ้นด้านบน" en="Back to top" /> <span aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}
