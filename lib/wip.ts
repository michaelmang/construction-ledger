import Decimal from "decimal.js";

// All functions here are pure (inputs in, numbers out, no I/O) so the WIP
// math is testable without hledger or Prisma. Server-side callers assemble
// the inputs from Prisma + lib/hledger.ts (see lib/reports.ts).

export interface WipScheduleInput {
  contractValue: Decimal;
  approvedChangeOrdersTotal: Decimal;
  costsToDate: Decimal;
  estimatedTotalCost: Decimal;
  billedToDate: Decimal;
}

export interface WipScheduleResult {
  revisedContractValue: Decimal;
  costsToDate: Decimal;
  estimatedTotalCost: Decimal;
  pctComplete: Decimal; // cost-basis: costsToDate / estimatedTotalCost (product spec §5.1/§9)
  earnedRevenue: Decimal;
  billedToDate: Decimal;
  overUnderBilling: Decimal; // billedToDate - earnedRevenue; positive = overbilled
}

export function computeWipSchedule(input: WipScheduleInput): WipScheduleResult {
  const revisedContractValue = input.contractValue.plus(input.approvedChangeOrdersTotal);
  const pctComplete = input.estimatedTotalCost.isZero()
    ? new Decimal(0)
    : input.costsToDate.dividedBy(input.estimatedTotalCost);
  const earnedRevenue = pctComplete.times(revisedContractValue);
  const overUnderBilling = input.billedToDate.minus(earnedRevenue);

  return {
    revisedContractValue,
    costsToDate: input.costsToDate,
    estimatedTotalCost: input.estimatedTotalCost,
    pctComplete,
    earnedRevenue,
    billedToDate: input.billedToDate,
    overUnderBilling,
  };
}

export interface JobProfitabilityResult {
  projectedMargin: Decimal; // revisedContractValue - estimatedTotalCost
  actualMarginToDate: Decimal; // earnedRevenue - costsToDate
}

export function computeJobProfitability(
  wip: Pick<
    WipScheduleResult,
    "revisedContractValue" | "estimatedTotalCost" | "earnedRevenue" | "costsToDate"
  >,
): JobProfitabilityResult {
  return {
    projectedMargin: wip.revisedContractValue.minus(wip.estimatedTotalCost),
    actualMarginToDate: wip.earnedRevenue.minus(wip.costsToDate),
  };
}

export interface CostCodeBudgetInput {
  costCodeId: number;
  costCode: string;
  costCodeName: string;
  budgetedAmount: Decimal;
  revisedEstimate: Decimal | null; // CFO's estimate-at-completion override for this code
  actual: Decimal;
}

export interface CostCodeBreakdownRow {
  costCodeId: number;
  costCode: string;
  costCodeName: string;
  budgeted: Decimal;
  estimatedAtCompletion: Decimal; // revisedEstimate ?? budgeted
  actual: Decimal;
  remaining: Decimal; // estimatedAtCompletion - actual; negative means over budget
}

export function computeCostCodeBreakdown(
  budgets: CostCodeBudgetInput[],
): CostCodeBreakdownRow[] {
  return budgets.map((b) => {
    const estimatedAtCompletion = b.revisedEstimate ?? b.budgetedAmount;
    return {
      costCodeId: b.costCodeId,
      costCode: b.costCode,
      costCodeName: b.costCodeName,
      budgeted: b.budgetedAmount,
      estimatedAtCompletion,
      actual: b.actual,
      remaining: estimatedAtCompletion.minus(b.actual),
    };
  });
}

// Job-level "estimated total cost" for the WIP schedule: sum of each cost
// code's estimate-at-completion (its revised estimate if the CFO has entered
// one, else the original budget).
export function computeEstimatedTotalCost(
  budgets: { budgetedAmount: Decimal; revisedEstimate: Decimal | null }[],
): Decimal {
  return budgets.reduce(
    (sum, b) => sum.plus(b.revisedEstimate ?? b.budgetedAmount),
    new Decimal(0),
  );
}

export interface RetainageAgingBillingInput {
  billingDate: Date;
  periodLabel: string | null;
  retainageWithheld: Decimal;
}

export interface RetainageAgingRow extends RetainageAgingBillingInput {
  daysOutstanding: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function computeRetainageAging(
  billings: RetainageAgingBillingInput[],
  asOf: Date,
): RetainageAgingRow[] {
  return billings.map((b) => ({
    ...b,
    daysOutstanding: Math.max(
      0,
      Math.floor((asOf.getTime() - b.billingDate.getTime()) / MS_PER_DAY),
    ),
  }));
}

function daysOutstanding(since: Date, asOf: Date): number {
  return Math.max(0, Math.floor((asOf.getTime() - since.getTime()) / MS_PER_DAY));
}

export interface ArAgingInput {
  billingId: number;
  periodLabel: string | null;
  billingDate: Date;
  netBilled: Decimal; // amountBilled - retainageWithheld
  paidAmount: Decimal;
}

export interface ArAgingRow {
  billingId: number;
  periodLabel: string | null;
  billingDate: Date;
  amountDue: Decimal;
  daysOutstanding: number;
}

// Only billings with a nonzero balance appear — a fully paid pay app isn't
// "aging" (v2 spec §F10).
export function computeArAging(billings: ArAgingInput[], asOf: Date): ArAgingRow[] {
  return billings
    .map((b) => ({
      billingId: b.billingId,
      periodLabel: b.periodLabel,
      billingDate: b.billingDate,
      amountDue: b.netBilled.minus(b.paidAmount),
      daysOutstanding: daysOutstanding(b.billingDate, asOf),
    }))
    .filter((r) => !r.amountDue.isZero());
}

export interface ApAgingInput {
  billId: number;
  vendorName: string;
  description: string | null;
  billDate: Date;
  amount: Decimal;
  retainageWithheld: Decimal;
  paidAmount: Decimal;
}

export interface ApAgingRow {
  billId: number;
  vendorName: string;
  description: string | null;
  billDate: Date;
  amountDue: Decimal;
  daysOutstanding: number;
}

export function computeApAging(bills: ApAgingInput[], asOf: Date): ApAgingRow[] {
  return bills
    .map((b) => ({
      billId: b.billId,
      vendorName: b.vendorName,
      description: b.description,
      billDate: b.billDate,
      amountDue: b.amount.minus(b.retainageWithheld).minus(b.paidAmount),
      daysOutstanding: daysOutstanding(b.billDate, asOf),
    }))
    .filter((r) => !r.amountDue.isZero());
}
