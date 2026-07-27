"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { payBillSchema, editBillPaymentSchema, PayBillInput, EditBillPaymentInput, txnidSchema } from "@/lib/validation";
import { accountsPayable, cash, vendorAccountSlug } from "@/lib/accounts";
import { JournalValidationError } from "@/lib/journal";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";
import { requireWriteRole } from "@/lib/authz";

class ActionError extends Error {}

async function resolveCashAccount(explicit: string | undefined): Promise<string> {
  if (explicit) return explicit;
  const defaultAccount = await prisma.cashAccount.findFirst({ where: { isDefault: true } });
  return defaultAccount?.name ?? "checking";
}

async function buildBillPaymentEntry(billId: number, amountStr: string, date: string, cashAccount: string | undefined) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { vendor: true, job: true },
  });
  if (!bill) throw new ActionError(`Bill ${billId} not found`);

  const amount = new Decimal(amountStr);
  const resolvedCashAccount = await resolveCashAccount(cashAccount);
  const vendorSlug = vendorAccountSlug(bill.vendor.name);
  const description = `Bill payment - ${bill.vendor.name}`;

  return {
    bill,
    amount,
    entry: {
      kind: "bill-payment" as const,
      jobId: bill.jobId,
      date,
      description,
      tags: {
        type: "bill-payment",
        vendor: vendorSlug,
        ...(bill.job ? { job: bill.job.code } : {}),
      },
      postings: [
        { account: accountsPayable(vendorSlug), amount },
        { account: cash(resolvedCashAccount), amount: amount.negated() },
      ],
      amount,
      memo: description,
    },
  };
}

// Debits AP back down (Dr AP / Cr cash) — the flow that was entirely missing
// in v1 (v2 spec §F2: "AP is a roach motel — bills go in, nothing ever comes
// out"). Retainage withheld on the bill is excluded from what's payable here;
// releasing it is a separate flow (V4 spec Phase 2, app/actions/retainage.ts).
export async function payBill(input: PayBillInput): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = payBillSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const { bill, amount: paymentAmount, entry } = await buildBillPaymentEntry(
      data.billId,
      data.amount,
      data.date,
      data.cashAccount,
    );

    const amountDue = new Decimal(bill.amount).minus(bill.retainageWithheld).minus(bill.paidAmount);
    if (paymentAmount.greaterThan(amountDue)) {
      throw new ActionError(
        `Payment (${formatUSD(paymentAmount)}) exceeds the amount due (${formatUSD(amountDue)})`,
      );
    }

    const { txnid } = await recordTransaction(
      entry,
      `pay bill: ${bill.vendor.name} ${formatUSD(paymentAmount)}`,
    );

    const newPaidAmount = new Decimal(bill.paidAmount).plus(paymentAmount);
    const newAmountDue = new Decimal(bill.amount).minus(bill.retainageWithheld).minus(newPaidAmount);

    await prisma.billPayment.create({
      data: { billId: bill.id, amount: paymentAmount.toFixed(2), date: new Date(data.date), txnid },
    });
    await prisma.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: newPaidAmount.toFixed(2),
        status: newAmountDue.isZero() ? "paid" : "partial",
      },
    });

    revalidatePath(`/vendors/${bill.vendorId}`);
    if (bill.jobId) revalidatePath(`/jobs/${bill.jobId}`);
    return ok({ txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function editBillPayment(
  input: EditBillPaymentInput,
): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = editBillPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const existingPayment = await prisma.billPayment.findUnique({ where: { txnid: data.txnid } });
    if (!existingPayment) return fail(`No bill payment found with txnid ${data.txnid}`);

    const { bill, amount: newAmount, entry } = await buildBillPaymentEntry(
      data.billId,
      data.amount,
      data.date,
      data.cashAccount,
    );

    // Amount due excluding this payment's own current contribution, since
    // we're replacing it, not adding to it.
    const amountDueExcludingThis = new Decimal(bill.amount)
      .minus(bill.retainageWithheld)
      .minus(bill.paidAmount)
      .plus(existingPayment.amount);
    if (newAmount.greaterThan(amountDueExcludingThis)) {
      throw new ActionError(
        `Payment (${formatUSD(newAmount)}) exceeds the amount due (${formatUSD(amountDueExcludingThis)})`,
      );
    }

    await updateTransaction(
      data.txnid,
      entry,
      `edit bill payment: ${bill.vendor.name} ${formatUSD(newAmount)}`,
    );

    const newPaidAmount = new Decimal(bill.paidAmount).minus(existingPayment.amount).plus(newAmount);
    const newAmountDue = new Decimal(bill.amount).minus(bill.retainageWithheld).minus(newPaidAmount);

    await prisma.billPayment.update({
      where: { txnid: data.txnid },
      data: { amount: newAmount.toFixed(2), date: new Date(data.date) },
    });
    await prisma.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: newPaidAmount.toFixed(2),
        status: newAmountDue.isZero() ? "paid" : newPaidAmount.isZero() ? "open" : "partial",
      },
    });

    revalidatePath(`/vendors/${bill.vendorId}`);
    if (bill.jobId) revalidatePath(`/jobs/${bill.jobId}`);
    return ok({ txnid: data.txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function deleteBillPayment(txnid: string): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = txnidSchema.safeParse(txnid);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const existingPayment = await prisma.billPayment.findUnique({
      where: { txnid },
      include: { bill: true },
    });
    if (!existingPayment) return fail(`No bill payment found with txnid ${txnid}`);

    await removeTransaction(txnid, `delete bill payment: ${formatUSD(existingPayment.amount)}`);

    const bill = existingPayment.bill;
    const newPaidAmount = new Decimal(bill.paidAmount).minus(existingPayment.amount);
    await prisma.billPayment.delete({ where: { txnid } });
    await prisma.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: newPaidAmount.toFixed(2),
        status: newPaidAmount.isZero() ? "open" : "partial",
      },
    });

    revalidatePath(`/vendors/${bill.vendorId}`);
    if (bill.jobId) revalidatePath(`/jobs/${bill.jobId}`);
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
