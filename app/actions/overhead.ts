"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  createOverheadCategorySchema,
  recordOverheadExpenseSchema,
  editOverheadExpenseSchema,
  txnidSchema,
  CreateOverheadCategoryInput,
  RecordOverheadExpenseInput,
  EditOverheadExpenseInput,
} from "@/lib/validation";
import { accountsPayable, expenseOverhead, vendorAccountSlug } from "@/lib/accounts";
import { JournalValidationError } from "@/lib/journal";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { formatUSD } from "@/lib/money";
import { requireWriteRole } from "@/lib/authz";

class ActionError extends Error {}

async function buildOverheadExpenseEntry(
  vendorId: number,
  overheadCategoryId: number,
  amountStr: string,
  date: string,
  description: string | undefined,
) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new ActionError(`Vendor ${vendorId} not found`);

  const category = await prisma.overheadCategory.findUnique({ where: { id: overheadCategoryId } });
  if (!category) throw new ActionError(`Overhead category ${overheadCategoryId} not found`);

  const amount = new Decimal(amountStr);
  const vendorSlug = vendorAccountSlug(vendor.name);
  const entryDescription = description ? `${vendor.name} - ${description}` : vendor.name;

  return {
    vendor,
    category,
    amount,
    entry: {
      kind: "overhead-expense" as const,
      jobId: null,
      date,
      description: entryDescription,
      tags: { type: "overhead-expense", category: category.code },
      postings: [
        { account: expenseOverhead(category.code), amount },
        { account: accountsPayable(vendorSlug), amount: amount.negated() },
      ],
      amount,
      memo: entryDescription,
    },
  };
}

async function assertOverheadBillEditable(txnid: string): Promise<void> {
  const bill = await prisma.bill.findUnique({ where: { txnid } });
  if (bill && bill.paidAmount.greaterThan(0)) {
    throw new ActionError(
      "Cannot change this overhead expense — payments have already been applied to its bill",
    );
  }
}

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
    const { vendor, category, amount, entry } = await buildOverheadExpenseEntry(
      data.vendorId,
      data.overheadCategoryId,
      data.amount,
      data.date,
      data.description,
    );

    const { txnid } = await recordTransaction(entry, `overhead: ${category.code} ${formatUSD(amount)}`);

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
    return fail(actionErrorMessage(err));
  }
}

export async function editOverheadExpense(
  input: EditOverheadExpenseInput,
): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = editOverheadExpenseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    await assertOverheadBillEditable(data.txnid);

    const { vendor, category, amount, entry } = await buildOverheadExpenseEntry(
      data.vendorId,
      data.overheadCategoryId,
      data.amount,
      data.date,
      data.description,
    );

    await updateTransaction(data.txnid, entry, `edit overhead: ${category.code} ${formatUSD(amount)}`);

    await prisma.bill.update({
      where: { txnid: data.txnid },
      data: {
        vendorId: vendor.id,
        overheadCategoryId: category.id,
        amount: amount.toFixed(2),
        date: new Date(data.date),
        description: data.description,
      },
    });

    revalidatePath("/overhead");
    revalidatePath(`/vendors/${vendor.id}`);
    return ok({ txnid: data.txnid });
  } catch (err) {
    return fail(actionErrorMessage(err));
  }
}

export async function deleteOverheadExpense(txnid: string): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = txnidSchema.safeParse(txnid);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    await assertOverheadBillEditable(txnid);

    const existing = await prisma.bill.findUnique({ where: { txnid } });
    if (!existing) return fail(`No overhead expense found with txnid ${txnid}`);

    await removeTransaction(txnid, `delete overhead: ${existing.description ?? txnid}`);
    await prisma.bill.deleteMany({ where: { txnid } });

    revalidatePath("/overhead");
    revalidatePath(`/vendors/${existing.vendorId}`);
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
