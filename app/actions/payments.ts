"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  recordPaymentSchema,
  editPaymentSchema,
  txnidSchema,
  RecordPaymentInput,
  EditPaymentInput,
} from "@/lib/validation";
import { accountsReceivable, cash } from "@/lib/accounts";
import { JournalValidationError } from "@/lib/journal";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";

class ActionError extends Error {}

async function buildPaymentEntry(
  jobId: number,
  amountStr: string,
  date: string,
  cashAccount: string | undefined,
  memo: string | undefined,
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new ActionError(`Job ${jobId} not found`);

  const amount = new Decimal(amountStr);
  const description = memo ? `Payment received - ${job.name} - ${memo}` : `Payment received - ${job.name}`;

  return {
    job,
    amount,
    entry: {
      kind: "payment" as const,
      jobId: job.id,
      date,
      description,
      tags: { job: job.code, type: "payment" },
      postings: [
        { account: cash(cashAccount), amount },
        { account: accountsReceivable(job.code), amount: amount.negated() },
      ],
      amount,
      memo,
    },
  };
}

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { job, amount, entry } = await buildPaymentEntry(
      data.jobId,
      data.amount,
      data.date,
      data.cashAccount,
      data.memo,
    );

    const { txnid } = await recordTransaction(entry, `payment: ${job.code} ${formatUSD(amount)}`);

    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function editPayment(
  input: EditPaymentInput,
): Promise<ActionResult<{ txnid: string }>> {
  const parsed = editPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { job, amount, entry } = await buildPaymentEntry(
      data.jobId,
      data.amount,
      data.date,
      data.cashAccount,
      data.memo,
    );

    await updateTransaction(data.txnid, entry, `edit payment: ${job.code} ${formatUSD(amount)}`);

    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid: data.txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function deletePayment(txnid: string): Promise<ActionResult<{ txnid: string }>> {
  const parsed = txnidSchema.safeParse(txnid);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const existing = await prisma.journalTxn.findUnique({ where: { txnid } });
    if (!existing) return fail(`No transaction found with txnid ${txnid}`);

    await removeTransaction(txnid, `delete payment: ${existing.memo ?? txnid}`);

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
