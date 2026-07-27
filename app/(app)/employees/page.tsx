import Link from "next/link";
import { listEmployees, listActiveWorkersCompRates, getCompanyAssumptions } from "@/lib/queries";
import { computeLaborBurden } from "@/lib/labor-burden";
import { formatUSD } from "@/lib/money";
import { EmployeeForm } from "./EmployeeForm";
import { EmployeeActiveToggle } from "./EmployeeActiveToggle";

export const dynamic = "force-dynamic";

const PAY_TYPE_LABEL: Record<string, string> = { salary: "Salary", hourly: "Hourly" };

export default async function EmployeesPage() {
  const [employees, wcCodesRaw, company] = await Promise.all([
    listEmployees(),
    listActiveWorkersCompRates(),
    getCompanyAssumptions(),
  ]);
  const wcCodes = wcCodesRaw.map((wc) => ({ id: wc.id, code: wc.code, description: wc.description }));

  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Employees</h1>
      <p className="text-sm text-text-3">
        Roster and job-costing inputs (pay type, workers&apos; comp classification, benefits,
        tenure) — recording a labor cost against a job posts the computed, fully-loaded hourly
        burden, not gross wages. Full breakdown per employee lives on{" "}
        <Link href="/job-costing" className="underline">
          Job Costing
        </Link>
        .
      </p>

      <EmployeeForm wcCodes={wcCodes} companyHolidayDays={company.companyHolidayDays} />

      {employees.length === 0 ? (
        <p className="text-text-3">No employees yet.</p>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Job Title</th>
                <th className="px-4 py-2 font-medium">Pay Type</th>
                <th className="px-4 py-2 font-medium">WC Code</th>
                <th className="px-4 py-2 font-medium">Hourly Labor Burden</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e) => {
                const burden = computeLaborBurden(
                  {
                    payType: e.payType as "salary" | "hourly",
                    startDate: e.startDate ?? e.createdAt,
                    holidayDays: e.holidayDays,
                    discretionaryPtoHours: e.discretionaryPtoHours,
                    currentPay: e.currentPay,
                    healthInsMonthly: e.healthInsMonthly,
                    retirementPct: e.retirementPct,
                    yearlyVehicleValue: e.yearlyVehicleValue,
                    wcRate: e.wcCode?.rate ?? 0,
                  },
                  company,
                  now,
                );
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-medium">{e.name}</td>
                    <td className="px-4 py-2 text-text-2">{e.number ?? "—"}</td>
                    <td className="px-4 py-2 text-text-2">{e.jobTitle ?? "—"}</td>
                    <td className="px-4 py-2 text-text-2">{PAY_TYPE_LABEL[e.payType] ?? e.payType}</td>
                    <td className="px-4 py-2 text-text-2">{e.wcCode?.description ?? "Unclassified"}</td>
                    <td className="px-4 py-2 font-mono tabular-nums font-medium">
                      {formatUSD(burden.hourlyLaborBurden)}/hr
                    </td>
                    <td className="px-4 py-2">
                      <EmployeeActiveToggle id={e.id} active={e.active} />
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/employees/${e.id}/edit`} className="text-text-2 hover:underline">
                        Edit
                      </Link>
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
