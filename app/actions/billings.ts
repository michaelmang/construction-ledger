"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  createProgressBillingSchema,
  editProgressBillingSchema,
  CreateProgressBillingInput,
  EditProgressBillingInput,
} from "@/lib/validation";
import { accountsReceivable, incomeJob, retainagePayable } from "@/lib/accounts";
import { JournalValidationError } from "@/lib/journal";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";
import { computeRetainageWithheld, BillingMathError } from "@/lib/billing-math";
import { billedToDate, getRevisedContractValue } from "@/lib/reports";

class ActionError extends Error {}

// Over-billing (cumulative billed > revised contract value) is allowed, not
// rejected — some CFOs bill ahead of an unapproved change order — but the
// CFO should see it (product spec Phase 5: "allowed but warned").
async function overBillingWarning(jobId: number, jobCode: string): Promise<string | undefined> {
  const [billed, revisedContractValue] = await Promise.all([
    billedToDate(jobId),
    getRevisedContractValue(jobId),
  ]);
  if (billed.greaterThan(revisedContractValue)) {
    return `Billed to date (${formatUSD(billed)}) now exceeds the revised contract value (${formatUSD(revisedContractValue)}) for ${jobCode}.`;
  }
  return undefined;
}

async function buildBillingEntry(
  jobId: number,
  billingDate: string,
  periodLabel: string | undefined,
  amountBilledStr: string,
  retainageWithheldStr: string | undefined,
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new ActionError(`Job ${jobId} not found`);

  const amountBilled = new Decimal(amountBilledStr);
  const retainageWithheld = computeRetainageWithheld(
    amountBilled,
    new Decimal(job.retainagePct.toString()),
    retainageWithheldStr !== undefined ? new Decimal(retainageWithheldStr) : undefined,
  );

  const earnedNet = amountBilled.minus(retainageWithheld);
  const description = periodLabel
    ? `Progress billing - ${job.name} - ${periodLabel}`
    : `Progress billing - ${job.name}`;

  return {
    job,
    amountBilled,
    retainageWithheld,
    entry: {
      kind: "progress-billing" as const,
      jobId: job.id,
      date: billingDate,
      description,
      tags: { job: job.code, type: "progress-billing" },
      postings: [
        { account: accountsReceivable(job.code), amount: amountBilled },
        { account: retainagePayable(job.code), amount: retainageWithheld.negated() },
        { account: incomeJob(job.code), amount: earnedNet.negated() },
      ],
      amount: amountBilled,
      memo: periodLabel,
    },
  };
}

export async function createProgressBilling(
  input: CreateProgressBillingInput,
): Promise<ActionResult<{ id: number; txnid: string }>> {
  const parsed = createProgressBillingSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { job, amountBilled, retainageWithheld, entry } = await buildBillingEntry(
      data.jobId,
      data.billingDate,
      data.periodLabel,
      data.amountBilled,
      data.retainageWithheld,
    );

    const { txnid } = await recordTransaction(
      entry,
      `progress billing: ${job.code} ${formatUSD(amountBilled)}`,
    );

    const billing = await prisma.progressBilling.create({
      data: {
        jobId: job.id,
        billingDate: new Date(data.billingDate),
        periodLabel: data.periodLabel,
        amountBilled: amountBilled.toFixed(2),
        retainageWithheld: retainageWithheld.toFixed(2),
        pctCompleteEstimate: data.pctCompleteEstimate,
        txnid,
      },
    });

    revalidatePath(`/jobs/${job.id}`);
    return ok({ id: billing.id, txnid }, await overBillingWarning(job.id, job.code));
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function editProgressBilling(
  input: EditProgressBillingInput,
): Promise<ActionResult<{ id: number; txnid: string }>> {
  const parsed = editProgressBillingSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const existing = await prisma.progressBilling.findUnique({ where: { id: data.id } });
    if (!existing) return fail(`Progress billing ${data.id} not found`);
    if (existing.txnid !== data.txnid) return fail("txnid does not match this billing record");

    const { job, amountBilled, retainageWithheld, entry } = await buildBillingEntry(
      data.jobId,
      data.billingDate,
      data.periodLabel,
      data.amountBilled,
      data.retainageWithheld,
    );

    await updateTransaction(
      data.txnid,
      entry,
      `edit progress billing: ${job.code} ${formatUSD(amountBilled)}`,
    );

    await prisma.progressBilling.update({
      where: { id: data.id },
      data: {
        billingDate: new Date(data.billingDate),
        periodLabel: data.periodLabel,
        amountBilled: amountBilled.toFixed(2),
        retainageWithheld: retainageWithheld.toFixed(2),
        pctCompleteEstimate: data.pctCompleteEstimate,
      },
    });

    revalidatePath(`/jobs/${job.id}`);
    return ok({ id: data.id, txnid: data.txnid }, await overBillingWarning(job.id, job.code));
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function deleteProgressBilling(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const existing = await prisma.progressBilling.findUnique({ where: { id } });
    if (!existing) return fail(`Progress billing ${id} not found`);
    if (!existing.txnid) return fail(`Progress billing ${id} has no linked journal entry`);

    await removeTransaction(
      existing.txnid,
      `delete progress billing: ${existing.periodLabel ?? existing.txnid}`,
    );
    await prisma.progressBilling.delete({ where: { id } });

    revalidatePath(`/jobs/${existing.jobId}`);
    return ok({ id });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

function actionErrorMessage(err: unknown): string {
  if (
    err instanceof ActionError ||
    err instanceof JournalValidationError ||
    err instanceof BillingMathError
  ) {
    return err.message;
  }
  const e = err as { code?: string };
  if (e.code === "P2025") return "Record not found";
  return err instanceof Error ? err.message : "Unexpected error";
}
