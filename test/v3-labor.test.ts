import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { createJob, createCostCode } from "@/app/actions/jobs";
import { createVendor } from "@/app/actions/vendors";
import { createEmployee } from "@/app/actions/employees";
import { recordExpense } from "@/app/actions/expenses";
import { recordLaborCost, editLaborCost, deleteLaborCost } from "@/app/actions/labor";
import { balance, print, check } from "@/lib/hledger";
import { burdenedRate } from "@/lib/labor";

describe("v3: cost type tag + burdened labor (spec §F17/§F18/§F19)", () => {
  let journalDir: string;
  const cleanupJobIds: number[] = [];
  const cleanupCostCodeIds: number[] = [];
  const cleanupVendorIds: number[] = [];
  const cleanupEmployeeIds: number[] = [];
  const cleanupTxnids: string[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "v3-labor-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await promisify(execFile)("git", ["init"], { cwd: journalDir });
  });

  afterEach(async () => {
    await prisma.laborEntry.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.bill.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    cleanupTxnids.splice(0);

    for (const jobId of cleanupJobIds.splice(0)) {
      await prisma.laborEntry.deleteMany({ where: { jobId } });
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
    for (const id of cleanupEmployeeIds.splice(0)) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
  });

  afterAll(async () => {
    await rm(journalDir, { recursive: true, force: true });
  });

  it("a non-labor expense carries a costtype: tag on the journal entry", async () => {
    const jobCode = `V3EXP-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Cost Type Job" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const costCode = await createCostCode({ code: `V3EXP-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);

    const vendor = await createVendor({ name: `V3 Expense Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const expense = await recordExpense({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      vendorId: vendor.data.id,
      costType: "subcontract",
      amount: "4500.00",
      date: "2026-07-24",
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;
    cleanupTxnids.push(expense.data.txnid);

    const [entry] = await print([`tag:txnid=${expense.data.txnid}`]);
    expect(entry.tags.costtype).toBe("subcontract");

    const bill = await prisma.bill.findUnique({ where: { txnid: expense.data.txnid } });
    expect(bill!.costType).toBe("subcontract");

    expect(await check()).toBeNull();
  });

  it("recording labor posts the burdened amount (not gross) and reconciles against hledger", async () => {
    const jobCode = `V3LAB-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Labor Job" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const costCodeCode = `V3LAB-CC-${Date.now()}`;
    const costCode = await createCostCode({ code: costCodeCode, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);

    // Same hand-computed fixture as lib/labor.ts tests: 33.33/hr, 7.65% +
    // 9.5% + 11% burden, 7.75 hours -> burdenedRate 42.71, burdened 331.00.
    const employee = await createEmployee({
      name: `V3 Labor Employee ${Date.now()}`,
      baseRate: "33.33",
      payrollTaxPct: "0.0765",
      workersCompPct: "0.095",
      benefitsPct: "0.11",
    });
    expect(employee.ok).toBe(true);
    if (!employee.ok) return;
    cleanupEmployeeIds.push(employee.data.id);

    const labor = await recordLaborCost({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      employeeId: employee.data.id,
      hours: "7.75",
      date: "2026-07-24",
    });
    expect(labor.ok).toBe(true);
    if (!labor.ok) return;
    cleanupTxnids.push(labor.data.txnid);

    const laborEntry = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(laborEntry!.grossAmount.toFixed(2)).toBe("258.31");
    expect(laborEntry!.burdenedAmount.toFixed(2)).toBe("331.00");
    expect(laborEntry!.burdenedRate.toFixed(2)).toBe("42.71");

    const [entry] = await print([`tag:txnid=${labor.data.txnid}`]);
    expect(entry.tags.costtype).toBe("labor");
    expect(entry.tags.job).toBe(jobCode);

    // The journal posts the burdened amount, not gross wages (spec §F18) —
    // verify the actual hledger balance reflects 331.00, not 258.31/232.31.
    const costBalance = await balance([`expenses:jobs:${jobCode}:${costCodeCode}`]);
    expect(costBalance.total.toFixed(2)).toBe("331.00");

    const payrollBalance = await balance(["liabilities:accrued payroll"]);
    expect(payrollBalance.total.toFixed(2)).toBe("-331.00");

    expect(await check()).toBeNull();

    // Editing changes hours and the posted amount follows.
    const edited = await editLaborCost({
      txnid: labor.data.txnid,
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      employeeId: employee.data.id,
      hours: "10",
      date: "2026-07-24",
    });
    expect(edited.ok).toBe(true);

    const rate = burdenedRate({
      baseRate: "33.33",
      payrollTaxPct: "0.0765",
      workersCompPct: "0.095",
      benefitsPct: "0.11",
    });
    const expectedBurdened = rate.times(10).toFixed(2);
    const editedEntry = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(editedEntry!.burdenedAmount.toFixed(2)).toBe(expectedBurdened);

    const costBalanceAfterEdit = await balance([`expenses:jobs:${jobCode}:${costCodeCode}`]);
    expect(costBalanceAfterEdit.total.toFixed(2)).toBe(expectedBurdened);
    expect(await check()).toBeNull();

    // Deleting removes both the journal entry and the LaborEntry row.
    const deleted = await deleteLaborCost(labor.data.txnid);
    expect(deleted.ok).toBe(true);

    const afterDelete = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(afterDelete).toBeNull();

    const costBalanceAfterDelete = await balance([`expenses:jobs:${jobCode}:${costCodeCode}`]);
    expect(costBalanceAfterDelete.total.toFixed(2)).toBe("0.00");
    expect(await check()).toBeNull();

    cleanupTxnids.splice(cleanupTxnids.indexOf(labor.data.txnid), 1); // already deleted, avoid afterEach re-deleting
  });

  it("labor rate changes on the employee don't rewrite past entries (rates are snapshotted)", async () => {
    const jobCode = `V3SNAP-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Snapshot Job" });
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const costCode = await createCostCode({ code: `V3SNAP-CC-${Date.now()}`, name: "Test" });
    if (!costCode.ok) return;
    cleanupCostCodeIds.push(costCode.data.id);

    const employeeName = `V3 Snapshot Employee ${Date.now()}`;
    const employee = await createEmployee({
      name: employeeName,
      baseRate: "20.00",
      payrollTaxPct: "0",
      workersCompPct: "0",
      benefitsPct: "0",
    });
    if (!employee.ok) return;
    cleanupEmployeeIds.push(employee.data.id);

    const labor = await recordLaborCost({
      jobId: job.data.id,
      costCodeId: costCode.data.id,
      employeeId: employee.data.id,
      hours: "5",
      date: "2026-07-24",
    });
    if (!labor.ok) return;
    cleanupTxnids.push(labor.data.txnid);

    const before = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(before!.burdenedAmount.toFixed(2)).toBe("100.00"); // 20 * 5, zero burden

    const { updateEmployee } = await import("@/app/actions/employees");
    const updated = await updateEmployee({
      id: employee.data.id,
      name: employeeName,
      baseRate: "50.00",
      payrollTaxPct: "0",
      workersCompPct: "0",
      benefitsPct: "0",
    });
    expect(updated.ok).toBe(true);

    const after = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(after!.burdenedAmount.toFixed(2)).toBe("100.00"); // unchanged despite rate bump
  });
});
