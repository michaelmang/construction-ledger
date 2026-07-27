import { notFound } from "next/navigation";
import {
  getLaborEntry,
  listCostCodes,
  listActiveEmployees,
  toEmployeeOption,
  getCompanyAssumptions,
} from "@/lib/queries";
import { LaborForm } from "./LaborForm";

export default async function EditLaborPage({
  params,
}: {
  params: Promise<{ id: string; txnid: string }>;
}) {
  const { id, txnid } = await params;
  const laborEntry = await getLaborEntry(txnid);
  if (!laborEntry) notFound();

  const [costCodes, employeesRaw, company] = await Promise.all([
    listCostCodes(),
    listActiveEmployees(),
    getCompanyAssumptions(),
  ]);
  const employees = employeesRaw.map(toEmployeeOption);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Edit Labor Cost</h2>
      <LaborForm
        jobId={Number(id)}
        costCodes={costCodes}
        employees={employees}
        company={company}
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
