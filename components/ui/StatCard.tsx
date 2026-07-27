export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-text";
  return (
    // min-w-0 lets this shrink below its content's intrinsic width inside
    // a grid track — without it, a long tabular-nums dollar figure forces
    // grid blowout at narrow viewports (V4 spec Phase 3: responsive shell)
    // instead of the smaller responsive font size below actually applying.
    // break-all (not truncate) as the last-resort fallback: an ellipsis
    // would silently hide digits of a dollar figure, which is a real
    // correctness risk in accounting software — wrapping to a second line
    // never hides a digit.
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">{label}</div>
      <div className={`mt-2 break-all font-mono text-xl font-semibold tabular-nums sm:text-2xl lg:text-3xl ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-text-3">{sub}</div>}
    </div>
  );
}
