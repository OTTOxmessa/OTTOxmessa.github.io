import { describe, expect, it } from "vitest";
import { bahtText, daysBetween, englishAmount, fromThaiDigits, readInteger, thaiDate, toThaiDigits, ymdBetween } from "./thai-text";

describe("bahtText (matches Excel BAHTTEXT)", () => {
  it.each([
    [0, "ศูนย์บาทถ้วน"],
    [1, "หนึ่งบาทถ้วน"],
    [11, "สิบเอ็ดบาทถ้วน"],
    [21, "ยี่สิบเอ็ดบาทถ้วน"],
    [100, "หนึ่งร้อยบาทถ้วน"],
    [101, "หนึ่งร้อยเอ็ดบาทถ้วน"],
    [1234.5, "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์"],
    [0.75, "เจ็ดสิบห้าสตางค์"],
    [100.567, "หนึ่งร้อยบาทห้าสิบเจ็ดสตางค์"],
    [15999.95, "หนึ่งหมื่นห้าพันเก้าร้อยเก้าสิบเก้าบาทเก้าสิบห้าสตางค์"],
    [1000000, "หนึ่งล้านบาทถ้วน"],
    [1000001, "หนึ่งล้านเอ็ดบาทถ้วน"],
    [2000001, "สองล้านเอ็ดบาทถ้วน"],
    [11000000, "สิบเอ็ดล้านบาทถ้วน"],
    [101000000, "หนึ่งร้อยเอ็ดล้านบาทถ้วน"],
    [21.01, "ยี่สิบเอ็ดบาทหนึ่งสตางค์"],
    [-50, "ลบห้าสิบบาทถ้วน"],
  ])("%s → %s", (n, text) => {
    expect(bahtText(n)).toBe(text);
  });

  it("reads trillions (ล้านล้าน)", () => {
    expect(readInteger(1_000_000_000_000)).toBe("หนึ่งล้านล้าน");
    expect(readInteger(2_500_000_000_000)).toBe("สองล้านห้าแสนล้าน");
  });
});

describe("englishAmount", () => {
  it("reads amounts for invoices", () => {
    expect(englishAmount(1234.5)).toBe("One thousand two hundred and thirty-four baht and fifty satang only");
    expect(englishAmount(1_000_000)).toBe("One million baht only");
    expect(englishAmount(0)).toBe("Zero baht only");
  });
});

describe("digits & dates", () => {
  it("converts Thai digits both ways", () => {
    expect(toThaiDigits("2569/10")).toBe("๒๕๖๙/๑๐");
    expect(fromThaiDigits("๒๕๖๙")).toBe("2569");
  });
  it("formats Thai dates", () => {
    expect(thaiDate("2026-09-29").formal).toBe("วันอังคารที่ 29 กันยายน พ.ศ. 2569");
    expect(thaiDate("2026-01-05").short).toBe("5 ม.ค. 69");
  });
  it("counts days and y/m/d between dates", () => {
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(ymdBetween("2004-02-29", "2026-09-29")).toEqual({ years: 22, months: 7, days: 0, sign: 1 });
    expect(ymdBetween("2026-01-31", "2026-03-01")).toEqual({ years: 0, months: 1, days: 1, sign: 1 });
  });
});
