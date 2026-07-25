import Decimal from "decimal.js";
import { listEmployees } from "@/lib/queries";
import { burdenedRate } from "@/lib/labor";
import { formatUSD } from "@/lib/money";
import { EmployeeForm } from "./EmployeeForm";
import { EmployeeActiveToggle } from "./EmployeeActiveToggle";

export const dynamic = "force-dynamic";

function pct(value: Decimal.Value): string {
  return `${new Decimal(value).times(100).toFixed(2)}%`;
}

export default async function EmployeesPage() {
  const employees = await listEmployees();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Employees</h1>
      <p className="text-sm text-text-3">
        Base rate plus burden components (payroll tax, workers&apos; comp, benefits) — recording a
        labor cost against a job posts the burdened rate, not gross wages.
      </p>

      <EmployeeForm />

      {employees.length === 0 ? (
        <p className="text-text-3">No employees yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Base Rate</th>
                <th className="px-4 py-2 font-medium">Payroll Tax</th>
                <th className="px-4 py-2 font-medium">Workers&apos; Comp</th>
                <th className="px-4 py-2 font-medium">Benefits</th>
                <th className="px-4 py-2 font-medium">Burdened Rate</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e) => {
                const rate = burdenedRate({
                  baseRate: e.baseRate,
                  payrollTaxPct: e.payrollTaxPct,
                  workersCompPct: e.workersCompPct,
                  benefitsPct: e.benefitsPct,
                });
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-medium">{e.name}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">{formatUSD(e.baseRate)}/hr</td>
                    <td className="px-4 py-2 text-text-2">{pct(e.payrollTaxPct)}</td>
                    <td className="px-4 py-2 text-text-2">{pct(e.workersCompPct)}</td>
                    <td className="px-4 py-2 text-text-2">{pct(e.benefitsPct)}</td>
                    <td className="px-4 py-2 font-mono tabular-nums font-medium">
                      {formatUSD(rate)}/hr
                    </td>
                    <td className="px-4 py-2">
                      <EmployeeActiveToggle id={e.id} active={e.active} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
