import { listCashAccounts } from "@/lib/queries";
import { Money } from "@/components/Money";
import { CashAccountForm } from "./CashAccountForm";
import { EditOpeningBalanceForm } from "./EditOpeningBalanceForm";

export default async function AccountsPage() {
  const accounts = await listCashAccounts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Accounts</h1>
      <p className="text-sm text-text-3">
        Cash accounts used for payments received and bills paid. The default account is
        preselected on payment forms.
      </p>

      <CashAccountForm />

      {accounts.length === 0 ? (
        <p className="text-text-3">No accounts yet.</p>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Opening Balance</th>
                <th className="px-4 py-2 font-medium">Default</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 align-top">
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-text-3">{a.name}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <Money value={a.openingBalance} />
                  </td>
                  <td className="px-4 py-2 align-top">{a.isDefault ? "Yes" : ""}</td>
                  <td className="px-4 py-2 align-top">
                    <EditOpeningBalanceForm
                      cashAccountId={a.id}
                      openingBalance={a.openingBalance.toFixed(2)}
                      openingDate={(a.openingDate ?? a.createdAt).toISOString().slice(0, 10)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
