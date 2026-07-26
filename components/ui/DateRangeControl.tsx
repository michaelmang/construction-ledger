import Link from "next/link";
import { RANGE_PRESETS, ResolvedDateRange } from "@/lib/date-range";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${
    active ? "border-accent bg-accent/10 text-accent" : "border-border text-text-2 hover:bg-surface-2"
  }`;

const dateInputClass =
  "w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

// Preset chips (`?range=...`) as plain GET links, plus a custom from/to GET
// form — mirrors app/jobs/[id]/transactions/page.tsx's established filter
// pattern. `basePath` lets the same component drive both the dashboard and
// a job overview page without hardcoding either route.
export function DateRangeControl({ basePath, resolved }: { basePath: string; resolved: ResolvedDateRange }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-1">
        {RANGE_PRESETS.map((p) => (
          <Link key={p.value} href={`${basePath}?range=${p.value}`} className={chipClass(resolved.preset === p.value)}>
            {p.label}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-2" action={basePath}>
        <div className="w-[calc(50%-0.5rem)] sm:w-auto">
          <label className="block text-xs text-text-3">From</label>
          <input
            type="date"
            name="from"
            defaultValue={resolved.preset ? "" : toDateInputValue(resolved.from)}
            className={dateInputClass}
          />
        </div>
        <div className="w-[calc(50%-0.5rem)] sm:w-auto">
          <label className="block text-xs text-text-3">To</label>
          <input
            type="date"
            name="to"
            defaultValue={resolved.preset ? "" : toDateInputValue(resolved.to)}
            className={dateInputClass}
          />
        </div>
        <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2">
          Apply
        </button>
      </form>
    </div>
  );
}
