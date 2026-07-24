import { describe, expect, it } from "vitest";
import { formatUSD, money, toJournalAmount } from "@/lib/money";

describe("money", () => {
  it("treats null/undefined as zero", () => {
    expect(money(null).toFixed(2)).toBe("0.00");
    expect(money(undefined).toFixed(2)).toBe("0.00");
  });
});

describe("formatUSD", () => {
  it("adds thousands separators and two decimal places", () => {
    expect(formatUSD("18000")).toBe("$18,000.00");
    expect(formatUSD("4200.5")).toBe("$4,200.50");
  });

  it("formats negative amounts with a leading minus", () => {
    expect(formatUSD("-1800")).toBe("-$1,800.00");
  });
});

describe("toJournalAmount", () => {
  it("always renders two decimal places with no separators", () => {
    expect(toJournalAmount("4200")).toBe("4200.00");
    expect(toJournalAmount("-1800.5")).toBe("-1800.50");
  });
});
