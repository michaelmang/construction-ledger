// v3 spec (Vercel migration) Phase 5: date-range drill-down for trend
// charts. Shared by app/page.tsx and app/jobs/[id]/page.tsx so preset chips
// and the custom from/to form parse identically on both pages — one
// canonical param scheme, not per-page reinterpretation.

export type RangePreset = "8w" | "3m" | "6m" | "1y";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "8w", label: "8 Weeks" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
];

// Applied whenever the request carries neither `range` nor `from` — a first
// page load with no query string.
const DEFAULT_PRESET: RangePreset = "3m";

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function presetToFrom(preset: RangePreset, to: Date): Date {
  switch (preset) {
    case "8w":
      return addDays(to, -8 * 7);
    case "3m":
      return addMonths(to, -3);
    case "6m":
      return addMonths(to, -6);
    case "1y":
      return addMonths(to, -12);
  }
}

function isRangePreset(value: string | undefined): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.value === value);
}

function parseDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export interface ResolvedDateRange {
  from: Date;
  to: Date;
  // The active preset, or null when the custom from/to form produced this
  // range — DateRangeControl uses this to decide which control to highlight
  // and which to prefill.
  preset: RangePreset | null;
}

// Explicit `from`/`to` (the custom form) wins over `range` (the preset
// chips) when a request somehow carries both.
export function resolveDateRangeParams(searchParams: {
  range?: string;
  from?: string;
  to?: string;
}): ResolvedDateRange {
  const to = parseDate(searchParams.to) ?? new Date();
  const from = parseDate(searchParams.from);

  if (from && from <= to) {
    return { from, to, preset: null };
  }

  const preset = isRangePreset(searchParams.range) ? searchParams.range : DEFAULT_PRESET;
  return { from: presetToFrom(preset, to), to, preset };
}
