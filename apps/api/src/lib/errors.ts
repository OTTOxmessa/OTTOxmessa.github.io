/** ข้อผิดพลาดที่ตั้งใจส่งกลับให้ client — รูปแบบเดียวกันทุก endpoint: { error: { code, message, details? } } */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "ไม่พบข้อมูล") => new HttpError(404, "not_found", what);
export const conflict = (message: string, details?: unknown) => new HttpError(409, "conflict", message, details);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
