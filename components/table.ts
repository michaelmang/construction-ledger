// v2 spec §4.3 Table: surface card, uppercase micro-label header row,
// hairline dividers, row hover, numeric columns right-aligned mono.
// overflow-x-auto (V4 spec Phase 3: responsive shell) lets wide tables
// scroll horizontally on narrow viewports instead of being clipped;
// overflow-y-hidden keeps the original corner-clipping behavior so the
// thead's flat background doesn't poke past the rounded-xl corners.
export const tableWrapClass = "overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-surface";
export const tableClass = "w-full text-sm";
export const theadClass = "bg-surface-2 text-left";
export const thClass =
  "px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest text-text-3";
export const tbodyClass = "divide-y divide-border";
export const trClass = "hover:bg-surface-2";
export const tdClass = "px-4 py-3 text-text-2";
export const tdNumericClass = "px-4 py-3 text-right font-mono tabular-nums text-text";
