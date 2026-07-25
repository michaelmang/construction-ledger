import Decimal from "decimal.js";

// v3 spec §F18/§F19 — burden convention (documented here per the build
// instructions, not left implicit):
//
//   burdenedRate = baseRate × (1 + payrollTaxPct + workersCompPct + benefitsPct)
//   burdenedAmount = burdenedRate × hours
//   grossAmount = baseRate × hours
//
// All rate components are decimal fractions of base rate (0.0765 = 7.65%).
// Both burdenedRate and the two amounts are rounded half-up to cents — the
// journal posts burdenedAmount (the app's principle: the journal reflects
// true cost, not a workaround fudge factor). grossAmount is retained only
// for the inline gross-vs-burdened delta shown on the expense form; it is
// never posted.

export interface BurdenComponents {
  baseRate: Decimal.Value;
  payrollTaxPct: Decimal.Value;
  workersCompPct: Decimal.Value;
  benefitsPct: Decimal.Value;
}

function roundCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function burdenedRate(components: BurdenComponents): Decimal {
  const baseRate = new Decimal(components.baseRate);
  const multiplier = new Decimal(1)
    .plus(components.payrollTaxPct)
    .plus(components.workersCompPct)
    .plus(components.benefitsPct);
  return roundCents(baseRate.times(multiplier));
}

export interface LaborAmounts {
  gross: Decimal;
  burdened: Decimal;
}

export function laborAmounts(components: BurdenComponents, hours: Decimal.Value): LaborAmounts {
  const baseRate = new Decimal(components.baseRate);
  const hoursDecimal = new Decimal(hours);
  const rate = burdenedRate(components);

  return {
    gross: roundCents(baseRate.times(hoursDecimal)),
    burdened: roundCents(rate.times(hoursDecimal)),
  };
}

// The inline "Gross: $1,200.00 · Burdened: $1,542.00 (+28.5%)" delta shown on
// the expense form's labor mode — a percentage, not a dollar amount, rounded
// to one decimal place for display.
export function burdenDeltaPct(gross: Decimal, burdened: Decimal): Decimal {
  if (gross.isZero()) return new Decimal(0);
  return burdened.minus(gross).dividedBy(gross).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
}
