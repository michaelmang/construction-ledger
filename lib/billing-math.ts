import Decimal from "decimal.js";

export class BillingMathError extends Error {}

// Retainage withheld defaults to job.retainagePct × amountBilled, but the CFO
// can override it per billing (product spec §5.1 / §9). Handles 0% retainage
// and validates the override never exceeds the amount billed.
export function computeRetainageWithheld(
  amountBilled: Decimal,
  retainagePct: Decimal,
  explicitRetainage?: Decimal,
): Decimal {
  const retainage =
    explicitRetainage ?? amountBilled.times(retainagePct).toDecimalPlaces(2);

  if (retainage.isNegative()) {
    throw new BillingMathError("Retainage withheld cannot be negative");
  }
  if (retainage.greaterThan(amountBilled)) {
    throw new BillingMathError("Retainage withheld cannot exceed the amount billed");
  }
  return retainage;
}
