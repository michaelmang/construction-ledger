import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { burdenedRate, laborAmounts, burdenDeltaPct } from "@/lib/labor";

describe("burdenedRate / laborAmounts", () => {
  it("matches a hand-computed worked example with a rounding edge", () => {
    // base 33.33/hr, 7.65% payroll tax + 9.5% workers' comp + 11% benefits,
    // over 7.75 hours. Hand-computed:
    //   multiplier = 1 + 0.0765 + 0.095 + 0.11 = 1.2815
    //   burdenedRate = 33.33 * 1.2815 = 42.712395 -> rounds to 42.71
    //   gross = 33.33 * 7.75 = 258.3075 -> rounds UP to 258.31 (edge: .0075 >= half a cent)
    //   burdened = 42.71 * 7.75 = 331.0025 -> rounds DOWN to 331.00 (edge: .0025 < half a cent)
    const components = {
      baseRate: "33.33",
      payrollTaxPct: "0.0765",
      workersCompPct: "0.095",
      benefitsPct: "0.11",
    };

    const rate = burdenedRate(components);
    expect(rate.toFixed(2)).toBe("42.71");

    const amounts = laborAmounts(components, "7.75");
    expect(amounts.gross.toFixed(2)).toBe("258.31");
    expect(amounts.burdened.toFixed(2)).toBe("331.00");

    const delta = burdenDeltaPct(amounts.gross, amounts.burdened);
    expect(delta.toFixed(1)).toBe("28.1");
  });

  it("burdened equals gross when every rate component is zero", () => {
    const components = {
      baseRate: "25",
      payrollTaxPct: "0",
      workersCompPct: "0",
      benefitsPct: "0",
    };

    const rate = burdenedRate(components);
    expect(rate.toFixed(2)).toBe("25.00");

    const amounts = laborAmounts(components, "10");
    expect(amounts.gross.toFixed(2)).toBe("250.00");
    expect(amounts.burdened.toFixed(2)).toBe("250.00");
    expect(amounts.burdened.equals(amounts.gross)).toBe(true);

    expect(burdenDeltaPct(amounts.gross, amounts.burdened).toFixed(1)).toBe("0.0");
  });

  it("guards against division by zero when gross is zero", () => {
    const delta = burdenDeltaPct(new Decimal(0), new Decimal(0));
    expect(delta.toFixed(1)).toBe("0.0");
  });
});
