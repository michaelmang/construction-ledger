"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLaborBurdenSettings } from "@/app/actions/labor-burden-settings";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { FormError } from "@/components/ui/FormError";

export interface LaborBurdenSettingsInitial {
  sickTimeAccrualPct: string;
  companyHolidayDays: string;
  avgHoursPerYear: string;
  ficaPct: string;
  futaPct: string;
  stateUnemploymentPct: string;
}

export function LaborBurdenSettingsForm({ initial }: { initial: LaborBurdenSettingsInitial }) {
  const router = useRouter();
  const [sickTimeAccrualPct, setSickTimeAccrualPct] = useState(initial.sickTimeAccrualPct);
  const [companyHolidayDays, setCompanyHolidayDays] = useState(initial.companyHolidayDays);
  const [avgHoursPerYear, setAvgHoursPerYear] = useState(initial.avgHoursPerYear);
  const [ficaPct, setFicaPct] = useState(initial.ficaPct);
  const [futaPct, setFutaPct] = useState(initial.futaPct);
  const [stateUnemploymentPct, setStateUnemploymentPct] = useState(initial.stateUnemploymentPct);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const result = await updateLaborBurdenSettings({
      sickTimeAccrualPct,
      companyHolidayDays: Number(companyHolidayDays),
      avgHoursPerYear,
      ficaPct,
      futaPct,
      stateUnemploymentPct,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <FormError error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Sick Time Accrual" hint="decimal fraction, e.g. 0.033">
          <input
            className={inputClass}
            inputMode="decimal"
            value={sickTimeAccrualPct}
            onChange={(e) => setSickTimeAccrualPct(e.target.value)}
            required
          />
        </Field>
        <Field label="Company Holiday Days">
          <input
            className={inputClass}
            inputMode="numeric"
            value={companyHolidayDays}
            onChange={(e) => setCompanyHolidayDays(e.target.value)}
            required
          />
        </Field>
        <Field label="Avg Hours / Year">
          <input
            className={inputClass}
            inputMode="decimal"
            value={avgHoursPerYear}
            onChange={(e) => setAvgHoursPerYear(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="FICA %" hint="decimal fraction, e.g. 0.0765">
          <input
            className={inputClass}
            inputMode="decimal"
            value={ficaPct}
            onChange={(e) => setFicaPct(e.target.value)}
            required
          />
        </Field>
        <Field label="FUTA %" hint="decimal fraction, e.g. 0.006">
          <input
            className={inputClass}
            inputMode="decimal"
            value={futaPct}
            onChange={(e) => setFutaPct(e.target.value)}
            required
          />
        </Field>
        <Field label="State Unemployment %" hint="decimal fraction, e.g. 0.013">
          <input
            className={inputClass}
            inputMode="decimal"
            value={stateUnemploymentPct}
            onChange={(e) => setStateUnemploymentPct(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Save Assumptions"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
      </div>
    </form>
  );
}
