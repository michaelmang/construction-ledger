"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { editLaborCost } from "@/app/actions/labor";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { laborAmounts, burdenDeltaPct } from "@/lib/labor";
import { formatUSD } from "@/lib/money";
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { EmployeeOption } from "../../../expenses/new/ExpenseForm";

interface CostCodeOption {
  id: number;
  code: string;
  name: string;
}

export interface LaborInitial {
  txnid: string;
  jobId: number;
  costCodeId: number;
  employeeId: number;
  hours: string; // pre-formatted
  date: string;
  memo: string;
}

export function LaborForm({
  jobId,
  costCodes,
  employees,
  initial,
}: {
  jobId: number;
  costCodes: CostCodeOption[];
  employees: EmployeeOption[];
  initial: LaborInitial;
}) {
  const router = useRouter();
  const [costCodeId, setCostCodeId] = useState<number | "">(initial.costCodeId);
  const [employeeId, setEmployeeId] = useState<number | "">(initial.employeeId);
  const [hours, setHours] = useState(initial.hours);
  const [date, setDate] = useState(initial.date);
  const [memo, setMemo] = useState(initial.memo);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId],
  );

  const preview = useMemo(() => {
    if (!selectedEmployee || !hours || Number(hours) <= 0) return null;
    try {
      const { gross, burdened } = laborAmounts(selectedEmployee, hours);
      return { gross, burdened, deltaPct: burdenDeltaPct(gross, burdened) };
    } catch {
      return null;
    }
  }, [selectedEmployee, hours]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (costCodeId === "" || employeeId === "") {
      setError("Choose a cost code and employee");
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await editLaborCost({
      txnid: initial.txnid,
      jobId,
      costCodeId,
      employeeId,
      hours,
      date,
      memo: memo || undefined,
    });
    if (!result.ok) {
      hapticError();
      setError(result.error);
      setSubmitting(false);
      return;
    }
    hapticSuccess();
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
      <Field label="Employee">
        <select
          className={inputClass}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">Select employee…</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Hours">
        <input
          className={inputClass}
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          required
        />
      </Field>
      {preview && (
        <div className="rounded-md border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-text-2">
          Gross: {formatUSD(preview.gross)} · Burdened: {formatUSD(preview.burdened)} (+
          {preview.deltaPct.toFixed(1)}%)
        </div>
      )}
      <Field label="Date">
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      <Field label="Memo" hint="optional">
        <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
