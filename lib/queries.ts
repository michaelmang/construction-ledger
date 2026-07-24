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
