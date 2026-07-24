import Decimal from "decimal.js";
import { prisma } from "./db";
import { balance, BalanceLine } from "./hledger";
import {
  computeWipSchedule,
  computeJobProfitability,
  computeCostCodeBreakdown,
  computeEstimatedTotalCost,
  computeRetainageAging,
  WipScheduleResult,
  JobProfitabilityResult,
  CostCodeBreakdownRow,
  RetainageAgingRow,
} from "./wip";

function toDecimal(value: unknown): Decimal {
  return new Decimal(value === null || value === undefined ? 0 : String(value));
}

async function costsToDateLines(jobCode: string): Promise<{ total: Decimal; lines: BalanceLine[] }> {
  const { lines, total } = await balance([`tag:job=${jobCode}`, "type:x"]);
  return { total, lines };
}

function costByCostCode(jobCode: string, lines: BalanceLine[]): Map<string, Decimal> {
  const prefix = `expenses:jobs:${jobCode}:`;
  const map = new Map<string, Decimal>();
  for (const line of lines) {
    if (line.account.startsWith(prefix)) {
      map.set(line.account.slice(prefix.length), line.amount);
    }
  }
  return map;
}

export async function billedToDate(jobId: number): Promise<Decimal> {
  const agg = await prisma.progressBilling.aggregate({
    where: { jobId },
    _sum: { amountBilled: true },
  });
  return toDecimal(agg._sum.amountBilled);
}

export async function approvedChangeOrdersTotal(jobId: number): Promise<Decimal> {
  const agg = await prisma.changeOrder.aggregate({
    where: { jobId, status: "approved" },
    _sum: { amount: true },
  });
  return toDecimal(agg._sum.amount);
}

// Contract value + approved change orders. Used both by the WIP schedule and
// by the over-billing warning check in app/actions/billings.ts.
export async function getRevisedContractValue(jobId: number): Promise<Decimal> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  return toDecimal(job.contractValue).plus(await approvedChangeOrdersTotal(jobId));
}

async function jobBudgetsWithActuals(jobId: number, jobCode: string, costLines: BalanceLine[]) {
  const budgets = await prisma.jobBudget.findMany({
    where: { jobId },
    include: { costCode: true },
  });
  const actuals = costByCostCode(jobCode, costLines);
  return budgets.map((b) => ({
    costCode: b.costCode.code,
    costCodeName: b.costCode.name,
    budgetedAmount: toDecimal(b.budgetedAmount),
    revisedEstimate: b.revisedEstimate ? toDecimal(b.revisedEstimate) : null,
    actual: actuals.get(b.costCode.code) ?? new Decimal(0),
  }));
}

export interface JobWipReport {
  jobId: number;
  jobCode: string;
  jobName: string;
  wip: WipScheduleResult;
}

export async function getWipSchedule(jobId: number): Promise<JobWipReport> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const { total: costsToDate, lines } = await costsToDateLines(job.code);
  const budgets = await jobBudgetsWithActuals(job.id, job.code, lines);
  const estimatedTotalCost = computeEstimatedTotalCost(budgets);

  const wip = computeWipSchedule({
    contractValue: toDecimal(job.contractValue),
    approvedChangeOrdersTotal: await approvedChangeOrdersTotal(job.id),
    costsToDate,
    estimatedTotalCost,
    billedToDate: await billedToDate(job.id),
  });

  return { jobId: job.id, jobCode: job.code, jobName: job.name, wip };
}

export async function getWipScheduleForActiveJobs(): Promise<JobWipReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: "active" } });
  return Promise.all(jobs.map((j) => getWipSchedule(j.id)));
}

export interface JobProfitabilityReport {
  jobId: number;
  jobCode: string;
  jobName: string;
  wip: WipScheduleResult;
  profitability: JobProfitabilityResult;
}

export async function getJobProfitability(jobId: number): Promise<JobProfitabilityReport> {
  const report = await getWipSchedule(jobId);
  const profitability = computeJobProfitability(report.wip);
  return { ...report, profitability };
}

export async function getProfitabilityForActiveJobs(): Promise<JobProfitabilityReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: "active" } });
  return Promise.all(jobs.map((j) => getJobProfitability(j.id)));
}

export async function getRetainageAgingForActiveJobs(
  asOf: Date = new Date(),
): Promise<RetainageAgingReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: "active" } });
  return Promise.all(jobs.map((j) => getRetainageAging(j.id, asOf)));
}

export async function getCostCodeBreakdown(jobId: number): Promise<CostCodeBreakdownRow[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const { lines } = await costsToDateLines(job.code);
  const budgets = await jobBudgetsWithActuals(job.id, job.code, lines);
  return computeCostCodeBreakdown(budgets);
}

export interface RetainageAgingReport {
  jobId: number;
  jobCode: string;
  jobName: string;
  retainagePayableBalance: Decimal; // owed by us to the job's client-side retainage pot (positive = owed)
  retainageReceivableBalance: Decimal;
  billings: RetainageAgingRow[];
}

export async function getRetainageAging(
  jobId: number,
  asOf: Date = new Date(),
): Promise<RetainageAgingReport> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

  const [payable, receivable, billings] = await Promise.all([
    balance([`tag:job=${job.code}`, "liabilities:retainage payable"]),
    balance([`tag:job=${job.code}`, "assets:retainage receivable"]),
    prisma.progressBilling.findMany({
      where: { jobId, billingDate: { not: null } },
      orderBy: { billingDate: "asc" },
    }),
  ]);

  return {
    jobId: job.id,
    jobCode: job.code,
    jobName: job.name,
    retainagePayableBalance: payable.total.negated(),
    retainageReceivableBalance: receivable.total,
    billings: computeRetainageAging(
      billings
        .filter((b) => b.billingDate !== null)
        .map((b) => ({
          billingDate: b.billingDate as Date,
          periodLabel: b.periodLabel,
          retainageWithheld: toDecimal(b.retainageWithheld),
        })),
      asOf,
    ),
  };
}

export interface CashPosition {
  lines: BalanceLine[];
  total: Decimal;
}

// Whole-business cash position: a thin wrapper on `hledger balance` for
// assets and liabilities (product spec §5.5).
export async function getCashPosition(): Promise<CashPosition> {
  return balance(["type:AL"]);
}

export interface CashPositionSummary {
  assetsTotal: Decimal;
  liabilitiesTotal: Decimal;
  netCash: Decimal;
}

// Aggregate-only view for the dashboard tile, so it never has to show raw
// hledger account paths (product spec's guiding rule: hledger stays
// invisible). The full account breakdown lives on the Reports > Cash
// Position page, humanized via lib/accounts.ts.
export async function getCashPositionSummary(): Promise<CashPositionSummary> {
  const [assets, liabilities] = await Promise.all([balance(["type:A"]), balance(["type:L"])]);
  return {
    assetsTotal: assets.total,
    liabilitiesTotal: liabilities.total,
    netCash: assets.total.plus(liabilities.total),
  };
}
