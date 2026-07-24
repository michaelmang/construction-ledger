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
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">{label}</div>
      <div className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-text-3">{sub}</div>}
    </div>
  );
}
