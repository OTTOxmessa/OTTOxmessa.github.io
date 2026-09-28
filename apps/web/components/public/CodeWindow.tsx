import { highlight } from "@/lib/highlight";

type Props = {
  file: string;
  code: string;
  /** พิมพ์ทีละบรรทัดตอนโหลด (ปิดอัตโนมัติถ้าผู้ใช้ตั้ง reduce motion) */
  animate?: boolean;
  /** true = ตกแต่งเท่านั้น ซ่อนจาก screen reader */
  decorative?: boolean;
  label?: string;
  children?: React.ReactNode;
  className?: string;
};

export function CodeWindow({ file, code, animate, decorative, label, children, className }: Props) {
  const lines = highlight(code, file).split("\n");
  return (
    <figure
      className={`code-window${animate ? " is-typing" : ""} ${className ?? ""}`}
      aria-hidden={decorative || undefined}
    >
      <div className="code-bar">
        <span className="code-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="code-file">{file}</span>
      </div>
      <pre
        className="code-body"
        tabIndex={decorative ? undefined : 0}
        aria-label={decorative ? undefined : label ?? file}
      >
        <code>
          {lines.map((l, i) => (
            <span
              key={i}
              className="code-line"
              style={animate ? ({ "--i": i } as React.CSSProperties) : undefined}
              dangerouslySetInnerHTML={{ __html: l || " " }}
            />
          ))}
        </code>
      </pre>
      {children}
    </figure>
  );
}
