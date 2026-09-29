import { describe, expect, it } from "vitest";
import { conflicts, firstDate, fold, hourRange, nextClass, toIcs, validSlot, weeklyHours, type Slot } from "./timetable";

const s = (id: string, day: number, start: string, end: string, extra: Partial<Slot> = {}): Slot => ({ id, code: id, name: "", day, start, end, room: "", color: 0, ...extra });

describe("timetable", () => {
  it("validates slots", () => {
    expect(validSlot({ day: 0, start: "09:00", end: "10:30" })).toBe(true);
    expect(validSlot({ day: 0, start: "10:00", end: "09:00" })).toBe(false);
  });

  it("finds overlapping classes on the same day only", () => {
    const list = [s("A", 0, "09:00", "12:00"), s("B", 0, "11:00", "13:00"), s("C", 0, "12:00", "13:00"), s("D", 1, "09:00", "12:00")];
    expect(conflicts(list).map(([a, b]) => a.id + b.id)).toEqual(["AB", "BC"]);
  });

  it("computes the hour range and weekly hours", () => {
    expect(hourRange([s("A", 0, "07:30", "09:00"), s("B", 2, "15:00", "18:10")])).toEqual([7, 19]);
    expect(weeklyHours([s("A", 0, "09:00", "12:00"), s("B", 1, "13:00", "14:30")])).toBe(4.5);
  });

  it("finds the ongoing or next class", () => {
    const list = [s("MON9", 0, "09:00", "12:00"), s("WED13", 2, "13:00", "15:00")];
    const tue = new Date(2026, 8, 29, 10, 0); // อังคาร 29 ก.ย. 2569 10:00
    expect(nextClass(list, tue)).toMatchObject({ slot: { id: "WED13" }, ongoing: false, minutes: 27 * 60 });
    const mon = new Date(2026, 8, 28, 10, 30);
    expect(nextClass(list, mon)).toMatchObject({ slot: { id: "MON9" }, ongoing: true, minutes: 90 });
    expect(nextClass([], mon)).toBeNull();
  });

  it("finds the first matching weekday from semester start", () => {
    expect(firstDate("2026-11-02", 0)).toBe("2026-11-02"); // จันทร์
    expect(firstDate("2026-11-02", 4)).toBe("2026-11-06"); // ศุกร์
    expect(firstDate("2026-11-04", 0)).toBe("2026-11-09");
  });

  it("exports a valid weekly-repeating .ics", () => {
    const ics = toIcs([s("CP353002", 2, "13:00", "16:00", { name: "Software Design, Dev", room: "SC09-101; Lab" })], { start: "2026-11-02", end: "2027-03-01" }, new Date(Date.UTC(2026, 8, 29)));
    expect(ics).toContain("DTSTART;TZID=Asia/Bangkok:20261104T130000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20270301T165959Z");
    expect(ics).toContain("SUMMARY:CP353002 Software Design\\, Dev");
    expect(ics).toContain("LOCATION:SC09-101\\; Lab");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long UTF-8 lines without breaking characters", () => {
    const line = "SUMMARY:" + "ภาษาไทย".repeat(20);
    const folded = fold(line);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(folded.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
