"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordOverheadExpense } from "@/app/actions/overhead";
import { createVendor } from "@/app/actions/vendors";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { VendorPicker, VendorOption } from "@/components/VendorPicker";

interface CategoryOption {
  id: number;
  code: string;
  name: string;
}

export function OverheadExpenseForm({
  vendors,
  categories,
}: {
  vendors: VendorOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [vendorSelection, setVendorSelection] = useState<number | "new" | "">("");
  const [newVendorName, setNewVendorName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (categoryId === "") {
      setError("Choose a category");
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

    const result = await recordOverheadExpense({
      vendorId,
      overheadCategoryId: categoryId,
      amount,
      date,
      description: description || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push("/overhead");
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
        <VendorPicker
          vendors={vendors}
          value={vendorSelection}
          onChange={setVendorSelection}
          newName={newVendorName}
          onNewNameChange={setNewVendorName}
        />
      </Field>
      <Field label="Category">
        <select
          className={inputClass}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="450.00"
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
        {submitting ? "Recording…" : "Record Overhead Expense"}
      </button>
    </form>
  );
}
