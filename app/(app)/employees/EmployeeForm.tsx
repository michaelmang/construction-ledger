"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee } from "@/app/actions/employees";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export function EmployeeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [baseRate, setBaseRate] = useState("");
  const [payrollTaxPct, setPayrollTaxPct] = useState("");
  const [workersCompPct, setWorkersCompPct] = useState("");
  const [benefitsPct, setBenefitsPct] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createEmployee({
      name,
      baseRate,
      payrollTaxPct: payrollTaxPct || undefined,
      workersCompPct: workersCompPct || undefined,
      benefitsPct: benefitsPct || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setName("");
    setBaseRate("");
    setPayrollTaxPct("");
    setWorkersCompPct("");
    setBenefitsPct("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      {error && <div className="w-full text-sm text-negative">{error}</div>}
      <Field label="Name">
        <input
          className={inputClass}
          placeholder="Jane Rivera"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Base Rate" hint="$/hr">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="33.33"
          value={baseRate}
          onChange={(e) => setBaseRate(e.target.value)}
          required
        />
      </Field>
      <Field label="Payroll Tax" hint="e.g. 0.0765 for 7.65%">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0.0765"
          value={payrollTaxPct}
          onChange={(e) => setPayrollTaxPct(e.target.value)}
        />
      </Field>
      <Field label="Workers' Comp" hint="decimal fraction">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0.095"
          value={workersCompPct}
          onChange={(e) => setWorkersCompPct(e.target.value)}
        />
      </Field>
      <Field label="Benefits" hint="decimal fraction">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0.11"
          value={benefitsPct}
          onChange={(e) => setBenefitsPct(e.target.value)}
        />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Adding…" : "Add Employee"}
      </button>
    </form>
  );
}
