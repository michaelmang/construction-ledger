"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editOpeningBalance } from "@/app/actions/accounts";
import { inputClass, primaryButtonClass, secondaryButtonClass, Field } from "@/components/form";

export function EditOpeningBalanceForm({
  cashAccountId,
  openingBalance,
  openingDate,
}: {
  cashAccountId: number;
  openingBalance: string; // pre-formatted "0.00"
  openingDate: string; // "YYYY-MM-DD"
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(openingBalance);
  const [date, setDate] = useState(openingDate);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-text-2 hover:underline">
        Edit
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await editOpeningBalance({ cashAccountId, openingBalance: balance, openingDate: date });
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Opening Balance">
          <input
            className={inputClass}
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            required
          />
        </Field>
        <Field label="As Of">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
