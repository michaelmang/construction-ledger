"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBudget } from "@/app/actions/jobs";
import { formatUSD } from "@/lib/money";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

export interface CostCodeGridRow {
  costCodeId: number;
  costCode: string;
  costCodeName: string;
  budgeted: string; // pre-formatted "0.00" strings — Decimal isn't serializable across the RSC boundary
  estimatedAtCompletion: string;
  actual: string;
  remaining: string;
}

export interface AvailableCostCode {
  id: number;
  code: string;
  name: string;
}

function utilizationPct(actual: string, eac: string): number {
  const eacNum = Number(eac);
  if (eacNum === 0) return 0;
  return (Number(actual) / eacNum) * 100;
}

function GridRow({ row, jobId }: { row: CostCodeGridRow; jobId: number }) {
  const router = useRouter();
  const [budgeted, setBudgeted] = useState(row.budgeted);
  const [revisedEstimate, setRevisedEstimate] = useState(
    row.estimatedAtCompletion === row.budgeted ? "" : row.estimatedAtCompletion,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = budgeted !== row.budgeted || revisedEstimate !== (row.estimatedAtCompletion === row.budgeted ? "" : row.estimatedAtCompletion);
  const pct = utilizationPct(row.actual, row.estimatedAtCompletion);
  const over = pct > 100;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await setBudget({
      jobId,
      costCodeId: row.costCodeId,
      budgetedAmount: budgeted,
      revisedEstimate: revisedEstimate || null,
    });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <tr>
      <td className="px-4 py-2">
        <div className="font-medium">{row.costCodeName}</div>
        <div className="text-xs text-neutral-500">{row.costCode}</div>
      </td>
      <td className="px-4 py-2">
        <input
          className={`${inputClass} w-28`}
          inputMode="decimal"
          value={budgeted}
          onChange={(e) => setBudgeted(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <input
          className={`${inputClass} w-28`}
          inputMode="decimal"
          placeholder={row.budgeted}
          value={revisedEstimate}
          onChange={(e) => setRevisedEstimate(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">{formatUSD(row.actual)}</td>
      <td className="px-4 py-2">
        <span className={over ? "text-red-600" : ""}>{formatUSD(row.remaining)}</span>
        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full ${over ? "bg-red-500" : "bg-neutral-900"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </td>
      <td className="px-4 py-2">
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium text-neutral-900 underline disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {error && <div className="mt-1 text-xs text-red-700">{error}</div>}
      </td>
    </tr>
  );
}

function AddCostCodeRow({ jobId, available }: { jobId: number; available: AvailableCostCode[] }) {
  const router = useRouter();
  const [costCodeId, setCostCodeId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (available.length === 0) return null;

  async function handleAdd() {
    if (costCodeId === "" || !amount) {
      setError("Choose a cost code and enter a budget");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await setBudget({ jobId, costCodeId, budgetedAmount: amount });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setCostCodeId("");
    setAmount("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-neutral-200 bg-neutral-50 p-4">
      <Field label="Add Cost Code">
        <select
          className={inputClass}
          value={costCodeId}
          onChange={(e) => setCostCodeId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Select cost code…</option>
          {available.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.code} — {cc.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Budgeted Amount">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="10000.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <button type="button" onClick={handleAdd} disabled={saving} className={primaryButtonClass}>
        {saving ? "Adding…" : "Add"}
      </button>
      {error && <div className="w-full text-xs text-red-700">{error}</div>}
    </div>
  );
}

export function CostCodeGrid({
  jobId,
  rows,
  available,
}: {
  jobId: number;
  rows: CostCodeGridRow[];
  available: AvailableCostCode[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Cost Code</th>
            <th className="px-4 py-2 font-medium">Budgeted</th>
            <th className="px-4 py-2 font-medium">Est. at Completion</th>
            <th className="px-4 py-2 font-medium">Actual</th>
            <th className="px-4 py-2 font-medium">Remaining</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {/*
            Keying on the committed values (not just costCodeId) forces a
            remount after a successful save, so local edit state resets to
            the fresh server value instead of showing "Save" forever —
            react-hooks/set-state-in-effect steers away from syncing props to
            state via useEffect for exactly this case.
          */}
          {rows.map((row) => (
            <GridRow
              key={`${row.costCodeId}-${row.budgeted}-${row.estimatedAtCompletion}`}
              row={row}
              jobId={jobId}
            />
          ))}
        </tbody>
      </table>
      <AddCostCodeRow jobId={jobId} available={available} />
    </div>
  );
}
