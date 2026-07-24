import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { recordTransaction } from "@/lib/transactions";
import {
  accountsPayable,
  accountsReceivable,
  expenseJobCostCode,
  incomeJob,
  retainagePayable,
} from "@/lib/accounts";
import {
  getWipSchedule,
  getJobProfitability,
  getCostCodeBreakdown,
  getRetainageAging,
  getCashPosition,
} from "@/lib/reports";

// Hand-computed fixture (see comments below each figure):
//   contract 100,000 + 5,000 approved CO = revised 105,000
//   concrete: budget 40,000, no revised estimate, actual 10,000 -> EAC 40,000
//   carpentry: budget 30,000, revised estimate 35,000, actual 20,000 -> EAC 35,000
//   estimatedTotalCost = 40,000 + 35,000 = 75,000
//   costsToDate = 10,000 + 20,000 = 30,000 -> pctComplete = 30,000/75,000 = 0.4
//   earnedRevenue = 0.4 * 105,000 = 42,000
//   progress billing amountBilled 35,000, retainage 10% -> 3,500 withheld
//   billedToDate = 35,000 -> overUnderBilling = 35,000 - 42,000 = -7,000 (underbilled)
//   projectedMargin = 105,000 - 75,000 = 30,000
//   actualMarginToDate = 42,000 - 30,000 = 12,000
describe("reports (integration, hermetic fixture)", () => {
  let journalDir: string;
  let jobId: number;
  let jobCode: string;
  const txnids: string[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "reports-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await promisify(execFile)("git", ["init"], { cwd: journalDir });

    jobCode = `TEST-WIP-${Date.now()}`;
    const job = await prisma.job.create({
      data: { code: jobCode, name: "Fixture Job", contractValue: "100000.00", retainagePct: "0.10" },
    });
    jobId = job.id;

    const concrete = await prisma.costCode.upsert({
      where: { code: "03-CONCRETE" },
      update: {},
      create: { code: "03-CONCRETE", name: "Concrete" },
    });
    const carpentry = await prisma.costCode.upsert({
      where: { code: "06-CARPENTRY" },
      update: {},
      create: { code: "06-CARPENTRY", name: "Carpentry" },
    });

    await prisma.jobBudget.create({
      data: { jobId, costCodeId: concrete.id, budgetedAmount: "40000.00" },
    });
    await prisma.jobBudget.create({
      data: {
        jobId,
        costCodeId: carpentry.id,
        budgetedAmount: "30000.00",
        revisedEstimate: "35000.00",
      },
    });

    await prisma.changeOrder.create({
      data: { jobId, amount: "5000.00", status: "approved" },
    });

    const expense1 = new Decimal("10000.00");
    const t1 = await recordTransaction(
      {
        kind: "expense",
        jobId,
        date: "2026-06-01",
        description: "Concrete vendor",
        tags: { job: jobCode, code: "03-CONCRETE" },
        postings: [
          { account: expenseJobCostCode(jobCode, "03-CONCRETE"), amount: expense1 },
          { account: accountsPayable("vendor1"), amount: expense1.negated() },
        ],
        amount: expense1,
      },
      "fixture: expense 1",
    );
    txnids.push(t1.txnid);

    const expense2 = new Decimal("20000.00");
    const t2 = await recordTransaction(
      {
        kind: "expense",
        jobId,
        date: "2026-06-05",
        description: "Carpentry vendor",
        tags: { job: jobCode, code: "06-CARPENTRY" },
        postings: [
          { account: expenseJobCostCode(jobCode, "06-CARPENTRY"), amount: expense2 },
          { account: accountsPayable("vendor2"), amount: expense2.negated() },
        ],
        amount: expense2,
      },
      "fixture: expense 2",
    );
    txnids.push(t2.txnid);

    const amountBilled = new Decimal("35000.00");
    const retainageWithheld = new Decimal("3500.00");
    const earnedNet = amountBilled.minus(retainageWithheld);
    const t3 = await recordTransaction(
      {
        kind: "progress-billing",
        jobId,
        date: "2026-06-24",
        description: "Progress billing - fixture",
        tags: { job: jobCode, type: "progress-billing" },
        postings: [
          { account: accountsReceivable(jobCode), amount: amountBilled },
          { account: retainagePayable(jobCode), amount: retainageWithheld.negated() },
          { account: incomeJob(jobCode), amount: earnedNet.negated() },
        ],
        amount: amountBilled,
      },
      "fixture: progress billing",
    );
    txnids.push(t3.txnid);

    await prisma.progressBilling.create({
      data: {
        jobId,
        billingDate: new Date("2026-06-24"),
        periodLabel: "Fixture Pay App",
        amountBilled: amountBilled.toFixed(2),
        retainageWithheld: retainageWithheld.toFixed(2),
        txnid: t3.txnid,
      },
    });
  });

  afterAll(async () => {
    await prisma.progressBilling.deleteMany({ where: { jobId } });
    await prisma.changeOrder.deleteMany({ where: { jobId } });
    await prisma.jobBudget.deleteMany({ where: { jobId } });
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: txnids } } });
    await prisma.job.delete({ where: { id: jobId } });
    await rm(journalDir, { recursive: true, force: true });
  });

  it("computes the WIP schedule against the hand-computed fixture", async () => {
    const report = await getWipSchedule(jobId);
    expect(report.wip.revisedContractValue.toFixed(2)).toBe("105000.00");
    expect(report.wip.estimatedTotalCost.toFixed(2)).toBe("75000.00");
    expect(report.wip.costsToDate.toFixed(2)).toBe("30000.00");
    expect(report.wip.pctComplete.toFixed(4)).toBe("0.4000");
    expect(report.wip.earnedRevenue.toFixed(2)).toBe("42000.00");
    expect(report.wip.billedToDate.toFixed(2)).toBe("35000.00");
    expect(report.wip.overUnderBilling.toFixed(2)).toBe("-7000.00");
  });

  it("computes job profitability from the same fixture", async () => {
    const report = await getJobProfitability(jobId);
    expect(report.profitability.projectedMargin.toFixed(2)).toBe("30000.00");
    expect(report.profitability.actualMarginToDate.toFixed(2)).toBe("12000.00");
  });

  it("breaks down budget vs actual vs remaining by cost code", async () => {
    const rows = await getCostCodeBreakdown(jobId);
    const concrete = rows.find((r) => r.costCode === "03-CONCRETE")!;
    const carpentry = rows.find((r) => r.costCode === "06-CARPENTRY")!;

    expect(concrete.estimatedAtCompletion.toFixed(2)).toBe("40000.00");
    expect(concrete.actual.toFixed(2)).toBe("10000.00");
    expect(concrete.remaining.toFixed(2)).toBe("30000.00");

    expect(carpentry.estimatedAtCompletion.toFixed(2)).toBe("35000.00");
    expect(carpentry.actual.toFixed(2)).toBe("20000.00");
    expect(carpentry.remaining.toFixed(2)).toBe("15000.00");
  });

  it("reports retainage payable balance and days outstanding", async () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const report = await getRetainageAging(jobId, asOf);
    expect(report.retainagePayableBalance.toFixed(2)).toBe("3500.00");
    expect(report.retainageReceivableBalance.toFixed(2)).toBe("0.00");
    expect(report.billings).toHaveLength(1);
    expect(report.billings[0].retainageWithheld.toFixed(2)).toBe("3500.00");
    expect(report.billings[0].daysOutstanding).toBe(30);
  });

  it("returns a whole-business cash position via a thin hledger wrapper", async () => {
    const cash = await getCashPosition();
    // assets 35,000 (AR) + liabilities (-10,000 -20,000 -3,500 = -33,500) = 1,500
    expect(cash.total.toFixed(2)).toBe("1500.00");
    expect(cash.lines.some((l) => l.account === accountsReceivable(jobCode))).toBe(true);
  });
});
