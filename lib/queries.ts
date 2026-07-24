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
