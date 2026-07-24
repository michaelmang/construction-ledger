"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { payBillSchema, PayBillInput } from "@/lib/validation";
import { accountsPayable, cash, vendorAccountSlug } from "@/lib/accounts";
import { recordTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";

class ActionError extends Error {}

async function resolveCashAccount(explicit: string | undefined): Promise<string> {
  if (explicit) return explicit;
  const defaultAccount = await prisma.cashAccount.findFirst({ where: { isDefault: true } });
  return defaultAccount?.name ?? "checking";
}

// Debits AP back down (Dr AP / Cr cash) — the flow that was entirely missing
// in v1 (v2 spec §F2: "AP is a roach motel — bills go in, nothing ever comes
// out"). Retainage withheld on the bill is excluded from what's payable here;
// releasing it is a separate flow, not yet built.
export async function payBill(input: PayBillInput): Promise<ActionResult<{ txnid: string }>> {
  const parsed = payBillSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const bill = await prisma.bill.findUnique({ where: { id: data.billId }, include: { vendor: true } });
    if (!bill) throw new ActionError(`Bill ${data.billId} not found`);

    const amountDue = new Decimal(bill.amount)
      .minus(bill.retainageWithheld)
      .minus(bill.paidAmount);
    const paymentAmount = new Decimal(data.amount);

    if (paymentAmount.greaterThan(amountDue)) {
      throw new ActionError(
        `Payment (${formatUSD(paymentAmount)}) exceeds the amount due (${formatUSD(amountDue)})`,
      );
    }

    const cashAccount = await resolveCashAccount(data.cashAccount);
    const vendorSlug = vendorAccountSlug(bill.vendor.name);
    const description = `Bill payment - ${bill.vendor.name}`;

    const { txnid } = await recordTransaction(
      {
        kind: "bill-payment",
        jobId: bill.jobId,
        date: data.date,
        description,
        tags: { type: "bill-payment", vendor: vendorSlug },
        postings: [
          { account: accountsPayable(vendorSlug), amount: paymentAmount },
          { account: cash(cashAccount), amount: paymentAmount.negated() },
        ],
        amount: paymentAmount,
        memo: description,
      },
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
    if (err instanceof ActionError) return fail(err.message);
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}
