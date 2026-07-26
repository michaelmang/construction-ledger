"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { createChangeOrderSchema, isoDate, CreateChangeOrderInput } from "@/lib/validation";
import { requireWriteRole } from "@/lib/authz";
import { todayIso } from "@/lib/date-utc";

// Change orders are metadata-only (product spec §4/Phase 2): they feed the
// WIP calculation's revised contract value but don't move cash by
// themselves, so there is no journal entry here.

export async function createChangeOrder(
  input: CreateChangeOrderInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = createChangeOrderSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  const job = await prisma.job.findUnique({ where: { id: data.jobId } });
  if (!job) return fail(`Job ${data.jobId} not found`);

  const changeOrder = await prisma.changeOrder.create({
    data: {
      jobId: data.jobId,
      coNumber: data.coNumber,
      description: data.description,
      amount: data.amount,
      status: data.status,
      approvedDate: data.approvedDate ? new Date(data.approvedDate) : undefined,
    },
  });

  revalidatePath(`/jobs/${data.jobId}`);
  return ok({ id: changeOrder.id });
}

const setChangeOrderStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["pending", "approved", "rejected"]),
  approvedDate: isoDate.optional(),
});
type SetChangeOrderStatusInput = z.infer<typeof setChangeOrderStatusSchema>;

export async function setChangeOrderStatus(
  input: SetChangeOrderStatusInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const parsed = setChangeOrderStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  const existing = await prisma.changeOrder.findUnique({ where: { id: data.id } });
  if (!existing) return fail(`Change order ${data.id} not found`);

  const changeOrder = await prisma.changeOrder.update({
    where: { id: data.id },
    data: {
      status: data.status,
      approvedDate:
        data.status === "approved"
          ? new Date(data.approvedDate ?? todayIso())
          : existing.approvedDate,
    },
  });

  revalidatePath(`/jobs/${changeOrder.jobId}`);
  return ok({ id: changeOrder.id });
}
