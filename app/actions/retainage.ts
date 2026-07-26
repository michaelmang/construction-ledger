"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { releaseRetainageSchema, ReleaseRetainageInput } from "@/lib/validation";
import { cash, retainagePayable, retainageReceivable } from "@/lib/accounts";
import { recordTransaction } from "@/lib/transactions";
import { getRetainageAging } from "@/lib/reports";
import { formatUSD } from "@/lib/money";
import { requireWriteRole } from "@/lib/authz";

class ActionError extends Error {}

async function resolveCashAccount(explicit: string | undefined): Promise<string> {
  if (explicit) return explicit;
  const defaultAccount = await prisma.cashAccount.findFirst({ where: { isDefault: true } });
  return defaultAccount?.name ?? "checking";
}

// Retainage aging had no resolution flow (V4 spec Phase 2) — withholding
// posted balances to assets:retainage receivable / liabilities:retainage
// payable (expenses.ts / billings.ts), but nothing ever debited/credited
// them back out, so the aging report's balances only ever grew. Collecting
// a client's held retainage brings cash in (Dr cash / Cr retainage
// receivable); releasing what we withheld from a sub pays cash out (Dr
// retainage payable / Cr cash) — the mirror image of recordPayment/payBill,
// just against the retainage accounts instead of AR/AP.
export async function releaseRetainageReceivable(
  input: ReleaseRetainageInput,
): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = releaseRetainageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const job = await prisma.job.findUnique({ where: { id: data.jobId } });
    if (!job) throw new ActionError(`Job ${data.jobId} not found`);

    const aging = await getRetainageAging(job.id);
    const amount = new Decimal(data.amount);
    if (amount.greaterThan(aging.retainageReceivableBalance)) {
      throw new ActionError(
        `Release amount (${formatUSD(amount)}) exceeds retainage receivable held (${formatUSD(aging.retainageReceivableBalance)})`,
      );
    }

    const cashAccount = await resolveCashAccount(data.cashAccount);
    const description = `Retainage collected - ${job.name}`;

    const { txnid } = await recordTransaction(
      {
        kind: "retainage-release",
        jobId: job.id,
        date: data.date,
        description,
        tags: { job: job.code, type: "retainage-release", direction: "receivable" },
        postings: [
          { account: cash(cashAccount), amount },
          { account: retainageReceivable(job.code), amount: amount.negated() },
        ],
        amount,
        memo: description,
      },
      `release retainage receivable: ${job.code} ${formatUSD(amount)}`,
    );

    revalidatePath("/reports/retainage");
    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid });
  } catch (err) {
    if (err instanceof ActionError) return fail(err.message);
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}

export async function releaseRetainagePayable(
  input: ReleaseRetainageInput,
): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = releaseRetainageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const job = await prisma.job.findUnique({ where: { id: data.jobId } });
    if (!job) throw new ActionError(`Job ${data.jobId} not found`);

    const aging = await getRetainageAging(job.id);
    const amount = new Decimal(data.amount);
    if (amount.greaterThan(aging.retainagePayableBalance)) {
      throw new ActionError(
        `Release amount (${formatUSD(amount)}) exceeds retainage payable held (${formatUSD(aging.retainagePayableBalance)})`,
      );
    }

    const cashAccount = await resolveCashAccount(data.cashAccount);
    const description = `Retainage released - ${job.name}`;

    const { txnid } = await recordTransaction(
      {
        kind: "retainage-release",
        jobId: job.id,
        date: data.date,
        description,
        tags: { job: job.code, type: "retainage-release", direction: "payable" },
        postings: [
          { account: retainagePayable(job.code), amount },
          { account: cash(cashAccount), amount: amount.negated() },
        ],
        amount,
        memo: description,
      },
      `release retainage payable: ${job.code} ${formatUSD(amount)}`,
    );

    revalidatePath("/reports/retainage");
    revalidatePath(`/jobs/${job.id}`);
    return ok({ txnid });
  } catch (err) {
    if (err instanceof ActionError) return fail(err.message);
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}
