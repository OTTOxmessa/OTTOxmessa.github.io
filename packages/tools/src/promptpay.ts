/**
 * สร้างข้อความ (payload) สำหรับ QR พร้อมเพย์ ตามมาตรฐาน EMVCo / Thai QR Payment
 * สแกนได้กับแอปธนาคารไทยทุกแอป — ทำงานในเครื่องทั้งหมด ไม่ส่งข้อมูลไปที่ไหน
 */

export type PromptPayKind = "phone" | "nationalId" | "ewallet";

const AID_PROMPTPAY = "A000000677010111";

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) ตามสเปก EMVCo */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function sanitizeId(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

/** แยกประเภทจากจำนวนหลัก: 10 = เบอร์โทร, 13 = เลขบัตรประชาชน/ภาษี, 15 = e-Wallet */
export function detectKind(id: string): PromptPayKind | null {
  const d = sanitizeId(id);
  if (d.length === 10 && d.startsWith("0")) return "phone";
  if (d.length === 13) return "nationalId";
  if (d.length === 15) return "ewallet";
  return null;
}

/** ตรวจเลขบัตรประชาชน 13 หลักด้วย checksum (หลักสุดท้าย) */
export function isValidThaiId(id: string): boolean {
  const d = sanitizeId(id);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

export function promptPayPayload(id: string, amount?: number): string {
  const digits = sanitizeId(id);
  const kind = detectKind(digits);
  if (!kind) throw new Error("PromptPay ID ต้องเป็นเบอร์โทร 10 หลัก เลขบัตร 13 หลัก หรือ e-Wallet 15 หลัก");
  if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999)) {
    throw new Error("จำนวนเงินไม่ถูกต้อง");
  }

  const target =
    kind === "phone"
      ? tlv("01", ("0000000000000" + digits.replace(/^0/, "66")).slice(-13))
      : kind === "nationalId"
        ? tlv("02", digits)
        : tlv("03", digits);

  const hasAmount = amount !== undefined && amount > 0;
  const body = [
    tlv("00", "01"),
    tlv("01", hasAmount ? "12" : "11"),
    tlv("29", tlv("00", AID_PROMPTPAY) + target),
    tlv("58", "TH"),
    tlv("53", "764"),
    hasAmount ? tlv("54", amount!.toFixed(2)) : "",
  ].join("");

  const withCrcTag = body + "6304";
  return withCrcTag + crc16(withCrcTag);
}
