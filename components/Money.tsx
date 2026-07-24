import Decimal from "decimal.js";
import { formatUSD } from "@/lib/money";

export function Money({
  value,
  colorize = false,
}: {
  value: Decimal.Value;
  colorize?: boolean;
}) {
  const amount = new Decimal(value);
  // decimal.js preserves signed zero (-0), which reads as negative — treat
  // zero as neutral regardless of sign bit.
  const colorClass = colorize
    ? amount.isZero()
      ? ""
      : amount.isNegative()
        ? "text-red-600"
        : "text-green-700"
    : "";
  return <span className={colorClass}>{formatUSD(amount)}</span>;
}
