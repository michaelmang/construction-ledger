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
import { releaseRetainagePayable, releaseRetainageReceivable } from "@/app/actions/retainage";
import { getRetainageAging } from "@/lib/reports";
import { check } from "@/lib/hledger";

describe("Phase 2: retainage release closes out aging balances (V4 spec)", () => {
  let journalDir: string;
  const cleanupJobIds: number[] = [];
  const cleanupCostCodeIds: number[] = [];
  const cleanupVendorIds: number[] = [];
  const cleanupTxnids: string[] = [];
  const cleanupBillingIds: number[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "phase-b2-retainage-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
  });

  afterEach(async () => {
    await prisma.paymentApplication.deleteMany({ where: { billingId: { in: cleanupBillingIds } } });
    await prisma.progressBilling.deleteMany({ where: { id: { in: cleanupBillingIds } } });
    cleanupBillingIds.splice(0);

    await prisma.bill.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    cleanupTxnids.splice(0);

    for (const id of cleanupCostCodeIds.splice(0)) {
      await prisma.costCode.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupVendorIds.splice(0)) {
      await prisma.vendor.delete({ where: { id } }).catch(() => {});
    }
    for (const jobId of cleanupJobIds.splice(0)) {
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }
  });

  afterAll(async () => {
    await rm(journalDir, { recursive: true, force: true });
  });

  it("collecting retainage receivable zeroes the balance and moves cash", async () => {
    const jobCode = `RETRCV-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Retainage Receivable Job" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const billing = await createProgressBilling({
      jobId: job.data.id,
      billingDate: "2026-07-01",
      amountBilled: "10000.00",
      retainageWithheld: "1000.00",
    });
    expect(billing.ok).toBe(true);
    if (!billing.ok) return;
    cleanupBillingIds.push(billing.data.id);
    cleanupTxnids.push(billing.data.txnid);

    const beforeRelease = await getRetainageAging(job.data.id);
    expect(beforeRelease.retainageReceivableBalance.toFixed(2)).toBe("1000.00");

    const released = await releaseRetainageReceivable({
      jobId: job.data.id,
      amount: "1000.00",
      date: "2026-07-25",
    });
    expect(released.ok).toBe(true);
    if (released.ok) cleanupTxnids.push(released.data.txnid);

    const afterRelease = await getRetainageAging(job.data.id);
    expect(afterRelease.retainageReceivableBalance.toFixed(2)).toBe("0.00");

    expect(await check()).toBeNull();
  });

  it("rejects collecting more retainage receivable than is held", async () => {
    const job = await createJob({ code: `RETRCVX-${Date.now()}`, name: "Overcollect Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const billing = await createProgressBilling({
      jobId: job.data.id,
      billingDate: "2026-07-01",
      amountBilled: "5000.00",
      retainageWithheld: "500.00",
    });
    if (!billing.ok) return;
    cleanupBillingIds.push(billing.data.id);
    cleanupTxnids.push(billing.data.txnid);

    const released = await releaseRetainageReceivable({
      jobId: job.data.id,
      amount: "600.00",
      date: "2026-07-25",
    });
    expect(released.ok).toBe(false);
    if (!released.ok) expect(released.error).toContain("exceeds retainage receivable held");
  });

  it("releasing retainage payable zeroes the balance and pays cash out", async () => {
    const jobCode = `RETPAY-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Retainage Payable Job" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `RETPAY-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendor = await createVendor({ name: `Retainage Payable Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "subcontract",
      amount: "10000.00",
      retainageWithheld: "1000.00",
      date: "2026-07-01",
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const beforeRelease = await getRetainageAging(job.data.id);
    expect(beforeRelease.retainagePayableBalance.toFixed(2)).toBe("1000.00");

    const released = await releaseRetainagePayable({
      jobId: job.data.id,
      amount: "1000.00",
      date: "2026-07-25",
    });
    expect(released.ok).toBe(true);
    if (released.ok) cleanupTxnids.push(released.data.txnid);

    const afterRelease = await getRetainageAging(job.data.id);
    expect(afterRelease.retainagePayableBalance.toFixed(2)).toBe("0.00");

    expect(await check()).toBeNull();
  });

  it("rejects releasing more retainage payable than is held", async () => {
    const job = await createJob({ code: `RETPAYX-${Date.now()}`, name: "Overrelease Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `RETPAYX-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendor = await createVendor({ name: `Overrelease Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "subcontract",
      amount: "5000.00",
      retainageWithheld: "500.00",
      date: "2026-07-01",
    });
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const released = await releaseRetainagePayable({
      jobId: job.data.id,
      amount: "600.00",
      date: "2026-07-25",
    });
    expect(released.ok).toBe(false);
    if (!released.ok) expect(released.error).toContain("exceeds retainage payable held");
  });
});
