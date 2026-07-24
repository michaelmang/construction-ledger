"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOverheadCategory } from "@/app/actions/overhead";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function OverheadCategoryForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createOverheadCategory({ code, name });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setCode("");
    setName("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      {error && <div className="w-full text-sm text-negative">{error}</div>}
      <Field label="Code">
        <input
          className={inputClass}
          placeholder="OFFICE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          placeholder="Office Expenses"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Adding…" : "Add Category"}
      </button>
    </form>
  );
}
