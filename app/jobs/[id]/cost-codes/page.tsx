import { getCostCodeBreakdown } from "@/lib/reports";
import { Money } from "@/components/Money";

export default async function JobCostCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await getCostCodeBreakdown(Number(id));

  if (rows.length === 0) {
    return <p className="text-neutral-500">No cost code budgets set for this job yet.</p>;
  }

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
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.costCode}>
              <td className="px-4 py-2">
                <div className="font-medium">{row.costCodeName}</div>
                <div className="text-xs text-neutral-500">{row.costCode}</div>
              </td>
              <td className="px-4 py-2">
                <Money value={row.budgeted} />
              </td>
              <td className="px-4 py-2">
                <Money value={row.estimatedAtCompletion} />
              </td>
              <td className="px-4 py-2">
                <Money value={row.actual} />
              </td>
              <td className="px-4 py-2">
                <Money value={row.remaining} colorize />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
