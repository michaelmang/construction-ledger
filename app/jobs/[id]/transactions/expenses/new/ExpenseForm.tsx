"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordExpense } from "@/app/actions/expenses";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

interface CostCodeOption {
  id: number;
  code: string;
  name: string;
}

export function ExpenseForm({ jobId, costCodes }: { jobId: number; costCodes: CostCodeOption[] }) {
  const router = useRouter();
  const [vendor, setVendor] = useState("");
  const [costCodeId, setCostCodeId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (costCodeId === "") {
      setError("Choose a cost code");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await recordExpense({
      jobId,
      costCodeId,
      vendor,
      amount,
      date,
      description: description || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/transactions`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <Field label="Vendor">
        <input className={inputClass} value={vendor} onChange={(e) => setVendor(e.target.value)} required />
      </Field>
      <Field label="Cost Code">
        <select
          className={inputClass}
          value={costCodeId}
          onChange={(e) => setCostCodeId(e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">Select cost code…</option>
          {costCodes.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.code} — {cc.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="4200.00"
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
      <Field label="Description" hint="optional">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Recording…" : "Record Expense"}
      </button>
    </form>
  );
}
