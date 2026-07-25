"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { recordExpense, editExpense } from "@/app/actions/expenses";
import { recordLaborCost } from "@/app/actions/labor";
import { createVendor } from "@/app/actions/vendors";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { VendorPicker, VendorOption } from "@/components/VendorPicker";
import { COST_TYPES, COST_TYPE_LABEL, CostType } from "@/lib/cost-types";
import { laborAmounts, burdenDeltaPct } from "@/lib/labor";
import { formatUSD } from "@/lib/money";
import { hapticSuccess, hapticError } from "@/lib/haptics";

interface CostCodeOption {
  id: number;
  code: string;
  name: string;
}

export interface EmployeeOption {
  id: number;
  name: string;
  baseRate: string;
  payrollTaxPct: string;
  workersCompPct: string;
  benefitsPct: string;
}

export interface ExpenseInitial {
  txnid: string;
  vendorId: number;
  costCodeId: number;
  costType: CostType;
  amount: string; // pre-formatted "0.00"
  retainageWithheld: string; // pre-formatted "0.00", "0.00" means none
  date: string;
  description: string;
}

// Cost type is required on every job cost entry (v3 spec §F17). Selecting
// "labor" swaps the vendor+amount fields for an employee+hours picker and
// posts through recordLaborCost instead of recordExpense — labor takes its
// own action because it has no vendor/AP and posts a computed burdened
// amount, not a typed-in dollar figure (v3 spec §F18/§F19). Editing an
// existing expense never offers "labor": that conversion isn't supported —
// edit the entry as its own kind instead.
export function ExpenseForm({
  jobId,
  costCodes,
  vendors,
  employees,
  initial,
}: {
  jobId: number;
  costCodes: CostCodeOption[];
  vendors: VendorOption[];
  employees: EmployeeOption[];
  initial?: ExpenseInitial;
}) {
  const router = useRouter();
  const [costType, setCostType] = useState<CostType | "">(initial?.costType ?? "");
  const [vendorSelection, setVendorSelection] = useState<number | "new" | "">(initial?.vendorId ?? "");
  const [newVendorName, setNewVendorName] = useState("");
  const [costCodeId, setCostCodeId] = useState<number | "">(initial?.costCodeId ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [hours, setHours] = useState("");
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

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId],
  );

  const laborPreview = useMemo(() => {
    if (!selectedEmployee || !hours || Number(hours) <= 0) return null;
    try {
      const { gross, burdened } = laborAmounts(selectedEmployee, hours);
      const deltaPct = burdenDeltaPct(gross, burdened);
      return { gross, burdened, deltaPct };
    } catch {
      return null;
    }
  }, [selectedEmployee, hours]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (costCodeId === "") {
      setError("Choose a cost code");
      return;
    }
    if (costType === "") {
      setError("Choose a cost type");
      return;
    }

    if (costType === "labor") {
      if (employeeId === "") {
        setError("Choose an employee");
        return;
      }
      setSubmitting(true);
      setError(null);
      const result = await recordLaborCost({
        jobId,
        costCodeId,
        employeeId,
        hours,
        date,
        memo: description || undefined,
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
        hapticError();
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
      costType,
      amount,
      retainageWithheld: withholdRetainage && retainageWithheld ? retainageWithheld : undefined,
      date,
      description: description || undefined,
    };

    const result = initial
      ? await editExpense({ ...payload, txnid: initial.txnid })
      : await recordExpense(payload);
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
      <Field label="Cost Type">
        <select
          className={inputClass}
          value={costType}
          onChange={(e) => setCostType(e.target.value as CostType | "")}
          required
        >
          <option value="">Select cost type…</option>
          {COST_TYPES.filter((t) => !initial || t !== "labor").map((t) => (
            <option key={t} value={t}>
              {COST_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
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

      {costType === "labor" ? (
        <>
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
              placeholder="7.75"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </Field>
          {laborPreview && (
            <div className="rounded-md border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-text-2">
              Gross: {formatUSD(laborPreview.gross)} · Burdened: {formatUSD(laborPreview.burdened)}{" "}
              (+{laborPreview.deltaPct.toFixed(1)}%)
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Vendor">
            <VendorPicker
              vendors={vendors}
              value={vendorSelection}
              onChange={setVendorSelection}
              newName={newVendorName}
              onNewNameChange={setNewVendorName}
            />
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
        </>
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
      <Field label={costType === "labor" ? "Memo" : "Description"} hint="optional">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {costType !== "labor" && (
        <>
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
        </>
      )}

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : initial ? "Save Changes" : "Record Cost"}
      </button>
    </form>
  );
}
