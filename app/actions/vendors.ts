"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { createVendorSchema, CreateVendorInput } from "@/lib/validation";

export async function createVendor(
  input: CreateVendorInput,
): Promise<ActionResult<{ id: number }>> {
  const parsed = createVendorSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const vendor = await prisma.vendor.create({ data: { name: data.name } });
    revalidatePath("/vendors");
    return ok({ id: vendor.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`Vendor "${data.name}" already exists`);
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}
