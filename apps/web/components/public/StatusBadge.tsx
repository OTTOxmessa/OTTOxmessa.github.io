import { T } from "./T";

export function StatusBadge({ status }: { status: "done" | "in-progress" }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {status === "done" ? <T th="เสร็จแล้ว" en="Shipped" /> : <T th="กำลังพัฒนา" en="In progress" />}
    </span>
  );
}
