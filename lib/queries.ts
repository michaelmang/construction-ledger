import Decimal from "decimal.js";
import { prisma } from "./db";
import { register, RegisterEntry } from "./hledger";

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

export async function getJobTransactions(jobCode: string): Promise<RegisterEntry[]> {
  const entries = await register([`tag:job=${jobCode}`]);
  return [...entries].reverse(); // most recent first
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
