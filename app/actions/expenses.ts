"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  recordExpenseSchema,
  editExpenseSchema,
  txnidSchema,
  RecordExpenseInput,
  EditExpenseInput,
} from "@/lib/validation";
import {
  accountsPayable,
  expenseJobCostCode,
  retainagePayable,
  vendorAccountSlug,
} from "@/lib/accounts";
import { JournalValidationError } from "@/lib/journal";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";

class ActionError extends Error {}

async function buildExpenseEntry(
  jobId: number,
  costCodeId: number,
  vendorId: number,
  costType: string,
  amountStr: string,
  retainageWithheldStr: string | undefined,
  date: string,
  description: string | undefined,
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new ActionError(`Job ${jobId} not found`);
  if (job.status === "archived") throw new ActionError(`Job ${job.code} is archived`);

  const costCode = await prisma.costCode.findUnique({ where: { id: costCodeId } });
  if (!costCode) throw new ActionError(`Cost code ${costCodeId} not found`);

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new ActionError(`Vendor ${vendorId} not found`);

  const amount = new Decimal(amountStr);
  const retainageWithheld = retainageWithheldStr ? new Decimal(retainageWithheldStr) : new Decimal(0);
  if (retainageWithheld.greaterThan(amount)) {
    throw new ActionError("Retainage withheld cannot exceed the bill amount");
  }

  const vendorSlug = vendorAccountSlug(vendor.name);
  const apAmount = amount.minus(retainageWithheld);

  // Withholding retainage from a sub's bill splits the credit side: part to
  // AP (what we still owe now), part to retainage payable (owed back once
  // the sub's work is accepted) — v2 spec §F1.
  const postings = retainageWithheld.isZero()
    ? [
        { account: expenseJobCostCode(job.code, costCode.code), amount },
        { account: accountsPayable(vendorSlug), amount: amount.negated() },
      ]
    : [
        { account: expenseJobCostCode(job.code, costCode.code), amount },
        { account: accountsPayable(vendorSlug), amount: apAmount.negated() },
        { account: retainagePayable(job.code), amount: retainageWithheld.negated() },
      ];

  return {
    job,
    costCode,
    vendor,
    amount,
    retainageWithheld,
    entry: {
      kind: "expense" as const,
      jobId: job.id,
      date,
      description: description ? `${vendor.name} - ${description}` : vendor.name,
      tags: { job: job.code, code: costCode.code, vendor: vendorSlug, costtype: costType },
      postings,
      amount,
      memo: `${vendor.name}${description ? " - " + description : ""}`,
    },
  };
}

async function assertBillEditable(txnid: string): Promise<void> {
  const bill = await prisma.bill.findUnique({ where: { txnid } });
  if (bill && bill.paidAmount.greaterThan(0)) {
    throw new ActionError(
      "Cannot change this expense — payments have already been applied to its bill",
    );
  }
}

export async function recordExpense(
  input: RecordExpenseInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = recordExpenseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { job, costCode, vendor, amount, retainageWithheld, entry } = await buildExpenseEntry(
      data.jobId,
      data.costCodeId,
      data.vendorId,
      data.costType,
      data.amount,
      data.retainageWithheld,
      data.date,
      data.description,
    );

    const { txnid } = await recordTransaction(
      entry,
      `expense: ${job.code} ${costCode.code} ${formatUSD(amount)}`,
    );

    await prisma.bill.create({
      data: {
        vendorId: vendor.id,
        jobId: job.id,
        costCodeId: costCode.id,
        amount: amount.toFixed(2),
        retainageWithheld: retainageWithheld.toFixed(2),
        date: new Date(data.date),
        description: data.description,
        costType: data.costType,
        txnid,
      },
    });

    revalidatePath(`/jobs/${job.id}`);
    revalidatePath(`/vendors/${vendor.id}`);
    return ok({ txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function editExpense(
  input: EditExpenseInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = editExpenseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    await assertBillEditable(data.txnid);

    const { job, costCode, vendor, amount, retainageWithheld, entry } = await buildExpenseEntry(
      data.jobId,
      data.costCodeId,
      data.vendorId,
      data.costType,
      data.amount,
      data.retainageWithheld,
      data.date,
      data.description,
    );

    await updateTransaction(
      data.txnid,
      entry,
      `edit expense: ${job.code} ${costCode.code} ${formatUSD(amount)}`,
    );

    await prisma.bill.update({
      where: { txnid: data.txnid },
      data: {
        vendorId: vendor.id,
        jobId: job.id,
        costCodeId: costCode.id,
        amount: amount.toFixed(2),
        retainageWithheld: retainageWithheld.toFixed(2),
        date: new Date(data.date),
        description: data.description,
        costType: data.costType,
      },
    });

    revalidatePath(`/jobs/${job.id}`);
    revalidatePath(`/vendors/${vendor.id}`);
    return ok({ txnid: data.txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function deleteExpense(txnid: string): Promise<ActionResult<{ txnid: string }>> {
  const parsed = txnidSchema.safeParse(txnid);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    await assertBillEditable(txnid);

    const existing = await prisma.journalTxn.findUnique({ where: { txnid } });
    if (!existing) return fail(`No transaction found with txnid ${txnid}`);

    await removeTransaction(txnid, `delete expense: ${existing.memo ?? txnid}`);
    await prisma.bill.deleteMany({ where: { txnid } });

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
