import { T } from "./T";

export function StatusBadge({ status }: { status: "done" | "in-progress" }) {
  return (
    <span className={`status status-${status}`}>
      {status === "done" ? <T th="เสร็จแล้ว" en="Shipped" /> : <T th="กำลังพัฒนา" en="In progress" />}
    </span>
  );
}
