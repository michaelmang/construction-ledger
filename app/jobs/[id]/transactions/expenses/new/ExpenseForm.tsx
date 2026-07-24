"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordExpense, editExpense } from "@/app/actions/expenses";
import { createVendor } from "@/app/actions/vendors";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { VendorPicker, VendorOption } from "@/components/VendorPicker";

interface CostCodeOption {
  id: number;
  code: string;
  name: string;
}

export interface ExpenseInitial {
  txnid: string;
  vendorId: number;
  costCodeId: number;
  amount: string; // pre-formatted "0.00"
  retainageWithheld: string; // pre-formatted "0.00", "0.00" means none
  date: string;
  description: string;
}

export function ExpenseForm({
  jobId,
  costCodes,
  vendors,
  initial,
}: {
  jobId: number;
  costCodes: CostCodeOption[];
  vendors: VendorOption[];
  initial?: ExpenseInitial;
}) {
  const router = useRouter();
  const [vendorSelection, setVendorSelection] = useState<number | "new" | "">(initial?.vendorId ?? "");
  const [newVendorName, setNewVendorName] = useState("");
  const [costCodeId, setCostCodeId] = useState<number | "">(initial?.costCodeId ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [withholdRetainage, setWithholdRetainage] = useState(
    initial ? Number(initial.retainageWithheld) > 0 : false,
  );
  const [retainageWithheld, setRetainageWithheld] = useState(
    initial && Number(initial.retainageWithheld) > 0 ? initial.retainageWithheld : "",
  );
  const [date, setDate] = useState(initial?.date ?? (() => new Date().toISOString().slice(0, 10))());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (costCodeId === "") {
      setError("Choose a cost code");
      return;
    }
    if (vendorSelection === "") {
      setError("Choose a vendor");
      return;
    }
    setSubmitting(true);
    setError(null);

    let vendorId: number;
    if (vendorSelection === "new") {
      if (!newVendorName.trim()) {
        setError("Enter a name for the new vendor");
        setSubmitting(false);
        return;
      }
      const vendorResult = await createVendor({ name: newVendorName.trim() });
      if (!vendorResult.ok) {
        setError(vendorResult.error);
        setSubmitting(false);
        return;
      }
      vendorId = vendorResult.data.id;
    } else {
      vendorId = vendorSelection;
    }

    const payload = {
      jobId,
      costCodeId,
      vendorId,
      amount,
      retainageWithheld: withholdRetainage && retainageWithheld ? retainageWithheld : undefined,
      date,
      description: description || undefined,
    };

    const result = initial
      ? await editExpense({ ...payload, txnid: initial.txnid })
      : await recordExpense(payload);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/transactions`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
      {error && (
        <div className="rounded-md border border-negative/30 bg-negative-soft px-4 py-2 text-sm text-negative">
          {error}
        </div>
      )}
      <Field label="Vendor">
        <VendorPicker
          vendors={vendors}
          value={vendorSelection}
          onChange={setVendorSelection}
          newName={newVendorName}
          onNewNameChange={setNewVendorName}
        />
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

      <label className="flex items-center gap-2 text-sm text-text-2">
        <input
          type="checkbox"
          checked={withholdRetainage}
          onChange={(e) => setWithholdRetainage(e.target.checked)}
        />
        Withholding retainage from this sub&apos;s bill
      </label>
      {withholdRetainage && (
        <Field label="Retainage Withheld" hint="owed back to the vendor once accepted">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0.00"
            value={retainageWithheld}
            onChange={(e) => setRetainageWithheld(e.target.value)}
          />
        </Field>
      )}

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : initial ? "Save Changes" : "Record Expense"}
      </button>
    </form>
  );
}
