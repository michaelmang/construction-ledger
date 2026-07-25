"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  createOverheadCategorySchema,
  recordOverheadExpenseSchema,
  CreateOverheadCategoryInput,
  RecordOverheadExpenseInput,
} from "@/lib/validation";
import { accountsPayable, expenseOverhead, vendorAccountSlug } from "@/lib/accounts";
import { recordTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";
import { requireWriteRole } from "@/lib/authz";

class ActionError extends Error {}

export async function createOverheadCategory(
  input: CreateOverheadCategoryInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = createOverheadCategorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const category = await prisma.overheadCategory.create({ data });
    revalidatePath("/overhead");
    return ok({ id: category.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`Overhead category "${data.code}" already exists`);
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

export async function recordOverheadExpense(
  input: RecordOverheadExpenseInput,
): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = recordOverheadExpenseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const vendor = await prisma.vendor.findUnique({ where: { id: data.vendorId } });
    if (!vendor) return fail(`Vendor ${data.vendorId} not found`);

    const category = await prisma.overheadCategory.findUnique({
      where: { id: data.overheadCategoryId },
    });
    if (!category) return fail(`Overhead category ${data.overheadCategoryId} not found`);

    const amount = new Decimal(data.amount);
    const vendorSlug = vendorAccountSlug(vendor.name);
    const description = data.description
      ? `${vendor.name} - ${data.description}`
      : vendor.name;

    const { txnid } = await recordTransaction(
      {
        kind: "overhead-expense",
        jobId: null,
        date: data.date,
        description,
        tags: { type: "overhead-expense", category: category.code },
        postings: [
          { account: expenseOverhead(category.code), amount },
          { account: accountsPayable(vendorSlug), amount: amount.negated() },
        ],
        amount,
        memo: description,
      },
      `overhead: ${category.code} ${formatUSD(amount)}`,
    );

    await prisma.bill.create({
      data: {
        vendorId: vendor.id,
        overheadCategoryId: category.id,
        amount: amount.toFixed(2),
        date: new Date(data.date),
        description: data.description,
        txnid,
      },
    });

    revalidatePath("/overhead");
    revalidatePath(`/vendors/${vendor.id}`);
    return ok({ txnid });
  } catch (err) {
    if (err instanceof ActionError) return fail(err.message);
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}
