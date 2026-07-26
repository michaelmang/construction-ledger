"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { releaseRetainagePayable, releaseRetainageReceivable } from "@/app/actions/retainage";
import { inputClass, primaryButtonClass, secondaryButtonClass, Field } from "@/components/form";
import { formatUSD } from "@/lib/money";

interface CashAccountOption {
  name: string;
  label: string;
  isDefault: boolean;
}

export function ReleaseRetainageForm({
  jobId,
  direction,
  balance,
  cashAccounts,
}: {
  jobId: number;
  direction: "payable" | "receivable";
  balance: string; // pre-formatted "0.00"
  cashAccounts: CashAccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashAccount, setCashAccount] = useState(
    () => cashAccounts.find((a) => a.isDefault)?.name ?? cashAccounts[0]?.name ?? "checking",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (Number(balance) <= 0) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-text underline">
        {direction === "payable" ? "Release" : "Collect"}
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const action = direction === "payable" ? releaseRetainagePayable : releaseRetainageReceivable;
    const result = await action({ jobId, amount, date, cashAccount });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border border-border bg-surface-2 p-3">
      {error && <div className="text-xs text-negative">{error}</div>}
      <Field label="Amount">
        <input
          className={inputClass}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <Field label="Date">
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      <Field label={direction === "payable" ? "From Account" : "Deposit To"}>
        <select className={inputClass} value={cashAccount} onChange={(e) => setCashAccount(e.target.value)}>
          {cashAccounts.length === 0 ? (
            <option value="checking">Checking</option>
          ) : (
            cashAccounts.map((a) => (
              <option key={a.name} value={a.name}>
                {a.label}
              </option>
            ))
          )}
        </select>
      </Field>
      <p className="text-xs text-text-3">Held: {formatUSD(balance)}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
