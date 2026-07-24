import Decimal from "decimal.js";

export type Money = Decimal;

export function money(value: Decimal.Value | null | undefined): Money {
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value);
}

export function formatUSD(value: Decimal.Value | null | undefined): string {
  const amount = money(value);
  // decimal.js preserves signed zero (-0), so isNegative() alone would print
  // "-$0.00" for a value that nets to nothing — treat zero as non-negative.
  const negative = !amount.isZero() && amount.isNegative();
  const formatted = amount.abs().toFixed(2);
  const [whole, cents] = formatted.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${withCommas}.${cents}`;
}

// Journal amounts are written as plain decimal strings, e.g. "4200.00", never
// locale-formatted, so hledger parses them unambiguously.
export function toJournalAmount(value: Decimal.Value): string {
  return money(value).toFixed(2);
}
