"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { createCashAccountSchema, CreateCashAccountInput } from "@/lib/validation";
import { cash, equityOpeningBalances } from "@/lib/accounts";
import { recordTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";

export async function createCashAccount(
  input: CreateCashAccountInput,
): Promise<ActionResult<{ id: number; openingBalanceTxnid?: string }>> {
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
          date: data.openingDate ?? new Date().toISOString().slice(0, 10),
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
    }

    revalidatePath("/accounts");
    return ok({ id: account.id, openingBalanceTxnid });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`Account "${data.name}" already exists`);
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}
