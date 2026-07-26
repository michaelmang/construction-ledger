// Canonical date-only handling for this app (V4 spec Phase 3: "date
// convention is mixed"). Every date-only value (job dates, billing dates,
// report "as of" boundaries) is a "YYYY-MM-DD" string end to end; all
// boundary math (add N days/months, start of month, months/days between)
// goes through the UTC-anchored helpers below, not ad hoc Date getters.
// Two subtleties this module exists to keep everyone off of:
//
// 1. `new Date("2026-07-24")` (a bare date, no time component) is always
//    parsed as UTC midnight per the ECMAScript spec — safe. But
//    `new Date("2026-07-24T00:00:00")` (a time component with no "Z"/
//    offset) is parsed in the *server's local timezone* instead — this was
//    the actual bug (this app happened to run fine because Vercel's
//    default runtime timezone is UTC, so it was silently correct there and
//    would silently break anywhere else). Never hand-append a bare time
//    suffix to a date-only string; parse it as-is, or route it through
//    parseIsoDate below.
// 2. Once you have a Date, `.getDate()/.getMonth()/.getFullYear()` and
//    their `set*` counterparts all read/write the *local* calendar date,
//    not the UTC one — even for a correctly UTC-anchored Date. Any
//    boundary math must go through the UTC-suffixed methods
//    (`getUTCDate`, `setUTCDate`, `Date.UTC`, ...), which is what every
//    helper below does.
//
// `.toISOString().slice(0, 10)` (wrapped as toIsoDate below) is always
// correct on its own — it's UTC by spec — but calling it inline invites
// someone to "simplify" it into local getters later. Route it through
// here too so the convention stays visible in one place.

export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value); // bare date-only string — UTC per spec, see module header
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function addUtcDays(date: Date, n: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

// Day-of-month-preserving (e.g. add 3 months to Jul 24 -> Oct 24). Callers
// that want a month-bucket start should compose startOfUtcMonth(addUtcMonths(...)).
export function addUtcMonths(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, date.getUTCDate()));
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function utcDaysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function utcMonthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}
