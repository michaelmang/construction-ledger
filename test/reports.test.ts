import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import * as git from "isomorphic-git";
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
  retainageReceivable,
} from "@/lib/accounts";
import {
  getWipSchedule,
  getJobProfitability,
  getCostCodeBreakdown,
  getRetainageAging,
  getCashPosition,
  getJobCostTrend,
  getCashTrend,
  getLaborPercentTrend,
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
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });

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
        // Deliberately after the Phase 5 custom range below. Cost-to-date
        // reports include it, but the time-series range must not.
        date: "2026-07-31",
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
    const netBilled = amountBilled.minus(retainageWithheld);
    // Retainage withheld by the client is receivable to us (an asset), not
    // payable (v2 spec §F1). AR carries only the net; income recognizes the
    // full billed amount.
    const t3 = await recordTransaction(
      {
        kind: "progress-billing",
        jobId,
        date: "2026-06-24",
        description: "Progress billing - fixture",
        tags: { job: jobCode, type: "progress-billing" },
        postings: [
          { account: accountsReceivable(jobCode), amount: netBilled },
          { account: retainageReceivable(jobCode), amount: retainageWithheld },
          { account: incomeJob(jobCode), amount: amountBilled.negated() },
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

  it("reports retainage receivable balance (client-withheld) and days outstanding", async () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const report = await getRetainageAging(jobId, asOf);
    // No sub-side retainage withheld in this fixture (expenses don't withhold).
    expect(report.retainagePayableBalance.toFixed(2)).toBe("0.00");
    // Client withheld 3,500 on the progress billing -> receivable to us.
    expect(report.retainageReceivableBalance.toFixed(2)).toBe("3500.00");
    expect(report.billings).toHaveLength(1);
    expect(report.billings[0].retainageWithheld.toFixed(2)).toBe("3500.00");
    expect(report.billings[0].daysOutstanding).toBe(30);
  });

  it("returns a whole-business cash position via a thin hledger wrapper", async () => {
    const cash = await getCashPosition();
    // assets: AR net 31,500 + retainage receivable 3,500 = 35,000
    // liabilities: two vendor bills -10,000 -20,000 = -30,000
    // total = 35,000 - 30,000 = 5,000
    expect(cash.total.toFixed(2)).toBe("5000.00");
    expect(cash.lines.some((l) => l.account === accountsReceivable(jobCode))).toBe(true);
  });

  // Phase 5 (v3 spec, Vercel migration): date-range drill-down. One fixture
  // expense is after the requested end date, proving the final partial-month
  // bucket does not include future entries.
  it("buckets job costs by month over a custom range and coarsens beyond the point ceiling", async () => {
    const to = new Date("2026-07-24T00:00:00");
    const trend = await getJobCostTrend(jobId, { from: new Date("2026-06-01T00:00:00"), to });
    expect(trend.map((p) => p.month)).toEqual(["2026-06", "2026-07"]);
    expect(trend[0].costs).toBeCloseTo(10000, 2);
    expect(trend[1].costs).toBeCloseTo(0, 2);

    const longTrend = await getJobCostTrend(jobId, { from: new Date("2021-07-24T00:00:00"), to });
    expect(longTrend.length).toBeLessThan(61); // fewer points than 61 natural monthly buckets -> coarsening triggered
    expect(longTrend.length).toBeLessThanOrEqual(52);
    const total = longTrend.reduce((sum, p) => sum + p.costs, 0);
    expect(total).toBeCloseTo(10000, 2); // telescoping deltas honor the requested end date regardless of bucket width
  });

  it("samples cash weekly over a custom range and preserves the historical default point count", async () => {
    const defaultTrend = await getCashTrend();
    expect(defaultTrend.length).toBe(9); // 8 weeks + 1 point, unchanged default behavior

    const customTrend = await getCashTrend({
      from: new Date("2026-06-01T00:00:00"),
      to: new Date("2026-06-15T00:00:00"),
    });
    expect(customTrend.map((p) => p.date)).toEqual(["2026-06-01", "2026-06-08", "2026-06-15"]);

    const longTrend = await getCashTrend({
      from: new Date("2020-01-01T00:00:00"),
      to: new Date("2026-07-24T00:00:00"),
    });
    expect(longTrend.length).toBeLessThanOrEqual(53); // 52-point ceiling + 1
  });

  it("returns one point per month bucket for the labor % trend over a custom range", async () => {
    const trend = await getLaborPercentTrend({
      from: new Date("2026-06-01T00:00:00"),
      to: new Date("2026-07-24T00:00:00"),
    });
    expect(trend.map((p) => p.month)).toEqual(["2026-06", "2026-07"]);
    for (const p of trend) {
      expect(Number.isFinite(p.laborPct)).toBe(true);
    }
  });
});
