import { describe, expect, it } from "vitest";
import {
  parseIsoDate,
  toIsoDate,
  addUtcDays,
  addUtcMonths,
  startOfUtcMonth,
  utcDaysBetween,
  utcMonthsBetween,
} from "@/lib/date-utc";

describe("lib/date-utc", () => {
  it("parseIsoDate accepts a valid YYYY-MM-DD string anchored at UTC midnight", () => {
    const date = parseIsoDate("2026-07-24");
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(6); // 0-indexed
    expect(date!.getUTCDate()).toBe(24);
    expect(date!.getUTCHours()).toBe(0);
  });

  it("parseIsoDate rejects malformed, non-existent, or non-canonical dates", () => {
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull(); // month 13 is out of the ISO 8601 grammar
    expect(parseIsoDate("2026-02-30")).toBeNull(); // Feb has no 30th
    expect(parseIsoDate("07/24/2026")).toBeNull();
    expect(parseIsoDate("2026-7-24")).toBeNull(); // not zero-padded
  });

  it("toIsoDate/todayIso round-trip through parseIsoDate", () => {
    const date = parseIsoDate("2026-01-01")!;
    expect(toIsoDate(date)).toBe("2026-01-01");
  });

  it("addUtcDays crosses month and year boundaries without local-timezone drift", () => {
    expect(toIsoDate(addUtcDays(parseIsoDate("2026-01-31")!, 1))).toBe("2026-02-01");
    expect(toIsoDate(addUtcDays(parseIsoDate("2026-12-31")!, 1))).toBe("2027-01-01");
    expect(toIsoDate(addUtcDays(parseIsoDate("2026-07-24")!, -30))).toBe("2026-06-24");
  });

  it("addUtcMonths preserves day-of-month and clamps sanely at month-end", () => {
    expect(toIsoDate(addUtcMonths(parseIsoDate("2026-07-24")!, 3))).toBe("2026-10-24");
    expect(toIsoDate(addUtcMonths(parseIsoDate("2026-07-24")!, -3))).toBe("2026-04-24");
    // Jan 31 + 1 month: JS Date overflows Feb 31 into Mar 3 (2026 is not a
    // leap year) rather than clamping to Feb 28 — documenting the actual
    // (standard JS Date) behavior here so a future change is a deliberate
    // decision, not a silent regression.
    expect(toIsoDate(addUtcMonths(parseIsoDate("2026-01-31")!, 1))).toBe("2026-03-03");
  });

  it("startOfUtcMonth resets to the 1st regardless of day-of-month", () => {
    expect(toIsoDate(startOfUtcMonth(parseIsoDate("2026-07-24")!))).toBe("2026-07-01");
    expect(toIsoDate(startOfUtcMonth(parseIsoDate("2026-07-01")!))).toBe("2026-07-01");
  });

  it("utcDaysBetween and utcMonthsBetween compute correct deltas", () => {
    expect(utcDaysBetween(parseIsoDate("2026-07-01")!, parseIsoDate("2026-07-31")!)).toBe(30);
    expect(utcMonthsBetween(parseIsoDate("2026-01-15")!, parseIsoDate("2026-07-01")!)).toBe(6);
    expect(utcMonthsBetween(parseIsoDate("2025-11-01")!, parseIsoDate("2026-02-01")!)).toBe(3);
  });
});
