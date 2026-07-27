import Decimal from "decimal.js";
import { prisma } from "./db";
import { balance, BalanceLine } from "./hledger";
import { COST_TYPES } from "./cost-types";
import { ReportFilterOptions } from "./report-filters";
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
import { addUtcDays, addUtcMonths, startOfUtcMonth, utcDaysBetween, utcMonthsBetween, toIsoDate } from "./date-utc";

function toDecimal(value: unknown): Decimal {
  return new Decimal(value === null || value === undefined ? 0 : String(value));
}

// "As of" a date (v6 spec: report filters) means only transactions on/before
// that date count. hledger's `date:-DATE` upper bound is exclusive, so the
// boundary is the day after — same convention getJobCostTrend/getCashTrend
// already use below. `toHledgerDateArg`/`addUtcDays` are hoisted (function
// declaration / top-level import), safe to call from here despite being
// defined further down the file.
function asOfQueryTerm(asOf?: Date): string[] {
  return asOf ? [`date:-${toHledgerDateArg(addUtcDays(asOf, 1))}`] : [];
}

async function costsToDateLines(
  jobCode: string,
  opts: Pick<ReportFilterOptions, "asOf" | "costTypes"> = {},
): Promise<{ total: Decimal; lines: BalanceLine[] }> {
  const dateTerm = asOfQueryTerm(opts.asOf);
  if (!opts.costTypes || opts.costTypes.length === 0) {
    const { lines, total } = await balance([`tag:job=${jobCode}`, "type:x", ...dateTerm]);
    return { total, lines };
  }
  // Cost-type filter: sum only the selected types, one balance() call per
  // type (same approach costTypeAmountsForJob already uses below) — never
  // silently include untyped/other-type costs.
  const perType = await Promise.all(
    opts.costTypes.map((t) =>
      balance([`tag:job=${jobCode}`, `tag:costtype=${t}`, "type:x", ...dateTerm]),
    ),
  );
  return {
    total: perType.reduce((sum, r) => sum.plus(r.total), new Decimal(0)),
    lines: perType.flatMap((r) => r.lines),
  };
}

// Accumulates rather than overwrites — costsToDateLines can merge several
// per-cost-type balance() calls when a cost-type filter is active, so the
// same cost-code account can legitimately appear more than once in `lines`.
function costByCostCode(jobCode: string, lines: BalanceLine[]): Map<string, Decimal> {
  const prefix = `expenses:jobs:${jobCode}:`;
  const map = new Map<string, Decimal>();
  for (const line of lines) {
    if (line.account.startsWith(prefix)) {
      const code = line.account.slice(prefix.length);
      map.set(code, (map.get(code) ?? new Decimal(0)).plus(line.amount));
    }
  }
  return map;
}

// `asOf` omitted preserves exact prior behavior (sums every billing
// regardless of date). When set, a null billingDate row is excluded — an
// undated billing can't be placed on one side of an "as of" cutoff.
export async function billedToDate(jobId: number, asOf?: Date): Promise<Decimal> {
  const agg = await prisma.progressBilling.aggregate({
    where: { jobId, ...(asOf ? { billingDate: { lte: asOf } } : {}) },
    _sum: { amountBilled: true },
  });
  return toDecimal(agg._sum.amountBilled);
}

export async function approvedChangeOrdersTotal(jobId: number, asOf?: Date): Promise<Decimal> {
  const agg = await prisma.changeOrder.aggregate({
    where: { jobId, status: "approved", ...(asOf ? { approvedDate: { lte: asOf } } : {}) },
    _sum: { amount: true },
  });
  return toDecimal(agg._sum.amount);
}

// Contract value + approved change orders. Used both by the WIP schedule and
// by the over-billing warning check in app/actions/billings.ts (which never
// passes asOf, so its behavior is unchanged).
export async function getRevisedContractValue(jobId: number, asOf?: Date): Promise<Decimal> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  return toDecimal(job.contractValue).plus(await approvedChangeOrdersTotal(jobId, asOf));
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

async function latestCfoPctCompleteEstimate(jobId: number, asOf?: Date): Promise<Decimal | null> {
  const latest = await prisma.progressBilling.findFirst({
    where: {
      jobId,
      pctCompleteEstimate: { not: null },
      ...(asOf ? { billingDate: { lte: asOf } } : {}),
    },
    orderBy: { billingDate: "desc" },
  });
  return latest?.pctCompleteEstimate ? toDecimal(latest.pctCompleteEstimate) : null;
}

// `opts` (v6 spec: report filters) is optional everywhere below and
// defaults preserve exact prior behavior — `estimatedTotalCost` never
// varies with `opts` since JobBudget rows aren't dated or cost-type-scoped
// (there's no "budget as of a past date" or "budget for just Labor" to
// reconstruct); only costsToDate/billedToDate/earnedRevenue move.
export async function getWipSchedule(
  jobId: number,
  opts: ReportFilterOptions = {},
): Promise<JobWipReport> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const { total: costsToDate, lines } = await costsToDateLines(job.code, opts);
  const budgets = await jobBudgetsWithActuals(job.id, job.code, lines);
  const estimatedTotalCost = computeEstimatedTotalCost(budgets);

  const wip = computeWipSchedule({
    contractValue: toDecimal(job.contractValue),
    approvedChangeOrdersTotal: await approvedChangeOrdersTotal(job.id, opts.asOf),
    costsToDate,
    estimatedTotalCost,
    billedToDate: await billedToDate(job.id, opts.asOf),
  });

  return {
    jobId: job.id,
    jobCode: job.code,
    jobName: job.name,
    wip,
    cfoPctCompleteEstimate: await latestCfoPctCompleteEstimate(job.id, opts.asOf),
  };
}

// Defaults to active-only for the dashboard; report pages pass
// ["active", "complete"] so closed jobs stay reviewable without cluttering
// the dashboard (v2 spec §F12). `opts.jobId` narrows to one job (v6 spec).
export async function getWipScheduleForActiveJobs(
  statuses: string[] = ["active"],
  opts: ReportFilterOptions = {},
): Promise<JobWipReport[]> {
  const jobs = await prisma.job.findMany({
    where: { status: { in: statuses }, ...(opts.jobId ? { id: opts.jobId } : {}) },
  });
  return Promise.all(jobs.map((j) => getWipSchedule(j.id, opts)));
}

export interface JobProfitabilityReport extends JobWipReport {
  profitability: JobProfitabilityResult;
}

export async function getJobProfitability(
  jobId: number,
  opts: ReportFilterOptions = {},
): Promise<JobProfitabilityReport> {
  const report = await getWipSchedule(jobId, opts);
  const profitability = computeJobProfitability(report.wip);
  return { ...report, profitability };
}

export async function getProfitabilityForActiveJobs(
  statuses: string[] = ["active"],
  opts: ReportFilterOptions = {},
): Promise<JobProfitabilityReport[]> {
  const jobs = await prisma.job.findMany({
    where: { status: { in: statuses }, ...(opts.jobId ? { id: opts.jobId } : {}) },
  });
  return Promise.all(jobs.map((j) => getJobProfitability(j.id, opts)));
}

export async function getRetainageAgingForActiveJobs(
  asOf: Date = new Date(),
  statuses: string[] = ["active"],
  jobId?: number,
): Promise<RetainageAgingReport[]> {
  const jobs = await prisma.job.findMany({
    where: { status: { in: statuses }, ...(jobId ? { id: jobId } : {}) },
  });
  return Promise.all(jobs.map((j) => getRetainageAging(j.id, asOf)));
}

export async function getCostCodeBreakdown(
  jobId: number,
  opts: ReportFilterOptions = {},
): Promise<CostCodeBreakdownRow[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const { lines } = await costsToDateLines(job.code, opts);
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
async function costTypeAmountsForJob(jobCode: string, asOf?: Date): Promise<CostTypeAccountAmount[]> {
  const dateTerm = asOfQueryTerm(asOf);
  const perType = await Promise.all(
    COST_TYPES.map(async (t) => ({
      type: t,
      lines: (await balance([`tag:job=${jobCode}`, `tag:costtype=${t}`, "type:x", ...dateTerm])).lines,
    })),
  );
  const untyped = await balance([`tag:job=${jobCode}`, "not:tag:costtype", "type:x", ...dateTerm]);

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
export async function getCostTypePivotForJob(jobId: number, asOf?: Date): Promise<CostTypePivotRow[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const budgets = await prisma.jobBudget.findMany({ where: { jobId }, include: { costCode: true } });
  const raw = await costTypeAmountsForJob(job.code, asOf);

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
  opts: Pick<ReportFilterOptions, "asOf" | "jobId"> = {},
): Promise<JobCostTypePivotRow[]> {
  const jobs = await prisma.job.findMany({
    where: { status: { in: statuses }, ...(opts.jobId ? { id: opts.jobId } : {}) },
  });
  const jobByCode = new Map(jobs.map((j) => [j.code, j]));
  const jobAccountRe = /^expenses:jobs:([^:]+):/;
  const dateTerm = asOfQueryTerm(opts.asOf);

  const perType = await Promise.all(
    COST_TYPES.map(async (t) => ({
      type: t,
      lines: (await balance([`tag:costtype=${t}`, "type:x", ...dateTerm])).lines,
    })),
  );
  const untyped = await balance(["not:tag:costtype", "type:x", ...dateTerm]);

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

// v3 spec (Vercel migration) Phase 5: date-range drill-down for trend
// charts. `{ from, to }` are optional on all three trend functions; when
// omitted each keeps its historical today-relative default so existing
// callers (tests, any code not yet wired to a UI range control) see
// unchanged behavior.
export interface TrendRangeOptions {
  from?: Date;
  to?: Date;
}

// Hard ceiling on sample points per trend chart. One hledger `balance`
// process spawn per point is fine at dashboard scale, but nothing bounds how
// wide a custom range a user can type into DateRangeControl — without this a
// multi-year range would spawn hundreds of processes on one page render.
// Beyond the ceiling the sampling interval widens (coarsens) instead of
// rejecting the range or silently truncating it.
const MAX_TREND_POINTS = 52;

// Concurrent hledger process spawns per trend chart. Unbounded Promise.all
// across 50+ sample points is its own failure mode on a small serverless
// function instance; sequential (`for`-`await`, the prior approach) was
// correct but slow. A small worker pool bounds both.
const TREND_CONCURRENCY = 8;

async function mapBounded<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// Local aliases kept for call-site brevity below; all boundary math lives
// in lib/date-utc.ts (V4 spec Phase 3: "date convention is mixed" — see
// that module's header). startOfMonth here always resets to the 1st,
// unlike date-utc's day-preserving addUtcMonths, so month-bucket call
// sites compose startOfMonth(addMonths(...)) rather than calling a
// separate day-resetting variant.
const addDays = addUtcDays;
const addMonths = addUtcMonths;
const startOfMonth = startOfUtcMonth;
const daysBetween = utcDaysBetween;
const monthsBetween = utcMonthsBetween;

function toHledgerDateArg(d: Date): string {
  return toIsoDate(d).replace(/-/g, "");
}

// Weekly natural cadence (getCashTrend's granularity), coarsening beyond
// MAX_TREND_POINTS. Returns count+1 sample dates from `from` through `to`
// inclusive.
function weeklySampleDates(from: Date, to: Date): Date[] {
  const totalDays = Math.max(daysBetween(from, to), 1);
  const count = Math.min(Math.max(Math.ceil(totalDays / 7), 1), MAX_TREND_POINTS);
  const stepDays = totalDays / count;
  return Array.from({ length: count + 1 }, (_, i) => addDays(from, Math.round(i * stepDays)));
}

interface MonthTrendPeriod {
  label: Date; // first-of-month label for this bucket
  boundary: Date; // exclusive upper bound for the cumulative `balance` query
}

// Monthly natural cadence (getJobCostTrend/getLaborPercentTrend's
// granularity), coarsening beyond MAX_TREND_POINTS the same way
// weeklySampleDates does. `boundary` is always one bucket-width past
// `label`. The final boundary is capped at the requested end date (inclusive),
// so a range ending mid-month never leaks later transactions into its last
// bucket.
function monthTrendPeriods(from: Date, to: Date): MonthTrendPeriod[] {
  const start = startOfMonth(from);
  const end = startOfMonth(to);
  const totalMonths = Math.max(monthsBetween(start, end), 0) + 1;
  const stepMonths = Math.max(Math.ceil(totalMonths / MAX_TREND_POINTS), 1);
  const pointCount = Math.ceil(totalMonths / stepMonths);

  return Array.from({ length: pointCount }, (_, k) => ({
    label: addMonths(start, k * stepMonths),
    boundary: (() => {
      const naturalBoundary = addMonths(start, (k + 1) * stepMonths);
      const inclusiveEnd = addDays(to, 1);
      return naturalBoundary < inclusiveEnd ? naturalBoundary : inclusiveEnd;
    })(),
  }));
}

export interface MonthlyCostPoint {
  month: string; // YYYY-MM
  costs: number; // costs incurred that bucket, not cumulative
}

// Per-month cost totals for a job's overview chart (v2 spec §4.4). Samples
// cumulative costs-to-date at each month boundary and takes deltas, same
// as-of-date approach as getCashTrend for the same reason: simple to reason
// about correct.
export async function getJobCostTrend(
  jobId: number,
  opts: TrendRangeOptions = {},
): Promise<MonthlyCostPoint[]> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const to = opts.to ?? new Date();
  const from = opts.from ?? addMonths(to, -6);
  const periods = monthTrendPeriods(from, to);

  const [beforeRange, cumulative] = await Promise.all([
    balance([`tag:job=${job.code}`, "type:x", `date:-${toHledgerDateArg(from)}`]),
    mapBounded(periods, TREND_CONCURRENCY, async ({ boundary }) => {
      const { total } = await balance([`tag:job=${job.code}`, "type:x", `date:-${toHledgerDateArg(boundary)}`]);
      return total;
    }),
  ]);

  return periods.map((p, i) => ({
    month: p.label.toISOString().slice(0, 7),
    costs: (i === 0 ? cumulative[0].minus(beforeRange.total) : cumulative[i].minus(cumulative[i - 1])).toNumber(),
  }));
}

export interface CashTrendPoint {
  date: string; // YYYY-MM-DD
  netCash: number;
}

// Weekly net-cash snapshots for the dashboard trend chart (v2 spec §F15).
// Samples `hledger balance` as-of each week boundary rather than relying on
// register()'s running-total semantics, so it's simple to reason about
// correct.
export async function getCashTrend(opts: TrendRangeOptions = {}): Promise<CashTrendPoint[]> {
  const to = opts.to ?? new Date();
  const from = opts.from ?? addDays(to, -8 * 7);
  const dates = weeklySampleDates(from, to);

  const totals = await mapBounded(dates, TREND_CONCURRENCY, async (asOf) => {
    // hledger's `date:-DATE` end boundary is exclusive, so query the day
    // after to include everything dated on `asOf` itself.
    const { total } = await balance(["type:AL", `date:-${toHledgerDateArg(addDays(asOf, 1))}`]);
    return total;
  });

  return dates.map((d, i) => ({ date: d.toISOString().slice(0, 10), netCash: totals[i].toNumber() }));
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
  jobId?: number,
): Promise<JobArAgingReport[]> {
  const jobs = await prisma.job.findMany({
    where: { status: { in: statuses }, ...(jobId ? { id: jobId } : {}) },
  });
  return Promise.all(jobs.map((j) => getArAging(j.id, asOf)));
}

// Whole-business AP aging: what's still owed on every open/partial bill
// (job-cost and overhead alike), net of retainage withheld and payments made
// (v2 spec §F6). `jobId` (v6 spec: report filters) narrows to one job's
// bills — overhead bills (jobId: null) drop out of a job-filtered view,
// since they aren't tied to any job by definition.
export async function getApAging(asOf: Date = new Date(), jobId?: number): Promise<ApAgingRow[]> {
  const bills = await prisma.bill.findMany({
    where: { status: { in: ["open", "partial"] }, ...(jobId ? { jobId } : {}) },
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

  const perJob = await Promise.all(
    jobs.map(async (job) => {
      const rows = await getCostCodeBreakdown(job.id);
      return rows
        .filter((row) => row.remaining.isNegative() && !row.estimatedAtCompletion.isZero())
        .map((row) => ({
          jobId: job.id,
          jobCode: job.code,
          jobName: job.name,
          costCode: row.costCode,
          costCodeName: row.costCodeName,
          utilizationPct: row.actual.dividedBy(row.estimatedAtCompletion).times(100),
        }));
    }),
  );

  return perJob.flat();
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
export async function getLaborPercentTrend(
  opts: TrendRangeOptions = {},
): Promise<LaborPercentTrendPoint[]> {
  const to = opts.to ?? new Date();
  const from = opts.from ?? addMonths(to, -6);
  const periods = monthTrendPeriods(from, to);

  const [beforeRange, cumulative] = await Promise.all([
    Promise.all([
      balance(["tag:costtype=labor", "type:x", `date:-${toHledgerDateArg(from)}`]),
      balance(["type:R", `date:-${toHledgerDateArg(from)}`]),
    ]),
    mapBounded(periods, TREND_CONCURRENCY, async ({ boundary }) => {
      const dateArg = toHledgerDateArg(boundary);
      const [labor, income] = await Promise.all([
        balance(["tag:costtype=labor", "type:x", `date:-${dateArg}`]),
        balance(["type:R", `date:-${dateArg}`]),
      ]);
      return { labor: labor.total, revenue: income.total.abs() };
    }),
  ]);

  return periods.map((p, i) => {
    const prior = i === 0
      ? { labor: beforeRange[0].total, revenue: beforeRange[1].total.abs() }
      : cumulative[i - 1];
    const laborDelta = cumulative[i].labor.minus(prior.labor);
    const revenueDelta = cumulative[i].revenue.minus(prior.revenue);
    const laborPct = revenueDelta.isZero() ? new Decimal(0) : laborDelta.dividedBy(revenueDelta).times(100);
    return { month: p.label.toISOString().slice(0, 7), laborPct: laborPct.toNumber() };
  });
}
