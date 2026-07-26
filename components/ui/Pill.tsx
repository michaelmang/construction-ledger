export type PillTone = "positive" | "negative" | "warn" | "neutral";

const TONE_CLASSES: Record<PillTone, string> = {
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warn: "bg-warn-soft text-accent",
  neutral: "bg-surface-2 text-text-2",
};

// Exposed so non-Pill elements (e.g. JobStatusMenu's <select>) can reuse the
// same tone→color mapping instead of duplicating it locally.
export function pillToneClasses(tone: PillTone): string {
  return TONE_CLASSES[tone];
}

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
