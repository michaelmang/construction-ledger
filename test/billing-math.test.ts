import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeRetainageWithheld, BillingMathError } from "@/lib/billing-math";

describe("computeRetainageWithheld", () => {
  it("defaults to retainagePct times amountBilled", () => {
    const result = computeRetainageWithheld(new Decimal("18000.00"), new Decimal("0.10"));
    expect(result.toFixed(2)).toBe("1800.00");
  });

  it("handles 0% retainage", () => {
    const result = computeRetainageWithheld(new Decimal("18000.00"), new Decimal("0"));
    expect(result.toFixed(2)).toBe("0.00");
  });

  it("respects an explicit override", () => {
    const result = computeRetainageWithheld(
      new Decimal("18000.00"),
      new Decimal("0.10"),
      new Decimal("500.00"),
    );
    expect(result.toFixed(2)).toBe("500.00");
  });

  it("rejects retainage greater than the amount billed", () => {
    expect(() =>
      computeRetainageWithheld(
        new Decimal("1000.00"),
        new Decimal("0.10"),
        new Decimal("1500.00"),
      ),
    ).toThrow(BillingMathError);
  });

  it("rejects negative retainage", () => {
    expect(() =>
      computeRetainageWithheld(
        new Decimal("1000.00"),
        new Decimal("0.10"),
        new Decimal("-1.00"),
      ),
    ).toThrow(BillingMathError);
  });

  it("rounds a fractional default to two decimal places", () => {
    const result = computeRetainageWithheld(new Decimal("100.00"), new Decimal("0.0333"));
    expect(result.toFixed(2)).toBe("3.33");
  });
});
