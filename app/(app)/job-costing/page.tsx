import { auth } from "@/auth";
import { listEmployees, listWorkersCompRates, getCompanyAssumptions } from "@/lib/queries";
import { computeLaborBurden } from "@/lib/labor-burden";
import { formatUSD } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  tableWrapClass,
  tableClass,
  theadClass,
  thClass,
  tbodyClass,
  trClass,
  tdClass,
  tdNumericClass,
} from "@/components/table";

const filterInputClass =
  "rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

// Company-wide job-costing reference (V5 spec) — mirrors the PM-provided
// Excel workbook's own "Table" tab: per-employee Annual Gross, Total
// Yearly Package, and the fully-loaded Hourly/OT Labor Burden rates, for
// estimating and job-costing use. Admin-only, same as the Employee roster
// itself — every figure here is derived from pay-rate inputs (health
// insurance, retirement %, current pay) that are admin-only everywhere
// else in this app, so this screen doesn't carve out an exception.
export default async function JobCostingPage({
  searchParams,
}: {
  searchParams: Promise<{ active?: string; jobTitle?: string; wcCodeId?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center text-sm text-text-2">
        Admins only.
      </div>
    );
  }

  const { active, jobTitle, wcCodeId } = await searchParams;
  const [employeesRaw, wcCodes, company] = await Promise.all([
    listEmployees(),
    listWorkersCompRates(),
    getCompanyAssumptions(),
  ]);

  let employees = employeesRaw;
  if (active === "true") employees = employees.filter((e) => e.active);
  if (active === "false") employees = employees.filter((e) => !e.active);
  if (jobTitle) {
    const needle = jobTitle.toLowerCase();
    employees = employees.filter((e) => (e.jobTitle ?? "").toLowerCase().includes(needle));
  }
  if (wcCodeId) {
    employees = employees.filter((e) => e.wcCodeId === Number(wcCodeId));
  }

  const now = new Date();
  const rows = employees.map((e) => {
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
    return { employee: e, burden };
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reference" title="Job Costing" />
      <p className="text-sm text-text-3">
        Fully-loaded labor cost per employee — Total Yearly Package and Hourly/OT Labor Burden are
        computed from pay type, workers&apos; comp classification, PTO/sick accrual, benefits, and
        employer payroll tax (see the Employees page to edit inputs, or Settings → Labor Burden for
        the company-wide assumptions this is computed from).
      </p>

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-text-3">Active?</label>
          <select name="active" defaultValue={active ?? ""} className={filterInputClass}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-3">Job Title</label>
          <input
            type="text"
            name="jobTitle"
            defaultValue={jobTitle ?? ""}
            placeholder="Filter…"
            className={`w-40 ${filterInputClass}`}
          />
        </div>
        <div>
          <label className="block text-xs text-text-3">WC Code</label>
          <select name="wcCodeId" defaultValue={wcCodeId ?? ""} className={filterInputClass}>
            <option value="">All</option>
            {wcCodes.map((wc) => (
              <option key={wc.id} value={wc.id}>
                {wc.description} ({wc.code})
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2"
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState label="No Employees" message="No employees match these filters." />
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Number</th>
                <th className={thClass}>Job Title</th>
                <th className={thClass}>Annual Gross</th>
                <th className={thClass}>Total Yearly Package</th>
                <th className={thClass}>Hourly Labor Burden</th>
                <th className={thClass}>OT Labor Burden</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {rows.map(({ employee: e, burden }) => (
                <tr key={e.id} className={trClass}>
                  <td className={tdClass}>{e.name}</td>
                  <td className={tdClass}>{e.number ?? "—"}</td>
                  <td className={tdClass}>{e.jobTitle ?? "—"}</td>
                  <td className={tdNumericClass}>{formatUSD(burden.yearlyRate)}</td>
                  <td className={tdNumericClass}>{formatUSD(burden.yearlyPackage)}</td>
                  <td className={tdNumericClass}>{formatUSD(burden.hourlyLaborBurden)}/hr</td>
                  <td className={tdNumericClass}>
                    {burden.otLaborBurden.isZero() ? "—" : `${formatUSD(burden.otLaborBurden)}/hr`}
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
