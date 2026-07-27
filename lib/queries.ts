import Decimal from "decimal.js";
import { prisma } from "./db";
import { print } from "./hledger";
import { humanizeAccount } from "./accounts";

export async function listJobs() {
  return prisma.job.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getJob(id: number) {
  return prisma.job.findUnique({ where: { id } });
}

export async function listCostCodes() {
  return prisma.costCode.findMany({ orderBy: { code: "asc" } });
}

export async function listJobBudgets(jobId: number) {
  return prisma.jobBudget.findMany({
    where: { jobId },
    include: { costCode: true },
    orderBy: { costCode: { code: "asc" } },
  });
}

export async function listChangeOrders(jobId: number) {
  return prisma.changeOrder.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } });
}

export async function listBillings(jobId: number) {
  return prisma.progressBilling.findMany({
    where: { jobId },
    orderBy: { billingDate: "desc" },
  });
}

export async function listUnpaidBillings(jobId: number) {
  return prisma.progressBilling.findMany({
    where: { jobId, status: { in: ["unpaid", "partial"] } },
    orderBy: { billingDate: "asc" },
  });
}

export interface JobTransactionGroup {
  txnid: string | null;
  date: string;
  description: string;
  kind: string | null; // from JournalTxn, so the UI knows which edit/delete action applies
  postings: { account: string; humanizedAccount: string; amount: Decimal }[];
}

// One row per transaction (not per posting), so the Transactions tab can
// offer a single Edit/Delete action per entry (v2 spec §F11) instead of one
// per posting line. Extra hledger query terms (date range, cost code,
// vendor) narrow the result (v2 spec §F14).
export async function getJobTransactionsGrouped(
  jobCode: string,
  extraQueryTerms: string[] = [],
): Promise<JobTransactionGroup[]> {
  const entries = await print([`tag:job=${jobCode}`, ...extraQueryTerms]);
  const txnids = entries.map((e) => e.tags.txnid).filter((t): t is string => Boolean(t));
  const journalTxns = await prisma.journalTxn.findMany({ where: { txnid: { in: txnids } } });
  const kindByTxnid = new Map(journalTxns.map((t) => [t.txnid, t.kind]));

  const groups = entries.map((e) => ({
    txnid: e.tags.txnid ?? null,
    date: e.date,
    description: e.description,
    kind: e.tags.txnid ? (kindByTxnid.get(e.tags.txnid) ?? null) : null,
    postings: e.postings.map((p) => ({
      account: p.account,
      humanizedAccount: humanizeAccount(p.account),
      amount: p.amount,
    })),
  }));

  return groups.reverse(); // most recent first
}

export async function listVendors() {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}

export async function getVendor(id: number) {
  return prisma.vendor.findUnique({ where: { id } });
}

export interface VendorWithBalance {
  id: number;
  name: string;
  openBalance: Decimal;
}

export async function listVendorsWithBalances(): Promise<VendorWithBalance[]> {
  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: { bills: { where: { status: { in: ["open", "partial"] } } } },
  });
  return vendors.map((v) => ({
    id: v.id,
    name: v.name,
    openBalance: v.bills.reduce(
      (sum, b) => sum.plus(new Decimal(b.amount).minus(b.retainageWithheld).minus(b.paidAmount)),
      new Decimal(0),
    ),
  }));
}

export async function listBillsForVendor(vendorId: number) {
  return prisma.bill.findMany({
    where: { vendorId },
    include: { job: true, costCode: true, overheadCategory: true, payments: true },
    orderBy: { date: "desc" },
  });
}

export async function listOpenBills() {
  return prisma.bill.findMany({
    where: { status: { in: ["open", "partial"] } },
    include: { vendor: true, job: true, costCode: true, overheadCategory: true },
    orderBy: { date: "asc" },
  });
}

export async function listCashAccounts() {
  return prisma.cashAccount.findMany({ orderBy: { name: "asc" } });
}

export async function getDefaultCashAccount() {
  return prisma.cashAccount.findFirst({ where: { isDefault: true } });
}

export async function listOverheadCategories() {
  return prisma.overheadCategory.findMany({ orderBy: { code: "asc" } });
}

export async function listOverheadBills() {
  return prisma.bill.findMany({
    where: { overheadCategoryId: { not: null } },
    include: { vendor: true, overheadCategory: true },
    orderBy: { date: "desc" },
  });
}

export async function listEmployees() {
  return prisma.employee.findMany({ orderBy: { name: "asc" }, include: { wcCode: true } });
}

export async function listActiveEmployees() {
  return prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { wcCode: true },
  });
}

export async function getEmployee(id: number) {
  return prisma.employee.findUnique({ where: { id }, include: { wcCode: true } });
}

export async function getLaborEntry(txnid: string) {
  return prisma.laborEntry.findUnique({ where: { txnid }, include: { employee: true } });
}

// v5 spec (job costing) — the company-wide reference tables managed at
// /settings/labor-burden.
export async function getLaborBurdenSettings() {
  return prisma.laborBurdenSettings.findUnique({ where: { id: 1 } });
}

export async function listWorkersCompRates() {
  return prisma.workersCompRate.findMany({ orderBy: { description: "asc" } });
}

export async function listActiveWorkersCompRates() {
  return prisma.workersCompRate.findMany({
    where: { active: true },
    orderBy: { description: "asc" },
  });
}

export async function listPtoAccrualTiers() {
  return prisma.ptoAccrualTier.findMany({ orderBy: { minTenureYears: "asc" } });
}

// Bundles the three company-wide assumption sources into the plain-data
// shape lib/labor-burden.ts's computeLaborBurden expects — one place that
// assembles this so app/actions/labor.ts and the /job-costing reference
// page don't each reassemble it ad hoc. Falls back to
// LaborBurdenSettings's own Prisma-level defaults if the singleton row
// hasn't been created yet (shouldn't happen once seeded, but a fresh
// from-scratch database shouldn't hard-crash on a missing settings row).
// v5 spec (job costing): the shape lib/labor-burden.ts's computeLaborBurden
// needs client-side (the labor-entry form's live gross-vs-burdened
// preview), serialized to strings/ISO dates for the RSC boundary. Defined
// here (not in a UI file) so both app/(app)/jobs/[id]/transactions/
// expenses/new/ExpenseForm.tsx and its sibling labor edit form can import
// one shared type instead of each declaring their own.
export interface EmployeeOption {
  id: number;
  name: string;
  payType: "salary" | "hourly";
  startDate: string | null;
  createdAt: string;
  holidayDays: number | null;
  discretionaryPtoHours: string;
  currentPay: string;
  healthInsMonthly: string;
  retirementPct: string;
  yearlyVehicleValue: string;
  wcRate: string;
}

export function toEmployeeOption(
  employee: Awaited<ReturnType<typeof listActiveEmployees>>[number],
): EmployeeOption {
  return {
    id: employee.id,
    name: employee.name,
    payType: employee.payType as "salary" | "hourly",
    startDate: employee.startDate ? employee.startDate.toISOString().slice(0, 10) : null,
    createdAt: employee.createdAt.toISOString().slice(0, 10),
    holidayDays: employee.holidayDays,
    discretionaryPtoHours: employee.discretionaryPtoHours.toString(),
    currentPay: employee.currentPay.toString(),
    healthInsMonthly: employee.healthInsMonthly.toString(),
    retirementPct: employee.retirementPct.toString(),
    yearlyVehicleValue: employee.yearlyVehicleValue.toString(),
    wcRate: employee.wcCode?.rate.toString() ?? "0",
  };
}

export async function getCompanyAssumptions() {
  const [settings, tiers] = await Promise.all([getLaborBurdenSettings(), listPtoAccrualTiers()]);
  return {
    sickTimeAccrualPct: settings?.sickTimeAccrualPct.toString() ?? "0.033",
    companyHolidayDays: settings?.companyHolidayDays ?? 13,
    avgHoursPerYear: settings?.avgHoursPerYear.toString() ?? "2000",
    ficaPct: settings?.ficaPct.toString() ?? "0.0765",
    futaPct: settings?.futaPct.toString() ?? "0.006",
    stateUnemploymentPct: settings?.stateUnemploymentPct.toString() ?? "0.013",
    ptoTiers: tiers.map((t) => ({ minTenureYears: t.minTenureYears, accrualPct: t.accrualPct.toString() })),
  };
}
