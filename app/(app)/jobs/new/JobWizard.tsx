"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, createCostCode, setBudget } from "@/app/actions/jobs";
import { inputClass, primaryButtonClass, secondaryButtonClass, Field } from "@/components/form";

interface CostCodeOption {
  id: number;
  code: string;
  name: string;
}

interface BudgetRow {
  key: string;
  costCodeId: number | "new" | "";
  newCode: string;
  newName: string;
  budgetedAmount: string;
}

function emptyRow(): BudgetRow {
  return { key: crypto.randomUUID(), costCodeId: "", newCode: "", newName: "", budgetedAmount: "" };
}

export function JobWizard({ existingCostCodes }: { existingCostCodes: CostCodeOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetEndDate, setTargetEndDate] = useState("");

  const [contractValue, setContractValue] = useState("");
  const [retainagePctInput, setRetainagePctInput] = useState("10");

  const [rows, setRows] = useState<BudgetRow[]>([emptyRow()]);

  function updateRow(key: string, patch: Partial<BudgetRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const jobResult = await createJob({
        code,
        name,
        clientName: clientName || undefined,
        contractValue: contractValue || undefined,
        retainagePct: retainagePctInput
          ? (Number(retainagePctInput) / 100).toString()
          : undefined,
        startDate: startDate || undefined,
        targetEndDate: targetEndDate || undefined,
      });
      if (!jobResult.ok) {
        setError(jobResult.error);
        setSubmitting(false);
        return;
      }
      const jobId = jobResult.data.id;

      for (const row of rows) {
        if (!row.budgetedAmount) continue;

        let costCodeId: number;
        if (row.costCodeId === "new") {
          if (!row.newCode || !row.newName) continue;
          const ccResult = await createCostCode({ code: row.newCode, name: row.newName });
          if (!ccResult.ok) {
            setError(ccResult.error);
            setSubmitting(false);
            return;
          }
          costCodeId = ccResult.data.id;
        } else if (row.costCodeId !== "") {
          costCodeId = row.costCodeId;
        } else {
          continue;
        }

        const budgetResult = await setBudget({ jobId, costCodeId, budgetedAmount: row.budgetedAmount });
        if (!budgetResult.ok) {
          setError(budgetResult.error);
          setSubmitting(false);
          return;
        }
      }

      router.push(`/jobs/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ol className="flex gap-4 text-sm">
        {["Job Details", "Financials", "Cost Code Budgets"].map((label, i) => (
          <li
            key={label}
            className={
              step === i + 1
                ? "font-semibold text-text"
                : step > i + 1
                  ? "text-text-3"
                  : "text-text-3/50"
            }
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-md border border-negative/30 bg-negative-soft px-4 py-2 text-sm text-negative">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <Field label="Job Code" hint="Short slug, e.g. J2026-014">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Job Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Client Name">
            <input
              className={inputClass}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date">
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Target End Date">
              <input
                type="date"
                className={inputClass}
                value={targetEndDate}
                onChange={(e) => setTargetEndDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!code || !name}
              onClick={() => setStep(2)}
              className={primaryButtonClass}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <Field label="Contract Value">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="180000.00"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
            />
          </Field>
          <Field label="Retainage %" hint="Percent withheld from each progress billing, e.g. 10">
            <input
              className={inputClass}
              inputMode="decimal"
              value={retainagePctInput}
              onChange={(e) => setRetainagePctInput(e.target.value)}
            />
          </Field>
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(1)} className={secondaryButtonClass}>
              Back
            </button>
            <button type="button" onClick={() => setStep(3)} className={primaryButtonClass}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-3">
            Set an initial budget per cost code. You can adjust these later.
          </p>
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
              {row.costCodeId === "new" ? (
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <input
                    className={inputClass}
                    placeholder="Code, e.g. 03-CONCRETE"
                    value={row.newCode}
                    onChange={(e) => updateRow(row.key, { newCode: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    placeholder="Name, e.g. Concrete"
                    value={row.newName}
                    onChange={(e) => updateRow(row.key, { newName: e.target.value })}
                  />
                </div>
              ) : (
                <select
                  className={inputClass}
                  value={row.costCodeId}
                  onChange={(e) =>
                    updateRow(row.key, {
                      costCodeId: e.target.value === "new" ? "new" : e.target.value ? Number(e.target.value) : "",
                    })
                  }
                >
                  <option value="">Select cost code…</option>
                  {existingCostCodes.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} — {cc.name}
                    </option>
                  ))}
                  <option value="new">+ New cost code…</option>
                </select>
              )}
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="Budgeted amount"
                value={row.budgetedAmount}
                onChange={(e) => updateRow(row.key, { budgetedAmount: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                className="px-2 py-2 text-text-3 hover:text-negative"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="text-sm text-text-2 underline"
          >
            + Add another cost code
          </button>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(2)} className={secondaryButtonClass}>
              Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className={primaryButtonClass}
            >
              {submitting ? "Creating…" : "Create Job"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
