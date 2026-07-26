import Link from "next/link";
import { listVendorsWithBalances } from "@/lib/queries";
import { Money } from "@/components/Money";
import { VendorForm } from "./VendorForm";

export default async function VendorsPage() {
  const vendors = await listVendorsWithBalances();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Vendors</h1>

      <VendorForm />

      {vendors.length === 0 ? (
        <p className="text-text-3">No vendors yet.</p>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Open Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2">
                    <Link href={`/vendors/${v.id}`} className="font-medium text-text hover:underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Money value={v.openBalance} colorize />
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
