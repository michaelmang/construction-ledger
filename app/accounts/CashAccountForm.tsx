"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCashAccount } from "@/app/actions/accounts";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function CashAccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createCashAccount({
      name,
      label,
      openingBalance: openingBalance || undefined,
      openingDate: openingBalance ? openingDate : undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setName("");
    setLabel("");
    setOpeningBalance("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      {error && <div className="w-full text-sm text-red-700">{error}</div>}
      <Field label="Slug" hint='used in the ledger, e.g. "checking"'>
        <input
          className={inputClass}
          placeholder="checking"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Label">
        <input
          className={inputClass}
          placeholder="Operating Checking"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </Field>
      <Field label="Opening Balance" hint="optional">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0.00"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
        />
      </Field>
      {openingBalance && (
        <Field label="As Of">
          <input
            type="date"
            className={inputClass}
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
          />
        </Field>
      )}
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Adding…" : "Add Account"}
      </button>
    </form>
  );
}
