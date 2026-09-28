import { T } from "./T";

export function Footer({ name }: { name: string }) {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <p>
          <span className="nav-path">~/</span>
          {new Date().getFullYear()} {name} ·{" "}
          <T th="สร้างด้วย Next.js และ deploy บน GitHub Pages" en="Built with Next.js, deployed on GitHub Pages" />
        </p>
      </div>
    </footer>
  );
}
