"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { createProgressBilling } from "@/app/actions/billings";
import { formatUSD } from "@/lib/money";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function BillingForm({ jobId, retainagePct }: { jobId: number; retainagePct: string }) {
  const router = useRouter();
  const [amountBilled, setAmountBilled] = useState("");
  const [retainageOverride, setRetainageOverride] = useState("");
  const [billingDate, setBillingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodLabel, setPeriodLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const computedRetainage = useMemo(() => {
    if (retainageOverride) return retainageOverride;
    if (!amountBilled || !/^\d+(\.\d+)?$/.test(amountBilled.trim())) return null;
    return new Decimal(amountBilled).times(new Decimal(retainagePct)).toDecimalPlaces(2).toString();
  }, [amountBilled, retainageOverride, retainagePct]);

  const netAfterRetainage = useMemo(() => {
    if (!amountBilled || computedRetainage === null) return null;
    try {
      return new Decimal(amountBilled).minus(new Decimal(computedRetainage)).toString();
    } catch {
      return null;
    }
  }, [amountBilled, computedRetainage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createProgressBilling({
      jobId,
      billingDate,
      periodLabel: periodLabel || undefined,
      amountBilled,
      retainageWithheld: retainageOverride || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/billings`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg space-y-4 rounded-lg border border-neutral-200 bg-white p-6"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <Field label="Period Label" hint='e.g. "Pay App #4"'>
        <input
          className={inputClass}
          value={periodLabel}
          onChange={(e) => setPeriodLabel(e.target.value)}
        />
      </Field>
      <Field label="Billing Date">
        <input
          type="date"
          className={inputClass}
          value={billingDate}
          onChange={(e) => setBillingDate(e.target.value)}
          required
        />
      </Field>
      <Field label="Amount Billed">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="18000.00"
          value={amountBilled}
          onChange={(e) => setAmountBilled(e.target.value)}
          required
        />
      </Field>
      <Field
        label="Retainage Withheld"
        hint={`defaults to ${new Decimal(retainagePct).times(100).toString()}% of amount billed`}
      >
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder={computedRetainage ?? ""}
          value={retainageOverride}
          onChange={(e) => setRetainageOverride(e.target.value)}
        />
      </Field>

      {computedRetainage !== null && netAfterRetainage !== null && (
        <div className="rounded-md bg-neutral-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Retainage withheld</span>
            <span>{formatUSD(computedRetainage)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-neutral-500">Net billed (AR)</span>
            <span>{formatUSD(netAfterRetainage)}</span>
          </div>
        </div>
      )}

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Creating…" : "Create Progress Billing"}
      </button>
    </form>
  );
}
