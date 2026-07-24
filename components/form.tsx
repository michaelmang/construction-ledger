// v2 spec §4.3: dark surfaces, accent focus ring, black text on the accent
// primary button. Shared across every form in the app.
export const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
export const primaryButtonClass =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:brightness-110 disabled:opacity-40";
export const secondaryButtonClass =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface-2";
export const destructiveButtonClass =
  "rounded-lg border border-negative/40 px-4 py-2 text-sm font-medium text-negative hover:bg-negative-soft";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-text-2">{label}</span>
      {hint && <span className="ml-2 text-xs text-text-3">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
