export type PillTone = "positive" | "negative" | "warn" | "neutral";

const TONE_CLASSES: Record<PillTone, string> = {
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warn: "bg-warn-soft text-accent",
  neutral: "bg-surface-2 text-text-2",
};

// Never color-only (v2 spec §4 accessibility note) — always render the
// status word, the tint is reinforcement not the only signal.
export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
