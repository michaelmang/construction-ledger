import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import * as git from "isomorphic-git";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// See test/action-edge-cases.test.ts for why this is mocked (revalidatePath's
// reasoning applies identically to auth()). "admin" role is required here
// specifically because this file calls createEmployee, which is admin-only.
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "test-user", email: "test@example.com", role: "admin" } })),
}));

import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { createJob, createCostCode } from "@/app/actions/jobs";
import { createVendor } from "@/app/actions/vendors";
import { createEmployee, updateEmployee } from "@/app/actions/employees";
import { recordExpense } from "@/app/actions/expenses";
import { recordLaborCost, editLaborCost, deleteLaborCost } from "@/app/actions/labor";
import { balance, print, check } from "@/lib/hledger";
import { computeLaborBurden } from "@/lib/labor-burden";
import { getCompanyAssumptions } from "@/lib/queries";

// v5 spec (job costing) replaced the flat-percent burden with
// computeLaborBurden(employee, company, asOf) — these tests recompute the
// expected burden through that same function (rather than hardcoding
// numbers that depend on whatever LaborBurdenSettings/PtoAccrualTier rows
// happen to be seeded) so they verify the *wiring* (the action posts what
// computeLaborBurden says it should), while test/labor-burden.test.ts
// verifies the formula itself against the source spreadsheet's fixtures.
async function expectedBurden(employeeId: number, hours: string, asOf: string) {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: { wcCode: true },
  });
  const company = await getCompanyAssumptions();
  const burden = computeLaborBurden(
    {
      payType: employee.payType as "salary" | "hourly",
      startDate: employee.startDate ?? employee.createdAt,
      holidayDays: employee.holidayDays,
      discretionaryPtoHours: employee.discretionaryPtoHours,
      currentPay: employee.currentPay,
      healthInsMonthly: employee.healthInsMonthly,
      retirementPct: employee.retirementPct,
      yearlyVehicleValue: employee.yearlyVehicleValue,
      wcRate: employee.wcCode?.rate ?? 0,
    },
    company,
    new Date(asOf),
  );
  const hoursDecimal = new Decimal(hours);
  return {
    gross: burden.hourlyRate.times(hoursDecimal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    burdened: burden.hourlyLaborBurden.times(hoursDecimal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    rate: burden.hourlyLaborBurden,
  };
}

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
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
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

    const employee = await createEmployee({
      name: `V3 Labor Employee ${Date.now()}`,
      payType: "hourly",
      employmentType: "full_time",
      startDate: "2020-01-01",
      currentPay: "33.33",
      healthInsMonthly: "50",
      retirementPct: "0.03",
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

    const expected = await expectedBurden(employee.data.id, "7.75", "2026-07-24");
    const laborEntry = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(laborEntry!.grossAmount.toFixed(2)).toBe(expected.gross.toFixed(2));
    expect(laborEntry!.burdenedAmount.toFixed(2)).toBe(expected.burdened.toFixed(2));
    expect(laborEntry!.burdenedRate.toFixed(2)).toBe(expected.rate.toFixed(2));

    const [entry] = await print([`tag:txnid=${labor.data.txnid}`]);
    expect(entry.tags.costtype).toBe("labor");
    expect(entry.tags.job).toBe(jobCode);

    // The journal posts the burdened amount, not gross wages (spec §F18) —
    // verify the actual hledger balance reflects the burdened total, not gross.
    const costBalance = await balance([`expenses:jobs:${jobCode}:${costCodeCode}`]);
    expect(costBalance.total.toFixed(2)).toBe(expected.burdened.toFixed(2));

    const payrollBalance = await balance(["liabilities:accrued payroll"]);
    expect(payrollBalance.total.toFixed(2)).toBe(expected.burdened.negated().toFixed(2));

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

    const expectedAfterEdit = await expectedBurden(employee.data.id, "10", "2026-07-24");
    const editedEntry = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    expect(editedEntry!.burdenedAmount.toFixed(2)).toBe(expectedAfterEdit.burdened.toFixed(2));

    const costBalanceAfterEdit = await balance([`expenses:jobs:${jobCode}:${costCodeCode}`]);
    expect(costBalanceAfterEdit.total.toFixed(2)).toBe(expectedAfterEdit.burdened.toFixed(2));
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
      payType: "hourly",
      employmentType: "full_time",
      currentPay: "20.00",
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

    const updated = await updateEmployee({
      id: employee.data.id,
      name: employeeName,
      payType: "hourly",
      employmentType: "full_time",
      currentPay: "50.00",
    });
    expect(updated.ok).toBe(true);

    const after = await prisma.laborEntry.findUnique({ where: { txnid: labor.data.txnid } });
    // Bumping currentPay from 20 -> 50 must not rewrite the already-posted
    // entry — LaborEntry snapshots the burden at record time (v5 spec job
    // costing carries this guarantee forward unchanged).
    expect(after!.burdenedAmount.toFixed(2)).toBe(before!.burdenedAmount.toFixed(2));
  });
});

describe("v3: cost type pivot reports + labor % of revenue (spec §F19, build instructions Phase 3)", () => {
  let journalDir: string;
  const cleanupJobIds: number[] = [];
  const cleanupCostCodeIds: number[] = [];
  const cleanupVendorIds: number[] = [];
  const cleanupEmployeeIds: number[] = [];
  const cleanupTxnids: string[] = [];
  const cleanupBillingIds: number[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "v3-pivot-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
  });

  afterAll(async () => {
    await prisma.paymentApplication.deleteMany({ where: { billingId: { in: cleanupBillingIds } } });
    await prisma.progressBilling.deleteMany({ where: { id: { in: cleanupBillingIds } } });
    await prisma.laborEntry.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.bill.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: cleanupTxnids } } });
    for (const jobId of cleanupJobIds) {
      await prisma.jobBudget.deleteMany({ where: { jobId } });
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }
    for (const id of cleanupCostCodeIds) {
      await prisma.costCode.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupVendorIds) {
      await prisma.vendor.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupEmployeeIds) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
    await rm(journalDir, { recursive: true, force: true });
  });

  it("pivot reports and labor-%-of-revenue reconcile against real hledger balances", async () => {
    const { setBudget } = await import("@/app/actions/jobs");
    const { createProgressBilling } = await import("@/app/actions/billings");
    const {
      getCostTypePivotForJob,
      getCostTypePivotByJob,
      getLaborPercentOfRevenue,
    } = await import("@/lib/reports");

    const jobCode = `V3PIVOT-${Date.now()}`;
    const job = await createJob({ code: jobCode, name: "Pivot Job", retainagePct: "0" });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    cleanupJobIds.push(job.data.id);

    const laborCostCode = await createCostCode({ code: `V3PIVOT-LAB-${Date.now()}`, name: "Labor Code" });
    if (!laborCostCode.ok) return;
    cleanupCostCodeIds.push(laborCostCode.data.id);
    const materialCostCode = await createCostCode({ code: `V3PIVOT-MAT-${Date.now()}`, name: "Material Code" });
    if (!materialCostCode.ok) return;
    cleanupCostCodeIds.push(materialCostCode.data.id);

    await setBudget({ jobId: job.data.id, costCodeId: laborCostCode.data.id, budgetedAmount: "1000" });
    await setBudget({ jobId: job.data.id, costCodeId: materialCostCode.data.id, budgetedAmount: "1000" });

    const vendor = await createVendor({ name: `V3 Pivot Vendor ${Date.now()}` });
    if (!vendor.ok) return;
    cleanupVendorIds.push(vendor.data.id);

    const employee = await createEmployee({
      name: `V3 Pivot Employee ${Date.now()}`,
      payType: "hourly",
      employmentType: "full_time",
      currentPay: "20.00",
    });
    if (!employee.ok) return;
    cleanupEmployeeIds.push(employee.data.id);

    // Labor: 10h @ 20/hr, no workers' comp classification (0%) but the
    // company's employer payroll tax still applies (v5 spec job costing).
    const labor = await recordLaborCost({
      jobId: job.data.id,
      costCodeId: laborCostCode.data.id,
      employeeId: employee.data.id,
      hours: "10",
      date: "2026-07-25",
    });
    expect(labor.ok).toBe(true);
    if (labor.ok) cleanupTxnids.push(labor.data.txnid);
    const expectedLabor = await expectedBurden(employee.data.id, "10", "2026-07-25");
    const expectedLaborAmount = expectedLabor.burdened;

    // Material expense: 300.00.
    const material = await recordExpense({
      jobId: job.data.id,
      costCodeId: materialCostCode.data.id,
      vendorId: vendor.data.id,
      costType: "material",
      amount: "300.00",
      date: "2026-07-25",
    });
    expect(material.ok).toBe(true);
    if (material.ok) cleanupTxnids.push(material.data.txnid);

    // Progress billing: 2000.00 recognized in full as income (v2 spec §F1 —
    // income is recognized on the full billed amount regardless of retainage).
    const billing = await createProgressBilling({
      jobId: job.data.id,
      billingDate: "2026-07-25",
      amountBilled: "2000.00",
      retainageWithheld: "0",
    });
    expect(billing.ok).toBe(true);
    if (billing.ok) cleanupBillingIds.push(billing.data.id);

    expect(await check()).toBeNull();

    // Per-job pivot: one row per budgeted cost code, bucketed by cost type.
    const jobPivot = await getCostTypePivotForJob(job.data.id);
    const laborRow = jobPivot.find((r) => r.costCodeId === laborCostCode.data.id);
    const materialRow = jobPivot.find((r) => r.costCodeId === materialCostCode.data.id);
    expect(laborRow!.labor.toFixed(2)).toBe(expectedLaborAmount.toFixed(2));
    expect(laborRow!.total.toFixed(2)).toBe(expectedLaborAmount.toFixed(2));
    expect(materialRow!.material.toFixed(2)).toBe("300.00");
    expect(materialRow!.total.toFixed(2)).toBe("300.00");

    // Cross-check against real hledger balance output directly.
    const laborBalance = await balance([`tag:job=${jobCode}`, "tag:costtype=labor", "type:x"]);
    expect(laborBalance.total.toFixed(2)).toBe(expectedLaborAmount.toFixed(2));
    const materialBalance = await balance([`tag:job=${jobCode}`, "tag:costtype=material", "type:x"]);
    expect(materialBalance.total.toFixed(2)).toBe("300.00");

    // Company-wide by-job pivot: this job's row should match the per-job pivot.
    const byJobPivot = await getCostTypePivotByJob(["active"]);
    const jobRow = byJobPivot.find((r) => r.jobId === job.data.id);
    expect(jobRow!.labor.toFixed(2)).toBe(expectedLaborAmount.toFixed(2));
    expect(jobRow!.material.toFixed(2)).toBe("300.00");
    expect(jobRow!.total.toFixed(2)).toBe(expectedLaborAmount.plus("300.00").toFixed(2));

    // Labor % of revenue: labor / 2000.00 revenue. This journal is isolated
    // to this describe block (its own mkdtemp), so the ratio is exact, not
    // diluted by other tests' entries.
    const laborPct = await getLaborPercentOfRevenue();
    expect(laborPct.toFixed(2)).toBe(expectedLaborAmount.dividedBy(2000).times(100).toFixed(2));

    const incomeBalance = await balance(["type:R"]);
    expect(incomeBalance.total.abs().toFixed(2)).toBe("2000.00");
  });
});
