"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import {
  createJobSchema,
  createCostCodeSchema,
  setBudgetSchema,
  setJobStatusSchema,
  CreateJobInput,
  CreateCostCodeInput,
  SetBudgetInput,
  SetJobStatusInput,
} from "@/lib/validation";

export async function createJob(input: CreateJobInput): Promise<ActionResult<{ id: number }>> {
  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  try {
    const job = await prisma.job.create({
      data: {
        code: data.code,
        name: data.name,
        clientName: data.clientName,
        contractValue: data.contractValue,
        retainagePct: data.retainagePct,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : undefined,
        notes: data.notes,
      },
    });
    revalidatePath("/jobs");
    return ok({ id: job.id });
  } catch (err) {
    return fail(prismaErrorMessage(err, `Job code "${data.code}" is already in use`));
  }
}

export async function createCostCode(
  input: CreateCostCodeInput,
): Promise<ActionResult<{ id: number }>> {
  const parsed = createCostCodeSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  try {
    const costCode = await prisma.costCode.create({ data });
    revalidatePath("/cost-codes");
    return ok({ id: costCode.id });
  } catch (err) {
    return fail(prismaErrorMessage(err, `Cost code "${data.code}" is already in use`));
  }
}

export async function setBudget(input: SetBudgetInput): Promise<ActionResult<{ jobId: number; costCodeId: number }>> {
  const parsed = setBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  const job = await prisma.job.findUnique({ where: { id: data.jobId } });
  if (!job) return fail(`Job ${data.jobId} not found`);
  const costCode = await prisma.costCode.findUnique({ where: { id: data.costCodeId } });
  if (!costCode) return fail(`Cost code ${data.costCodeId} not found`);

  await prisma.jobBudget.upsert({
    where: { jobId_costCodeId: { jobId: data.jobId, costCodeId: data.costCodeId } },
    create: {
      jobId: data.jobId,
      costCodeId: data.costCodeId,
      budgetedAmount: data.budgetedAmount,
      revisedEstimate: data.revisedEstimate ?? undefined,
    },
    update: {
      budgetedAmount: data.budgetedAmount,
      ...(data.revisedEstimate !== undefined ? { revisedEstimate: data.revisedEstimate } : {}),
    },
  });

  revalidatePath(`/jobs/${data.jobId}`);
  return ok({ jobId: data.jobId, costCodeId: data.costCodeId });
}

export async function setJobStatus(
  input: SetJobStatusInput,
): Promise<ActionResult<{ jobId: number; status: string }>> {
  const parsed = setJobStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  const job = await prisma.job.findUnique({ where: { id: data.jobId } });
  if (!job) return fail(`Job ${data.jobId} not found`);

  await prisma.job.update({ where: { id: data.jobId }, data: { status: data.status } });

  revalidatePath(`/jobs/${data.jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return ok({ jobId: data.jobId, status: data.status });
}

function prismaErrorMessage(err: unknown, uniqueConstraintMessage: string): string {
  const e = err as { code?: string };
  if (e.code === "P2002") return uniqueConstraintMessage;
  return err instanceof Error ? err.message : "Unexpected database error";
}
