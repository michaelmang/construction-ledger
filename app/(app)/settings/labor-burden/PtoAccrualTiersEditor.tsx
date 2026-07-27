"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePtoAccrualTiers } from "@/app/actions/labor-burden-settings";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/form";
import { FormError } from "@/components/ui/FormError";

export interface PtoAccrualTierRow {
  minTenureYears: number;
  accrualPct: string;
}

// Whole-list replace, matching app/actions/labor-burden-settings.ts's
// updatePtoAccrualTiers — tiers are a small cohesive set edited together,
// not row-by-row CRUD like WorkersCompRateTable.
export function PtoAccrualTiersEditor({ tiers }: { tiers: PtoAccrualTierRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<PtoAccrualTierRow[]>(tiers);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateRow(index: number, field: keyof PtoAccrualTierRow, value: string) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, [field]: field === "minTenureYears" ? Number(value) : value }
          : r,
      ),
    );
    setSaved(false);
  }

  function addRow() {
    setRows((prev) => [...prev, { minTenureYears: 0, accrualPct: "0" }]);
    setSaved(false);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    const sorted = [...rows].sort((a, b) => a.minTenureYears - b.minTenureYears);
    const result = await updatePtoAccrualTiers(sorted);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows(sorted);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <FormError error={error} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="block">
              <span className="text-xs text-text-3">Min Tenure Years</span>
              <input
                className={`mt-1 w-32 ${inputClass}`}
                inputMode="numeric"
                value={r.minTenureYears}
                onChange={(e) => updateRow(i, "minTenureYears", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-3">Accrual %</span>
              <input
                className={`mt-1 w-32 ${inputClass}`}
                inputMode="decimal"
                value={r.accrualPct}
                onChange={(e) => updateRow(i, "accrualPct", e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={addRow} className={secondaryButtonClass}>
          + Add Tier
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || rows.length === 0}
          className={primaryButtonClass}
        >
          {submitting ? "Saving…" : "Save Tiers"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
      </div>
    </div>
  );
}
