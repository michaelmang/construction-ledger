import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getEmployee, listActiveWorkersCompRates, getLaborBurdenSettings } from "@/lib/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmployeeForm } from "../../EmployeeForm";

// proxy.ts only asserts "signed in", not role — this page additionally
// requires admin (same principle as /users, /ledger-doctor), since
// updateEmployee() enforcing requireAdminRole() server-side isn't itself a
// substitute for gating the page a bookkeeper could otherwise navigate to
// directly and see full pay-rate data rendered into the form.
export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center text-sm text-text-2">
        Admins only.
      </div>
    );
  }

  const { id } = await params;
  const employee = await getEmployee(Number(id));
  if (!employee) notFound();

  const [wcCodesRaw, settings] = await Promise.all([
    listActiveWorkersCompRates(),
    getLaborBurdenSettings(),
  ]);
  const wcCodes = wcCodesRaw.map((wc) => ({ id: wc.id, code: wc.code, description: wc.description }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Employees" title={`Edit ${employee.name}`} />
      <EmployeeForm
        wcCodes={wcCodes}
        companyHolidayDays={settings?.companyHolidayDays ?? 13}
        initial={{
          id: employee.id,
          name: employee.name,
          number: employee.number ?? "",
          jobTitle: employee.jobTitle ?? "",
          payType: employee.payType as "salary" | "hourly",
          employmentType: employee.employmentType as
            | "full_time"
            | "part_time"
            | "seasonal"
            | "intern",
          wcCodeId: employee.wcCodeId ?? "",
          startDate: employee.startDate ? employee.startDate.toISOString().slice(0, 10) : "",
          holidayDays: employee.holidayDays === null ? "" : String(employee.holidayDays),
          discretionaryPtoHours: employee.discretionaryPtoHours.toFixed(2),
          currentPay: employee.currentPay.toFixed(2),
          healthInsMonthly: employee.healthInsMonthly.toFixed(2),
          retirementPct: employee.retirementPct.toString(),
          yearlyVehicleValue: employee.yearlyVehicleValue.toFixed(2),
        }}
      />
    </div>
  );
}
