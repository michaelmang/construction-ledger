"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editBillPayment } from "@/app/actions/bills";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { hapticSuccess, hapticError } from "@/lib/haptics";

interface CashAccountOption {
  name: string;
  label: string;
  isDefault: boolean;
}

export function BillPaymentForm({
  billId,
  vendorName,
  cashAccounts,
  initial,
}: {
  billId: number;
  vendorName: string;
  cashAccounts: CashAccountOption[];
  initial: { txnid: string; amount: string; date: string; cashAccount: string };
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [cashAccount, setCashAccount] = useState(initial.cashAccount);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await editBillPayment({
      txnid: initial.txnid,
      billId,
      amount,
      date,
      cashAccount,
    });
    if (!result.ok) {
      hapticError();
      setError(result.error);
      setSubmitting(false);
      return;
    }
    hapticSuccess();
    router.back();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
      {error && (
        <div className="rounded-md border border-negative/30 bg-negative-soft px-4 py-2 text-sm text-negative">
          {error}
        </div>
      )}
      <p className="text-sm text-text-2">Payment to {vendorName}</p>
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
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
