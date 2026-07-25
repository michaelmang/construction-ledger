import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import * as git from "isomorphic-git";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { createJob } from "@/app/actions/jobs";
import { createCostCode } from "@/app/actions/jobs";
import { createVendor } from "@/app/actions/vendors";
import { recordExpense } from "@/app/actions/expenses";
import { payBill } from "@/app/actions/bills";
import { createCashAccount } from "@/app/actions/accounts";
import { createOverheadCategory, recordOverheadExpense } from "@/app/actions/overhead";
import { getCashPositionSummary } from "@/lib/reports";
import { check } from "@/lib/hledger";
import { vendorAccountSlug } from "@/lib/accounts";

describe("Phase A: vendors, bills, pay-bill flow (v2 spec §F1/§F2/§F6/§F8/§F9)", () => {
  let journalDir: string;
  const cleanupJobIds: number[] = [];
  const cleanupCostCodeIds: number[] = [];
  const cleanupVendorIds: number[] = [];
  const cleanupCashAccountIds: number[] = [];
  const cleanupOverheadCategoryIds: number[] = [];
  const cleanupTxnids: string[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "phase-a-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
  });

  afterEach(async () => {
    await prisma.billPayment.deleteMany({ where: { bill: { txnid: { in: cleanupTxnids } } } });
    await prisma.bill.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    cleanupTxnids.splice(0);

    for (const jobId of cleanupJobIds.splice(0)) {
      await prisma.bill.deleteMany({ where: { jobId } });
      await prisma.journalTxn.deleteMany({ where: { jobId } });
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }
    for (const id of cleanupCostCodeIds.splice(0)) {
      await prisma.costCode.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupVendorIds.splice(0)) {
      await prisma.vendor.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupCashAccountIds.splice(0)) {
      await prisma.cashAccount.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupOverheadCategoryIds.splice(0)) {
      await prisma.overheadCategory.delete({ where: { id } }).catch(() => {});
    }
  });

  afterAll(async () => {
    await rm(journalDir, { recursive: true, force: true });
  });

  it("paying a bill in full reduces AP to zero and marks it paid", async () => {
    const jobCode = `PAB-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Pay Bill Job" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const costCode = await createCostCode({ code: `PAB-CC-${Date.now()}`, name: "Test Code" });
    expect(costCode.ok).toBe(true);
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);

    const vendorName = `Pay Bill Vendor ${Date.now()}`;
    const vendor = await createVendor({ name: vendorName });
    expect(vendor.ok).toBe(true);
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "5000.00",
      date: "2026-07-24",
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });
    expect(bill).not.toBeNull();
    expect(bill!.status).toBe("open");
    expect(bill!.amount.toString()).toBe("5000");

    // Pay half — should go to "partial"
    const payment1 = await payBill({ billId: bill!.id, amount: "2000.00", date: "2026-07-25" });
    expect(payment1.ok).toBe(true);
    if (payment1.ok) cleanupTxnids.push(payment1.data.txnid);

    const afterPartial = await prisma.bill.findUnique({ where: { id: bill!.id } });
    expect(afterPartial!.status).toBe("partial");
    expect(afterPartial!.paidAmount.toString()).toBe("2000");

    // The bill payment should carry the job tag so it shows up in that job's
    // Transactions tab, not just the vendor's bill list.
    if (payment1.ok) {
      const { print } = await import("@/lib/hledger");
      const [entry] = await print([`tag:txnid=${payment1.data.txnid}`]);
      expect(entry.tags.job).toBe(jobCode);
    }

    // Pay the rest — should go to "paid"
    const payment2 = await payBill({ billId: bill!.id, amount: "3000.00", date: "2026-07-26" });
    expect(payment2.ok).toBe(true);
    if (payment2.ok) cleanupTxnids.push(payment2.data.txnid);

    const afterFull = await prisma.bill.findUnique({ where: { id: bill!.id } });
    expect(afterFull!.status).toBe("paid");
    expect(afterFull!.paidAmount.toString()).toBe("5000");

    // AP balance for this vendor should now be exactly zero.
    const { balance } = await import("@/lib/hledger");
    const vendorSlug = vendorAccountSlug(vendorName);
    const ap = await balance([`liabilities:accounts payable:${vendorSlug}`]);
    expect(ap.total.toFixed(2)).toBe("0.00");

    expect(await check()).toBeNull();
  });

  it("rejects overpaying a bill beyond the amount due", async () => {
    const job = await createJob({ code: `OVP-${Date.now()}`, name: "Overpay Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `OVP-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendor = await createVendor({ name: `Overpay Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "1000.00",
      date: "2026-07-24",
    });
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);
    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });

    const overpay = await payBill({ billId: bill!.id, amount: "1500.00", date: "2026-07-25" });
    expect(overpay.ok).toBe(false);
    if (!overpay.ok) expect(overpay.error).toContain("exceeds the amount due");
  });

  it("withholding sub retainage splits AP and retainage payable, and excludes retainage from what's payable", async () => {
    const job = await createJob({ code: `RET-${Date.now()}`, name: "Retainage Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `RET-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendor = await createVendor({ name: `Retainage Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "10000.00",
      retainageWithheld: "1000.00",
      date: "2026-07-24",
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });
    expect(bill!.retainageWithheld.toString()).toBe("1000");

    // Amount due is 10,000 - 1,000 retainage = 9,000. Paying 9,000 in full
    // should be accepted and mark the bill paid even though paidAmount
    // (9,000) < amount (10,000) — the retainage isn't payable yet.
    const payment = await payBill({ billId: bill!.id, amount: "9000.00", date: "2026-07-25" });
    expect(payment.ok).toBe(true);
    if (payment.ok) cleanupTxnids.push(payment.data.txnid);

    const afterPay = await prisma.bill.findUnique({ where: { id: bill!.id } });
    expect(afterPay!.status).toBe("paid");

    expect(await check()).toBeNull();
  });

  it("posts an opening balance and reflects it in the cash position", async () => {
    const accountName = `savings-${Date.now()}`;

    // Other tests in this file share the same journal dir and post their own
    // cash movements, so assert a before/after delta rather than an absolute
    // total.
    const before = await getCashPositionSummary();

    const account = await createCashAccount({
      name: accountName,
      label: "Test Savings",
      openingBalance: "25000.00",
      openingDate: "2026-01-01",
    });
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    cleanupCashAccountIds.push(account.data.id);
    expect(account.data.openingBalanceTxnid).toBeDefined();
    if (account.data.openingBalanceTxnid) cleanupTxnids.push(account.data.openingBalanceTxnid);

    const { balance } = await import("@/lib/hledger");
    const { cash } = await import("@/lib/accounts");
    const savingsBalance = await balance([cash(accountName)]);
    expect(savingsBalance.total.toFixed(2)).toBe("25000.00");

    const after = await getCashPositionSummary();
    expect(after.assetsTotal.minus(before.assetsTotal).toFixed(2)).toBe("25000.00");

    expect(await check()).toBeNull();
  });

  it("records an overhead expense against expenses:overhead:<category>, not a job", async () => {
    const category = await createOverheadCategory({
      code: `OH-${Date.now()}`,
      name: "Office Supplies",
    });
    expect(category.ok).toBe(true);
    if (!category.ok) return;
    cleanupOverheadCategoryIds.push(category.data.id);

    const vendor = await createVendor({ name: `Overhead Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const result = await recordOverheadExpense({
      vendorId: vendor.data.id,
      overheadCategoryId: category.data.id,
      amount: "450.00",
      date: "2026-07-24",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    cleanupTxnids.push(result.data.txnid);

    const bill = await prisma.bill.findUnique({ where: { txnid: result.data.txnid } });
    expect(bill!.jobId).toBeNull();
    expect(bill!.overheadCategoryId).toBe(category.data.id);

    const { print } = await import("@/lib/hledger");
    const entries = await print(["tag:type=overhead-expense"]);
    const entry = entries.find((e) => e.tags.txnid === result.data.txnid);
    expect(entry).toBeDefined();
    expect(entry!.postings.some((p) => p.account.startsWith("expenses:overhead:"))).toBe(true);

    expect(await check()).toBeNull();
  });
});
