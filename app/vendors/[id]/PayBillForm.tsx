"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payBill } from "@/app/actions/bills";
import { inputClass, primaryButtonClass, secondaryButtonClass, Field } from "@/components/form";
import { formatUSD } from "@/lib/money";

interface CashAccountOption {
  name: string;
  label: string;
  isDefault: boolean;
}

export function PayBillForm({
  billId,
  amountDue,
  cashAccounts,
}: {
  billId: number;
  amountDue: string; // pre-formatted "0.00" — Decimal instances aren't serializable across the RSC boundary
  cashAccounts: CashAccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(amountDue);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashAccount, setCashAccount] = useState(
    () => cashAccounts.find((a) => a.isDefault)?.name ?? cashAccounts[0]?.name ?? "checking",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-neutral-900 underline">
        Pay
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await payBill({ billId, amount, date, cashAccount });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Amount">
          <input
            className={inputClass}
            inputMode="decimal"
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
        <Field label="From Account">
          <select className={inputClass} value={cashAccount} onChange={(e) => setCashAccount(e.target.value)}>
            {cashAccounts.length === 0 ? (
              <option value="checking">Checking</option>
            ) : (
              cashAccounts.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.label}
                </option>
              ))
            )}
          </select>
        </Field>
      </div>
      <p className="text-xs text-neutral-500">Amount due: {formatUSD(amountDue)}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Paying…" : "Confirm Payment"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
