import { notFound } from "next/navigation";
import { getLaborEntry, listCostCodes, listActiveEmployees } from "@/lib/queries";
import { LaborForm } from "./LaborForm";

export default async function EditLaborPage({
  params,
}: {
  params: Promise<{ id: string; txnid: string }>;
}) {
  const { id, txnid } = await params;
  const laborEntry = await getLaborEntry(txnid);
  if (!laborEntry) notFound();

  const [costCodes, employeesRaw] = await Promise.all([listCostCodes(), listActiveEmployees()]);
  const employees = employeesRaw.map((e) => ({
    id: e.id,
    name: e.name,
    baseRate: e.baseRate.toString(),
    payrollTaxPct: e.payrollTaxPct.toString(),
    workersCompPct: e.workersCompPct.toString(),
    benefitsPct: e.benefitsPct.toString(),
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Edit Labor Cost</h2>
      <LaborForm
        jobId={Number(id)}
        costCodes={costCodes}
        employees={employees}
        initial={{
          txnid,
          jobId: laborEntry.jobId,
          costCodeId: laborEntry.costCodeId,
          employeeId: laborEntry.employeeId,
          hours: laborEntry.hours.toFixed(2),
          date: laborEntry.date.toISOString().slice(0, 10),
          memo: laborEntry.memo ?? "",
        }}
      />
    </div>
  );
}
