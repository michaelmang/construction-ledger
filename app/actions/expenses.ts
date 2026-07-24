"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { recordExpenseSchema, RecordExpenseInput } from "@/lib/validation";
import { accountsPayable, expenseJobCostCode } from "@/lib/accounts";
import { writeEntry, JournalValidationError } from "@/lib/journal";
import { commitJournalChanges } from "@/lib/journal-git";
import { formatUSD } from "@/lib/money";

export async function recordExpense(
  input: RecordExpenseInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = recordExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  const job = await prisma.job.findUnique({ where: { id: data.jobId } });
  if (!job) return fail(`Job ${data.jobId} not found`);
  if (job.status === "archived") return fail(`Job ${job.code} is archived`);

  const costCode = await prisma.costCode.findUnique({ where: { id: data.costCodeId } });
  if (!costCode) return fail(`Cost code ${data.costCodeId} not found`);

  const amount = new Decimal(data.amount);
  const vendorSlug = data.vendor.trim().toLowerCase();

  try {
    const { txnid } = await writeEntry({
      date: data.date,
      description: data.description
        ? `${data.vendor} - ${data.description}`
        : data.vendor,
      tags: { job: job.code, code: costCode.code },
      postings: [
        { account: expenseJobCostCode(job.code, costCode.code), amount },
        { account: accountsPayable(vendorSlug), amount: amount.negated() },
      ],
    });

    await prisma.journalTxn.create({
      data: {
        txnid,
        jobId: job.id,
        kind: "expense",
        date: new Date(data.date),
        amount: data.amount,
        memo: `${data.vendor}${data.description ? " - " + data.description : ""}`,
      },
    });

    await commitJournalChanges(
      `expense: ${job.code} ${costCode.code} ${formatUSD(amount)}`,
    );

    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid });
  } catch (err) {
    if (err instanceof JournalValidationError) return fail(err.message);
    return fail(err instanceof Error ? err.message : "Failed to record expense");
  }
}
