"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Decimal from "decimal.js";
import { createProgressBilling, editProgressBilling } from "@/app/actions/billings";
import { formatUSD } from "@/lib/money";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export interface BillingInitial {
  id: number;
  txnid: string;
  amountBilled: string; // pre-formatted "0.00"
  retainageWithheld: string; // pre-formatted "0.00"
  billingDate: string;
  periodLabel: string;
  pctCompleteEstimate: string; // pre-formatted, "" means none
}

export function BillingForm({
  jobId,
  retainagePct,
  initial,
}: {
  jobId: number;
  retainagePct: string;
  initial?: BillingInitial;
}) {
  const router = useRouter();
  const [amountBilled, setAmountBilled] = useState(initial?.amountBilled ?? "");
  const [retainageOverride, setRetainageOverride] = useState(initial?.retainageWithheld ?? "");
  const [billingDate, setBillingDate] = useState(
    initial?.billingDate ?? (() => new Date().toISOString().slice(0, 10))(),
  );
  const [periodLabel, setPeriodLabel] = useState(initial?.periodLabel ?? "");
  const [pctCompleteEstimate, setPctCompleteEstimate] = useState(initial?.pctCompleteEstimate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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

    const payload = {
      jobId,
      billingDate,
      periodLabel: periodLabel || undefined,
      amountBilled,
      retainageWithheld: retainageOverride || undefined,
      pctCompleteEstimate: pctCompleteEstimate || undefined,
    };
    const result = initial
      ? await editProgressBilling({ ...payload, id: initial.id, txnid: initial.txnid })
      : await createProgressBilling(payload);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    if (result.warning) {
      // Over-billing is allowed but the CFO needs to actually see this, so
      // don't auto-navigate away from it.
      setWarning(result.warning);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/billings`);
    router.refresh();
  }

  if (warning) {
    return (
      <div className="max-w-lg space-y-4 rounded-lg border border-accent/30 bg-warn-soft p-6">
        <p className="text-sm font-medium text-accent">
          Progress billing {initial ? "updated" : "created"}.
        </p>
        <p className="text-sm text-accent">{warning}</p>
        <Link
          href={`/jobs/${jobId}/billings`}
          className="inline-block text-sm font-medium text-accent underline"
        >
          Continue to Billings
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6"
    >
      {error && (
        <div className="rounded-md border border-negative/30 bg-negative-soft px-4 py-2 text-sm text-negative">
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
      <Field
        label="Your % Complete Estimate"
        hint="optional — your own read on progress, shown beside the cost-basis % on the WIP report"
      >
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="e.g. 45"
          value={pctCompleteEstimate}
          onChange={(e) => setPctCompleteEstimate(e.target.value)}
        />
      </Field>

      {computedRetainage !== null && netAfterRetainage !== null && (
        <div className="rounded-md bg-surface-2 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-3">Retainage withheld</span>
            <span>{formatUSD(computedRetainage)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-text-3">Net billed (AR)</span>
            <span>{formatUSD(netAfterRetainage)}</span>
          </div>
        </div>
      )}

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : initial ? "Save Changes" : "Create Progress Billing"}
      </button>
    </form>
  );
}
