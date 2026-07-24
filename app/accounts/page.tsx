import { listCashAccounts } from "@/lib/queries";
import { Money } from "@/components/Money";
import { CashAccountForm } from "./CashAccountForm";

export default async function AccountsPage() {
  const accounts = await listCashAccounts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Accounts</h1>
      <p className="text-sm text-neutral-500">
        Cash accounts used for payments received and bills paid. The default account is
        preselected on payment forms.
      </p>

      <CashAccountForm />

      {accounts.length === 0 ? (
        <p className="text-neutral-500">No accounts yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Opening Balance</th>
                <th className="px-4 py-2 font-medium">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-neutral-500">{a.name}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Money value={a.openingBalance} />
                  </td>
                  <td className="px-4 py-2">{a.isDefault ? "Yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
