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
import { recordExpense, editExpense } from "@/app/actions/expenses";
import { recordPayment } from "@/app/actions/payments";
import { revertActivity } from "@/app/actions/revert";
import { listJournalActivity } from "@/lib/journal-activity";
import { check } from "@/lib/hledger";

describe("Phase 2: revert-as-commit for Activity history (V4 spec)", () => {
  let journalDir: string;
  const cleanupJobIds: number[] = [];
  const cleanupCostCodeIds: number[] = [];
  const cleanupVendorIds: number[] = [];
  const cleanupTxnids: string[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "phase-b3-revert-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
  });

  afterEach(async () => {
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

  it("reverts a still-live create commit by deleting the transaction", async () => {
    const job = await createJob({ code: `RVT-${Date.now()}`, name: "Revert Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `RVT-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendor = await createVendor({ name: `Revert Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "750.00",
      date: "2026-07-24",
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const activity = await listJournalActivity();
    const createEntry = activity.find((e) => e.txnid === expense.data.txnid);
    expect(createEntry).toBeDefined();
    expect(createEntry!.revertible).toBe(true);

    const reverted = await revertActivity(createEntry!.hash);
    expect(reverted.ok).toBe(true);

    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });
    expect(bill).toBeNull();
    const journalTxn = await prisma.journalTxn.findUnique({ where: { txnid: expense.data.txnid } });
    expect(journalTxn).toBeNull();
    expect(await check()).toBeNull();
  });

  it("marks an edit commit as not revertible and refuses to revert it", async () => {
    const job = await createJob({ code: `RVTE-${Date.now()}`, name: "Revert Edit Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);
    const costCode = await createCostCode({ code: `RVTE-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);
    const vendor = await createVendor({ name: `Revert Edit Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "500.00",
      date: "2026-07-24",
    });
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const edited = await editExpense({
      txnid: expense.data.txnid,
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "600.00",
      date: "2026-07-25",
    });
    expect(edited.ok).toBe(true);

    const activity = await listJournalActivity();
    const editEntry = activity.find(
      (e) => e.txnid === expense.data.txnid && e.subject.toLowerCase().startsWith("edit "),
    );
    expect(editEntry).toBeDefined();
    expect(editEntry!.revertible).toBe(false);

    const reverted = await revertActivity(editEntry!.hash);
    expect(reverted.ok).toBe(false);
    if (!reverted.ok) expect(reverted.error).toContain("Only the original creation");

    // The transaction should be untouched by the refused revert.
    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });
    expect(bill!.amount.toString()).toBe("600");
  });

  it("refuses to revert a commit whose transaction was already deleted", async () => {
    const job = await createJob({ code: `RVTD-${Date.now()}`, name: "Revert Deleted Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const payment = await recordPayment({ jobId: job.data.id, amount: "200.00", date: "2026-07-24" });
    if (!payment.ok) return;

    const activity = await listJournalActivity();
    const createEntry = activity.find((e) => e.txnid === payment.data.txnid);
    expect(createEntry).toBeDefined();

    const { deletePayment } = await import("@/app/actions/payments");
    const deleted = await deletePayment(payment.data.txnid);
    expect(deleted.ok).toBe(true);

    const reverted = await revertActivity(createEntry!.hash);
    expect(reverted.ok).toBe(false);
    if (!reverted.ok) expect(reverted.error).toContain("no longer exists");
  });
});
