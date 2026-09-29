import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { crc16, detectKind, isValidThaiId, promptPayPayload } from "./promptpay";

// ใช้ไลบรารี promptpay-qr ที่คนใช้กันแพร่หลายเป็นตัวเทียบคำตอบ
const require = createRequire(import.meta.url);
const reference: (id: string, opts?: { amount?: number }) => string = require("promptpay-qr");

describe("crc16", () => {
  it("matches the CRC-16/CCITT-FALSE check value", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("promptPayPayload", () => {
  it.each([
    ["0812345678", undefined],
    ["081-234-5678", 100],
    ["0899999999", 4.22],
    ["1234567890123", undefined],
    ["1234567890123", 1500.5],
    ["123456789012345", 20],
  ])("matches the reference implementation for %s / %s", (id, amount) => {
    expect(promptPayPayload(id, amount)).toBe(reference(id, amount === undefined ? {} : { amount }));
  });

  it("uses static QR when there is no amount and dynamic when there is", () => {
    expect(promptPayPayload("0812345678")).toContain("010211");
    expect(promptPayPayload("0812345678", 50)).toContain("010212");
    expect(promptPayPayload("0812345678", 50)).toContain("540550.00");
  });

  it("rejects invalid IDs and amounts", () => {
    expect(() => promptPayPayload("12345")).toThrow();
    expect(() => promptPayPayload("0812345678", -1)).toThrow();
  });
});

describe("helpers", () => {
  it("detects the ID type", () => {
    expect(detectKind("0812345678")).toBe("phone");
    expect(detectKind("1-2345-67890-12-3")).toBe("nationalId");
    expect(detectKind("12")).toBeNull();
  });
  it("validates Thai national ID checksums", () => {
    expect(isValidThaiId("1101700207030")).toBe(true);
    expect(isValidThaiId("1101700207031")).toBe(false);
  });
});
