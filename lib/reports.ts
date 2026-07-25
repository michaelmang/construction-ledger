import Decimal from "decimal.js";
import { prisma } from "./db";
import { balance, BalanceLine } from "./hledger";
import { COST_TYPES } from "./cost-types";
import {
  computeWipSchedule,
  computeJobProfitability,
  computeCostCodeBreakdown,
  computeEstimatedTotalCost,
  computeRetainageAging,
  computeArAging,
  computeApAging,
  computeCostTypePivot,
  computeCostTypePivotByJob,
  WipScheduleResult,
  JobProfitabilityResult,
  CostCodeBreakdownRow,
  RetainageAgingRow,
  ArAgingRow,
  ApAgingRow,
  CostTypePivotRow,
  JobCostTypePivotRow,
  CostTypePivotAmount,
  CostTypeBucket,
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
    costCodeId: b.costCodeId,
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
  cfoPctCompleteEstimate: Decimal | null; // from the most recent billing, informational only (v2 spec §F4)
}

async function latestCfoPctCompleteEstimate(jobId: number): Promise<Decimal | null> {
  const latest = await prisma.progressBilling.findFirst({
    where: { jobId, pctCompleteEstimate: { not: null } },
    orderBy: { billingDate: "desc" },
  });
  return latest?.pctCompleteEstimate ? toDecimal(latest.pctCompleteEstimate) : null;
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

  return {
    jobId: job.id,
    jobCode: job.code,
    jobName: job.name,
    wip,
    cfoPctCompleteEstimate: await latestCfoPctCompleteEstimate(job.id),
  };
}

// Defaults to active-only for the dashboard; report pages pass
// ["active", "complete"] so closed jobs stay reviewable without cluttering
// the dashboard (v2 spec §F12).
export async function getWipScheduleForActiveJobs(
  statuses: string[] = ["active"],
): Promise<JobWipReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: { in: statuses } } });
  return Promise.all(jobs.map((j) => getWipSchedule(j.id)));
}

export interface JobProfitabilityReport extends JobWipReport {
  profitability: JobProfitabilityResult;
}

export async function getJobProfitability(jobId: number): Promise<JobProfitabilityReport> {
  const report = await getWipSchedule(jobId);
  const profitability = computeJobProfitability(report.wip);
  return { ...report, profitability };
}

export async function getProfitabilityForActiveJobs(
  statuses: string[] = ["active"],
): Promise<JobProfitabilityReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: { in: statuses } } });
  return Promise.all(jobs.map((j) => getJobProfitability(j.id)));
}

export async function getRetainageAgingForActiveJobs(
  asOf: Date = new Date(),
  statuses: string[] = ["active"],
): Promise<RetainageAgingReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: { in: statuses } } });
  return Promise.all(jobs.map((j) => getRetainageAging(j.id, asOf)));
}

export async function getCostCodeBreakdown(jobId: number): Promise<CostCodeBreakdownRow[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const { lines } = await costsToDateLines(job.code);
  const budgets = await jobBudgetsWithActuals(job.id, job.code, lines);
  return computeCostCodeBreakdown(budgets);
}

// Bucket key for entries with no costtype tag (pre-v3-backfill), never
// silently folded into "other" — a nonzero value is the signal that the
// backfill migration (v3 build instructions Phase 4) hasn't run yet.
const UNTYPED: CostTypeBucket = "untyped";

interface CostTypeAccountAmount {
  costCode: string;
  costType: CostTypeBucket;
  amount: Decimal;
}

// One hledger balance call per cost type (5) plus one for "untyped" (entries
// with no costtype tag at all, queried via `not:tag:costtype`) — cheap at
// this app's scale, and keeps each call a simple account-balance query
// rather than parsing `print` output (v3 build instructions Phase 3).
async function costTypeAmountsForJob(jobCode: string): Promise<CostTypeAccountAmount[]> {
  const perType = await Promise.all(
    COST_TYPES.map(async (t) => ({ type: t, lines: (await balance([`tag:job=${jobCode}`, `tag:costtype=${t}`, "type:x"])).lines })),
  );
  const untyped = await balance([`tag:job=${jobCode}`, "not:tag:costtype", "type:x"]);

  const prefix = `expenses:jobs:${jobCode}:`;
  const amounts: CostTypeAccountAmount[] = [];
  function collect(lines: BalanceLine[], costType: CostTypeBucket) {
    for (const line of lines) {
      if (!line.account.startsWith(prefix)) continue;
      amounts.push({ costCode: line.account.slice(prefix.length), costType, amount: line.amount });
    }
  }
  for (const { type, lines } of perType) collect(lines, type);
  collect(untyped.lines, UNTYPED);
  return amounts;
}

// Cost code x cost type pivot for a single job's Cost Codes tab (v3 spec
// §F17/§F19). Only cost codes with a JobBudget row appear, matching
// getCostCodeBreakdown's existing convention.
export async function getCostTypePivotForJob(jobId: number): Promise<CostTypePivotRow[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const budgets = await prisma.jobBudget.findMany({ where: { jobId }, include: { costCode: true } });
  const raw = await costTypeAmountsForJob(job.code);

  const idByCode = new Map(budgets.map((b) => [b.costCode.code, b.costCodeId]));
  const amounts: CostTypePivotAmount[] = raw
    .map((r) => {
      const costCodeId = idByCode.get(r.costCode);
      return costCodeId ? { key: costCodeId, costType: r.costType, amount: r.amount } : null;
    })
    .filter((a): a is CostTypePivotAmount => a !== null);

  const costCodes = budgets.map((b) => ({
    costCodeId: b.costCodeId,
    costCode: b.costCode.code,
    costCodeName: b.costCode.name,
  }));
  return computeCostTypePivot(costCodes, amounts);
}

// Company-wide job x cost type pivot (v3 spec §F19: "is Concrete over budget
// company-wide, or just this job"). Job code is parsed straight out of the
// account path (expenses:jobs:<job>:<code>), so this is 6 hledger calls
// total, not 6 per job.
export async function getCostTypePivotByJob(
  statuses: string[] = ["active", "complete"],
): Promise<JobCostTypePivotRow[]> {
  const jobs = await prisma.job.findMany({ where: { status: { in: statuses } } });
  const jobByCode = new Map(jobs.map((j) => [j.code, j]));
  const jobAccountRe = /^expenses:jobs:([^:]+):/;

  const perType = await Promise.all(
    COST_TYPES.map(async (t) => ({ type: t, lines: (await balance([`tag:costtype=${t}`, "type:x"])).lines })),
  );
  const untyped = await balance(["not:tag:costtype", "type:x"]);

  const amounts: CostTypePivotAmount[] = [];
  function collect(lines: BalanceLine[], costType: CostTypeBucket) {
    for (const line of lines) {
      const match = line.account.match(jobAccountRe);
      if (!match) continue;
      const job = jobByCode.get(match[1]);
      if (!job) continue;
      amounts.push({ key: job.id, costType, amount: line.amount });
    }
  }
  for (const { type, lines } of perType) collect(lines, type);
  collect(untyped.lines, UNTYPED);

  const jobRows = jobs.map((j) => ({ jobId: j.id, jobCode: j.code, jobName: j.name }));
  return computeCostTypePivotByJob(jobRows, amounts);
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

export interface MonthlyCostPoint {
  month: string; // YYYY-MM
  costs: number; // costs incurred that month, not cumulative
}

// Per-month cost totals for a job's overview chart (v2 spec §4.4). Samples
// cumulative costs-to-date at each month boundary and takes deltas, same
// as-of-date approach as getCashTrend for the same reason: simple to reason
// about correct.
export async function getJobCostTrend(jobId: number, months: number = 6): Promise<MonthlyCostPoint[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const today = new Date();
  const cumulative: { month: string; total: Decimal }[] = [];

  for (let i = months; i >= 0; i--) {
    const boundary = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const dateArg = boundary.toISOString().slice(0, 10).replace(/-/g, "");
    const { total } = await balance([`tag:job=${job.code}`, "type:x", `date:-${dateArg}`]);
    const monthLabel = new Date(today.getFullYear(), today.getMonth() - i, 1)
      .toISOString()
      .slice(0, 7);
    cumulative.push({ month: monthLabel, total });
  }

  return cumulative.map((point, i) => ({
    month: point.month,
    costs: (i === 0 ? point.total : point.total.minus(cumulative[i - 1].total)).toNumber(),
  }));
}

export interface CashTrendPoint {
  date: string; // YYYY-MM-DD
  netCash: number;
}

// Weekly net-cash snapshots for the dashboard trend chart (v2 spec §F15).
// Samples `hledger balance` as-of each week boundary rather than relying on
// register()'s running-total semantics, so it's simple to reason about
// correct — one call per point is fine at dashboard scale.
export async function getCashTrend(weeks: number = 8): Promise<CashTrendPoint[]> {
  const today = new Date();
  const points: CashTrendPoint[] = [];

  for (let i = weeks; i >= 0; i--) {
    const asOf = new Date(today);
    asOf.setDate(asOf.getDate() - i * 7);
    const dateStr = asOf.toISOString().slice(0, 10);
    // hledger's `date:-DATE` end boundary is exclusive, so query the day
    // after to include everything dated on `asOf` itself.
    const inclusiveEnd = new Date(asOf);
    inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
    const dateArg = inclusiveEnd.toISOString().slice(0, 10).replace(/-/g, "");
    const { total } = await balance(["type:AL", `date:-${dateArg}`]);
    points.push({ date: dateStr, netCash: total.toNumber() });
  }

  return points;
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

export interface JobArAgingReport {
  jobId: number;
  jobCode: string;
  jobName: string;
  rows: ArAgingRow[];
}

// Per-job AR aging: what's still owed on each progress billing, net of
// retainage and any payments already applied (v2 spec §F10).
export async function getArAging(jobId: number, asOf: Date = new Date()): Promise<JobArAgingReport> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const billings = await prisma.progressBilling.findMany({
    where: { jobId, billingDate: { not: null } },
  });

  return {
    jobId: job.id,
    jobCode: job.code,
    jobName: job.name,
    rows: computeArAging(
      billings.map((b) => ({
        billingId: b.id,
        periodLabel: b.periodLabel,
        billingDate: b.billingDate as Date,
        netBilled: toDecimal(b.amountBilled).minus(b.retainageWithheld),
        paidAmount: toDecimal(b.paidAmount),
      })),
      asOf,
    ),
  };
}

export async function getArAgingForActiveJobs(
  asOf: Date = new Date(),
  statuses: string[] = ["active"],
): Promise<JobArAgingReport[]> {
  const jobs = await prisma.job.findMany({ where: { status: { in: statuses } } });
  return Promise.all(jobs.map((j) => getArAging(j.id, asOf)));
}

// Whole-business AP aging: what's still owed on every open/partial bill
// (job-cost and overhead alike), net of retainage withheld and payments made
// (v2 spec §F6).
export async function getApAging(asOf: Date = new Date()): Promise<ApAgingRow[]> {
  const bills = await prisma.bill.findMany({
    where: { status: { in: ["open", "partial"] } },
    include: { vendor: true },
  });

  return computeApAging(
    bills.map((b) => ({
      billId: b.id,
      vendorName: b.vendor.name,
      description: b.description,
      billDate: b.date,
      amount: toDecimal(b.amount),
      retainageWithheld: toDecimal(b.retainageWithheld),
      paidAmount: toDecimal(b.paidAmount),
    })),
    asOf,
  );
}

export interface OverBudgetAlert {
  jobId: number;
  jobCode: string;
  jobName: string;
  costCode: string;
  costCodeName: string;
  utilizationPct: Decimal; // actual / estimatedAtCompletion * 100
}

// "Concrete on J2026-014 is 112% of estimate" alerts for the dashboard (v2
// spec §F15).
export async function getOverBudgetAlerts(): Promise<OverBudgetAlert[]> {
  const jobs = await prisma.job.findMany({ where: { status: "active" } });
  const alerts: OverBudgetAlert[] = [];

  for (const job of jobs) {
    const rows = await getCostCodeBreakdown(job.id);
    for (const row of rows) {
      if (row.remaining.isNegative() && !row.estimatedAtCompletion.isZero()) {
        alerts.push({
          jobId: job.id,
          jobCode: job.code,
          jobName: job.name,
          costCode: row.costCode,
          costCodeName: row.costCodeName,
          utilizationPct: row.actual.dividedBy(row.estimatedAtCompletion).times(100),
        });
      }
    }
  }

  return alerts;
}

export interface DashboardSummary {
  totalOverUnderBilling: Decimal; // sum across active jobs; positive = net overbilled
  totalArOutstanding: Decimal;
  totalApOutstanding: Decimal;
  totalRetainageHeld: Decimal; // retainage payable + retainage receivable, across active jobs
  laborPercentOfRevenue: Decimal; // company-wide labor cost / total revenue recognized, as a percentage (v3 spec §F19)
}

// Company-wide labor cost as a percentage of revenue recognized to date — a
// margin-risk signal (v3 spec §F19: labor-heavy jobs carry different
// risk/margin than subbed-out scope). Income postings are credit-signed
// (negative) per lib/accounts.ts's incomeJob(), so revenue is the absolute
// value of the income balance.
export async function getLaborPercentOfRevenue(): Promise<Decimal> {
  const [labor, income] = await Promise.all([
    balance(["tag:costtype=labor", "type:x"]),
    balance(["type:R"]),
  ]);
  const revenue = income.total.abs();
  if (revenue.isZero()) return new Decimal(0);
  return labor.total.dividedBy(revenue).times(100);
}

// Aggregate figures for the dashboard hero row beyond the plain cash tile
// (v2 spec §F15).
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [wipReports, arReports, apRows, retainageReports, laborPercentOfRevenue] = await Promise.all([
    getWipScheduleForActiveJobs(),
    getArAgingForActiveJobs(),
    getApAging(),
    getRetainageAgingForActiveJobs(),
    getLaborPercentOfRevenue(),
  ]);

  const totalOverUnderBilling = wipReports.reduce(
    (sum, r) => sum.plus(r.wip.overUnderBilling),
    new Decimal(0),
  );
  const totalArOutstanding = arReports.reduce(
    (sum, r) => sum.plus(r.rows.reduce((s, row) => s.plus(row.amountDue), new Decimal(0))),
    new Decimal(0),
  );
  const totalApOutstanding = apRows.reduce((sum, r) => sum.plus(r.amountDue), new Decimal(0));
  const totalRetainageHeld = retainageReports.reduce(
    (sum, r) => sum.plus(r.retainagePayableBalance).plus(r.retainageReceivableBalance),
    new Decimal(0),
  );

  return {
    totalOverUnderBilling,
    totalArOutstanding,
    totalApOutstanding,
    totalRetainageHeld,
    laborPercentOfRevenue,
  };
}

export interface LaborPercentTrendPoint {
  month: string; // YYYY-MM
  laborPct: number; // 0 when that month had no revenue (guard div-by-zero, not a misleading spike)
}

// Monthly labor-cost-as-%-of-revenue for the dashboard trend chart (v3 spec
// §F19). Same cumulative-sample-then-delta approach as getJobCostTrend/
// getCashTrend, for the same reason: simple to reason about correct.
export async function getLaborPercentTrend(months: number = 6): Promise<LaborPercentTrendPoint[]> {
  const today = new Date();
  const cumulative: { month: string; labor: Decimal; revenue: Decimal }[] = [];

  for (let i = months; i >= 0; i--) {
    const boundary = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const dateArg = boundary.toISOString().slice(0, 10).replace(/-/g, "");
    const [labor, income] = await Promise.all([
      balance(["tag:costtype=labor", "type:x", `date:-${dateArg}`]),
      balance(["type:R", `date:-${dateArg}`]),
    ]);
    const monthLabel = new Date(today.getFullYear(), today.getMonth() - i, 1)
      .toISOString()
      .slice(0, 7);
    cumulative.push({ month: monthLabel, labor: labor.total, revenue: income.total.abs() });
  }

  return cumulative.map((point, i) => {
    const prior = i === 0 ? { labor: new Decimal(0), revenue: new Decimal(0) } : cumulative[i - 1];
    const laborDelta = point.labor.minus(prior.labor);
    const revenueDelta = point.revenue.minus(prior.revenue);
    const laborPct = revenueDelta.isZero() ? new Decimal(0) : laborDelta.dividedBy(revenueDelta).times(100);
    return { month: point.month, laborPct: laborPct.toNumber() };
  });
}
