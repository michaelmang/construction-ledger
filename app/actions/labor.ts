"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  recordLaborSchema,
  editLaborSchema,
  txnidSchema,
  RecordLaborInput,
  EditLaborInput,
} from "@/lib/validation";
import { accruedPayroll, employeeSlug, expenseJobCostCode } from "@/lib/accounts";
import { laborAmounts } from "@/lib/labor";
import { JournalValidationError } from "@/lib/journal";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";

class ActionError extends Error {}

// Labor is a burdened job cost, not a vendor bill — no AP posting, no Bill
// row. It clears through liabilities:accrued payroll (v3 spec §F18/§F19
// design decision 4). Rates are snapshotted onto the LaborEntry row from the
// Employee at build time, so a later rate change never rewrites the cost of
// past work.
async function buildLaborEntry(
  jobId: number,
  costCodeId: number,
  employeeId: number,
  hoursStr: string,
  date: string,
  memo: string | undefined,
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new ActionError(`Job ${jobId} not found`);
  if (job.status === "archived") throw new ActionError(`Job ${job.code} is archived`);

  const costCode = await prisma.costCode.findUnique({ where: { id: costCodeId } });
  if (!costCode) throw new ActionError(`Cost code ${costCodeId} not found`);

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new ActionError(`Employee ${employeeId} not found`);

  const hours = new Decimal(hoursStr);
  const components = {
    baseRate: employee.baseRate,
    payrollTaxPct: employee.payrollTaxPct,
    workersCompPct: employee.workersCompPct,
    benefitsPct: employee.benefitsPct,
  };
  const { gross, burdened } = laborAmounts(components, hours);
  const rate = burdened.dividedBy(hours);
  const slug = employeeSlug(employee.name);
  const description = `${employee.name} — ${hours.toFixed(2)}h ${costCode.code}${memo ? ` - ${memo}` : ""}`;

  return {
    job,
    costCode,
    employee,
    hours,
    grossAmount: gross,
    burdenedAmount: burdened,
    burdenedRate: rate,
    entry: {
      kind: "labor" as const,
      jobId: job.id,
      date,
      description,
      tags: { job: job.code, code: costCode.code, costtype: "labor", employee: slug },
      postings: [
        { account: expenseJobCostCode(job.code, costCode.code), amount: burdened },
        { account: accruedPayroll(), amount: burdened.negated() },
      ],
      amount: burdened,
      memo: description,
    },
  };
}

export async function recordLaborCost(
  input: RecordLaborInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = recordLaborSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { job, costCode, employee, hours, grossAmount, burdenedAmount, burdenedRate, entry } =
      await buildLaborEntry(data.jobId, data.costCodeId, data.employeeId, data.hours, data.date, data.memo);

    const { txnid } = await recordTransaction(
      entry,
      `labor: ${job.code} ${costCode.code} ${formatUSD(burdenedAmount)}`,
    );

    await prisma.laborEntry.create({
      data: {
        txnid,
        employeeId: employee.id,
        jobId: job.id,
        costCodeId: costCode.id,
        date: new Date(data.date),
        hours: hours.toFixed(2),
        baseRate: employee.baseRate,
        burdenedRate: burdenedRate.toFixed(2),
        grossAmount: grossAmount.toFixed(2),
        burdenedAmount: burdenedAmount.toFixed(2),
        memo: data.memo,
      },
    });

    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function editLaborCost(
  input: EditLaborInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = editLaborSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { job, costCode, employee, hours, grossAmount, burdenedAmount, burdenedRate, entry } =
      await buildLaborEntry(data.jobId, data.costCodeId, data.employeeId, data.hours, data.date, data.memo);

    await updateTransaction(
      data.txnid,
      entry,
      `edit labor: ${job.code} ${costCode.code} ${formatUSD(burdenedAmount)}`,
    );

    await prisma.laborEntry.update({
      where: { txnid: data.txnid },
      data: {
        employeeId: employee.id,
        jobId: job.id,
        costCodeId: costCode.id,
        date: new Date(data.date),
        hours: hours.toFixed(2),
        baseRate: employee.baseRate,
        burdenedRate: burdenedRate.toFixed(2),
        grossAmount: grossAmount.toFixed(2),
        burdenedAmount: burdenedAmount.toFixed(2),
        memo: data.memo,
      },
    });

    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid: data.txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function deleteLaborCost(txnid: string): Promise<ActionResult<{ txnid: string }>> {
  const parsed = txnidSchema.safeParse(txnid);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const existing = await prisma.journalTxn.findUnique({ where: { txnid } });
    if (!existing) return fail(`No transaction found with txnid ${txnid}`);

    await removeTransaction(txnid, `delete labor: ${existing.memo ?? txnid}`);
    await prisma.laborEntry.deleteMany({ where: { txnid } });

    if (existing.jobId) revalidatePath(`/jobs/${existing.jobId}`);
    return ok({ txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

function actionErrorMessage(err: unknown): string {
  if (err instanceof ActionError || err instanceof JournalValidationError) return err.message;
  const e = err as { code?: string };
  if (e.code === "P2025") return "Record not found";
  return err instanceof Error ? err.message : "Unexpected error";
}
