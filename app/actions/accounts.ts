"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  createCashAccountSchema,
  editOpeningBalanceSchema,
  CreateCashAccountInput,
  EditOpeningBalanceInput,
} from "@/lib/validation";
import { cash, equityOpeningBalances } from "@/lib/accounts";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";
import { requireWriteRole } from "@/lib/authz";
import { todayIso } from "@/lib/date-utc";

export async function createCashAccount(
  input: CreateCashAccountInput,
): Promise<ActionResult<{ id: number; openingBalanceTxnid?: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = createCashAccountSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const existingCount = await prisma.cashAccount.count();
    const isDefault = existingCount === 0 ? true : (data.isDefault ?? false);

    if (isDefault) {
      await prisma.cashAccount.updateMany({ data: { isDefault: false } });
    }

    const openingBalance = new Decimal(data.openingBalance ?? "0");
    const account = await prisma.cashAccount.create({
      data: {
        name: data.name,
        label: data.label,
        isDefault,
        openingBalance: openingBalance.toFixed(2),
        openingDate: data.openingDate ? new Date(data.openingDate) : undefined,
      },
    });

    let openingBalanceTxnid: string | undefined;
    if (!openingBalance.isZero()) {
      const { txnid } = await recordTransaction(
        {
          kind: "opening-balance",
          jobId: null,
          date: data.openingDate ?? todayIso(),
          description: `Opening balance - ${data.label}`,
          tags: { type: "opening-balance" },
          postings: [
            { account: cash(data.name), amount: openingBalance },
            { account: equityOpeningBalances(), amount: openingBalance.negated() },
          ],
          amount: openingBalance,
        },
        `opening balance: ${data.label} ${formatUSD(openingBalance)}`,
      );
      openingBalanceTxnid = txnid;
      await prisma.cashAccount.update({ where: { id: account.id }, data: { openingBalanceTxnid } });
    }

    revalidatePath("/accounts");
    return ok({ id: account.id, openingBalanceTxnid });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`Account "${data.name}" already exists`);
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

// Editing an account's opening balance after the fact (typo, bank statement
// correction) means editing/creating/removing the one-time journal entry
// `createCashAccount` posted, not just the CashAccount row — otherwise cash
// position would silently diverge from what the journal says (V4 spec
// Phase 2: complete the opening-balance lifecycle, not just create).
export async function editOpeningBalance(
  input: EditOpeningBalanceInput,
): Promise<ActionResult<{ txnid: string | null }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = editOpeningBalanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const account = await prisma.cashAccount.findUnique({ where: { id: data.cashAccountId } });
    if (!account) return fail(`Account ${data.cashAccountId} not found`);

    const newBalance = new Decimal(data.openingBalance);
    const date = data.openingDate ?? todayIso();
    let txnid: string | null = account.openingBalanceTxnid;

    if (account.openingBalanceTxnid) {
      if (newBalance.isZero()) {
        await removeTransaction(
          account.openingBalanceTxnid,
          `delete opening balance: ${account.label}`,
        );
        txnid = null;
      } else {
        await updateTransaction(
          account.openingBalanceTxnid,
          {
            kind: "opening-balance",
            jobId: null,
            date,
            description: `Opening balance - ${account.label}`,
            tags: { type: "opening-balance" },
            postings: [
              { account: cash(account.name), amount: newBalance },
              { account: equityOpeningBalances(), amount: newBalance.negated() },
            ],
            amount: newBalance,
          },
          `edit opening balance: ${account.label} ${formatUSD(newBalance)}`,
        );
      }
    } else if (!newBalance.isZero()) {
      const result = await recordTransaction(
        {
          kind: "opening-balance",
          jobId: null,
          date,
          description: `Opening balance - ${account.label}`,
          tags: { type: "opening-balance" },
          postings: [
            { account: cash(account.name), amount: newBalance },
            { account: equityOpeningBalances(), amount: newBalance.negated() },
          ],
          amount: newBalance,
        },
        `opening balance: ${account.label} ${formatUSD(newBalance)}`,
      );
      txnid = result.txnid;
    }

    await prisma.cashAccount.update({
      where: { id: account.id },
      data: {
        openingBalance: newBalance.toFixed(2),
        openingDate: data.openingDate ? new Date(data.openingDate) : account.openingDate,
        openingBalanceTxnid: txnid,
      },
    });

    revalidatePath("/accounts");
    return ok({ txnid });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}
