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
        ? "text-negative"
        : "text-positive"
    : "";
  return <span className={`font-mono tabular-nums ${colorClass}`}>{formatUSD(amount)}</span>;
}
