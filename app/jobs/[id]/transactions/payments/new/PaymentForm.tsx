"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment, editPayment } from "@/app/actions/payments";
import { inputClass, primaryButtonClass, Field } from "@/components/form";

interface CashAccountOption {
  name: string;
  label: string;
  isDefault: boolean;
}

interface UnpaidBillingOption {
  id: number;
  periodLabel: string | null;
  amountDue: string; // pre-formatted "0.00"
}

export interface PaymentInitial {
  txnid: string;
  amount: string;
  date: string;
  cashAccount: string;
  memo: string;
}

export function PaymentForm({
  jobId,
  cashAccounts,
  unpaidBillings,
  initial,
}: {
  jobId: number;
  cashAccounts: CashAccountOption[];
  unpaidBillings: UnpaidBillingOption[];
  initial?: PaymentInitial;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.date ?? (() => new Date().toISOString().slice(0, 10))());
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [billingId, setBillingId] = useState<number | "">("");
  const [cashAccount, setCashAccount] = useState(
    () =>
      initial?.cashAccount ??
      cashAccounts.find((a) => a.isDefault)?.name ??
      cashAccounts[0]?.name ??
      "checking",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedBilling = useMemo(
    () => unpaidBillings.find((b) => b.id === billingId),
    [billingId, unpaidBillings],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = initial
      ? await editPayment({ jobId, amount, date, cashAccount, memo: memo || undefined, txnid: initial.txnid })
      : await recordPayment({
          jobId,
          amount,
          date,
          cashAccount,
          memo: memo || undefined,
          billingId: billingId || undefined,
        });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/jobs/${jobId}/transactions`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg space-y-4 rounded-lg border border-neutral-200 bg-white p-6"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {!initial && unpaidBillings.length > 0 && (
        <Field label="Apply To" hint="optional — links this payment to a specific pay app for AR aging">
          <select
            className={inputClass}
            value={billingId}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : "";
              setBillingId(id);
              const billing = unpaidBillings.find((b) => b.id === id);
              if (billing) setAmount(billing.amountDue);
            }}
          >
            <option value="">General payment (not tied to a pay app)</option>
            {unpaidBillings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.periodLabel ?? `Billing #${b.id}`} — due {b.amountDue}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Amount">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="5000.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      {selectedBilling && (
        <p className="text-xs text-neutral-500">Amount due on this billing: {selectedBilling.amountDue}</p>
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
      <Field label="Deposit To">
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
      <Field label="Memo" hint="optional">
        <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : initial ? "Save Changes" : "Record Payment"}
      </button>
    </form>
  );
}
