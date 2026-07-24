"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createChangeOrder } from "@/app/actions/change-orders";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function ChangeOrderForm({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [coNumber, setCoNumber] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createChangeOrder({
      jobId,
      coNumber: coNumber || undefined,
      description: description || undefined,
      amount,
      status: "pending",
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/change-orders`);
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
      <Field label="CO Number" hint="optional">
        <input className={inputClass} value={coNumber} onChange={(e) => setCoNumber(e.target.value)} />
      </Field>
      <Field label="Description" hint="optional">
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Amount" hint="can be negative">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="5000.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Creating…" : "Create Change Order"}
      </button>
    </form>
  );
}
