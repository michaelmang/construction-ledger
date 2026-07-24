"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCostCode } from "@/app/actions/jobs";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function CostCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [csiDivision, setCsiDivision] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createCostCode({ code, name, csiDivision: csiDivision || undefined });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setCode("");
    setName("");
    setCsiDivision("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      {error && <div className="w-full text-sm text-red-700">{error}</div>}
      <Field label="Code">
        <input
          className={inputClass}
          placeholder="03-CONCRETE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          placeholder="Concrete"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="CSI Division" hint="optional">
        <input
          className={inputClass}
          placeholder="03"
          value={csiDivision}
          onChange={(e) => setCsiDivision(e.target.value)}
        />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Adding…" : "Add Cost Code"}
      </button>
    </form>
  );
}
