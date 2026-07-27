import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import * as git from "isomorphic-git";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// See test/action-edge-cases.test.ts for why this is mocked (revalidatePath's
// reasoning applies identically to auth()).
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "test-user", email: "test@example.com", role: "admin" } })),
}));

import { prisma } from "@/lib/db";
import { createJob, createCostCode } from "@/app/actions/jobs";
import { createVendor } from "@/app/actions/vendors";
import { recordExpense } from "@/app/actions/expenses";
import { createProgressBilling } from "@/app/actions/billings";
import { recordPayment } from "@/app/actions/payments";
import { getArAging, getApAging } from "@/lib/reports";
import { accountsReceivable, accountsPayable, vendorAccountSlug } from "@/lib/accounts";
import { balance, check } from "@/lib/hledger";

describe("Phase B: AR/AP aging reconciles with hledger balances (v2 spec §F10/§F6)", () => {
  let journalDir: string;
  const cleanupJobIds: number[] = [];
  const cleanupCostCodeIds: number[] = [];
  const cleanupVendorIds: number[] = [];
  const cleanupTxnids: string[] = [];
  const cleanupBillingIds: number[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "phase-b-aging-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
  });

  afterEach(async () => {
    await prisma.paymentApplication.deleteMany({ where: { billingId: { in: cleanupBillingIds } } });
    await prisma.progressBilling.deleteMany({ where: { id: { in: cleanupBillingIds } } });
    cleanupBillingIds.splice(0);

    await prisma.billPayment.deleteMany({ where: { bill: { txnid: { in: cleanupTxnids } } } });
    await prisma.bill.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    cleanupTxnids.splice(0);

    for (const jobId of cleanupJobIds.splice(0)) {
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }
    for (const id of cleanupCostCodeIds.splice(0)) {
      await prisma.costCode.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupVendorIds.splice(0)) {
      await prisma.vendor.delete({ where: { id } }).catch(() => {});
    }
  });

  afterAll(async () => {
    await rm(journalDir, { recursive: true, force: true });
  });

  it("AR aging amount due matches the job's AR hledger balance after a partial payment", async () => {
    const jobCode = `AR-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "AR Aging Job" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const billing = await createProgressBilling({
      jobId: job.data.id,
      billingDate: "2026-06-01",
      periodLabel: "Pay App #1",
      amountBilled: "20000.00",
      retainageWithheld: "2000.00",
    });
    expect(billing.ok).toBe(true);
    if (!billing.ok) return;
    cleanupBillingIds.push(billing.data.id);
    cleanupTxnids.push(billing.data.txnid);

    const payment = await recordPayment({
      jobId: job.data.id,
      amount: "5000.00",
      date: "2026-06-15",
      billingId: billing.data.id,
    });
    expect(payment.ok).toBe(true);
    if (payment.ok) cleanupTxnids.push(payment.data.txnid);

    const aging = await getArAging(job.data.id);
    expect(aging.rows).toHaveLength(1);
    expect(aging.rows[0].amountDue.toFixed(2)).toBe("13000.00"); // 20000 - 2000 retainage - 5000 paid

    const arBalance = await balance([accountsReceivable(jobCode)]);
    expect(arBalance.total.toFixed(2)).toBe(aging.rows[0].amountDue.toFixed(2));

    expect(await check()).toBeNull();
  });

  it("AR aging excludes a billing once it's fully paid", async () => {
    const job = await createJob({ code: `ARF-${Date.now()}`, name: "AR Fully Paid Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const billing = await createProgressBilling({
      jobId: job.data.id,
      billingDate: "2026-06-01",
      amountBilled: "10000.00",
      retainageWithheld: "0",
    });
    if (!billing.ok) return;
    cleanupBillingIds.push(billing.data.id);
    cleanupTxnids.push(billing.data.txnid);

    const payment = await recordPayment({
      jobId: job.data.id,
      amount: "10000.00",
      date: "2026-06-15",
      billingId: billing.data.id,
    });
    expect(payment.ok).toBe(true);
    if (payment.ok) cleanupTxnids.push(payment.data.txnid);

    const updatedBilling = await prisma.progressBilling.findUnique({ where: { id: billing.data.id } });
    expect(updatedBilling!.status).toBe("paid");

    const aging = await getArAging(job.data.id);
    expect(aging.rows).toHaveLength(0);
  });

  it("rejects a payment applied to a billing that exceeds the amount due", async () => {
    const job = await createJob({ code: `ARO-${Date.now()}`, name: "AR Overpay Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const billing = await createProgressBilling({
      jobId: job.data.id,
      billingDate: "2026-06-01",
      amountBilled: "5000.00",
      retainageWithheld: "0",
    });
    if (!billing.ok) return;
    cleanupBillingIds.push(billing.data.id);
    cleanupTxnids.push(billing.data.txnid);

    const overpay = await recordPayment({
      jobId: job.data.id,
      amount: "6000.00",
      date: "2026-06-15",
      billingId: billing.data.id,
    });
    expect(overpay.ok).toBe(false);
    if (!overpay.ok) expect(overpay.error).toContain("exceeds the amount due");
  });

  it("AP aging amount due matches the vendor's AP hledger balance after a partial payment", async () => {
    const job = await createJob({ code: `AP-${Date.now()}`, name: "AP Aging Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `AP-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendorName = `AP Aging Vendor ${Date.now()}`;
    const vendor = await createVendor({ name: vendorName });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "8000.00",
      retainageWithheld: "800.00",
      date: "2026-06-01",
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });

    const { payBill } = await import("@/app/actions/bills");
    const payment = await payBill({ billId: bill!.id, amount: "3000.00", date: "2026-06-10" });
    expect(payment.ok).toBe(true);
    if (payment.ok) cleanupTxnids.push(payment.data.txnid);

    const aging = await getApAging();
    const row = aging.find((r) => r.billId === bill!.id);
    expect(row).toBeDefined();
    expect(row!.amountDue.toFixed(2)).toBe("4200.00"); // 8000 - 800 retainage - 3000 paid

    const vendorSlug = vendorAccountSlug(vendorName);
    const apBalance = await balance([accountsPayable(vendorSlug)]);
    expect(apBalance.total.negated().toFixed(2)).toBe(row!.amountDue.toFixed(2));

    expect(await check()).toBeNull();
  });
});
