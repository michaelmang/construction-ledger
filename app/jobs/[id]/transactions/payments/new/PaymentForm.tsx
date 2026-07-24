"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment } from "@/app/actions/payments";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function PaymentForm({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await recordPayment({ jobId, amount, date, memo: memo || undefined });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/transactions`);
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
      <Field label="Amount">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="5000.00"
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
      <Field label="Memo" hint="optional">
        <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Recording…" : "Record Payment"}
      </button>
    </form>
  );
}
