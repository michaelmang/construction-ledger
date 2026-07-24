"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createVendor } from "@/app/actions/vendors";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function VendorForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createVendor({ name });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setName("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      {error && <div className="w-full text-sm text-negative">{error}</div>}
      <Field label="Vendor Name">
        <input
          className={inputClass}
          placeholder="Ace Concrete Supply"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Adding…" : "Add Vendor"}
      </button>
    </form>
  );
}
