"use client";

import { promptPayPayload } from "@portfolio/tools/promptpay";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR พร้อมเพย์ (SVG) — สร้างในเครื่อง ไม่ส่งข้อมูลออกไปไหน */
export function PromptPayQr({ id, amount, label, size = 200 }: { id: string; amount: number; label: string; size?: number }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    try {
      const payload = promptPayPayload(id, amount);
      QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111412", light: "#ffffff" } })
        .then((s) => alive && (setSvg(s), setError("")))
        .catch((e: Error) => alive && setError(e.message));
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      alive = false;
    };
  }, [id, amount]);
  if (error) return <p className="field-error">{error}</p>;
  return (
    <div className="ppqr" role="img" aria-label={label} style={{ width: size }}>
      <div className="ppqr-head" aria-hidden="true">PromptPay</div>
      <div className="ppqr-code" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
