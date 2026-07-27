"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { requireAdminRole } from "@/lib/authz";
import {
  updateLaborBurdenSettingsSchema,
  createWorkersCompRateSchema,
  updateWorkersCompRateSchema,
  setWorkersCompRateActiveSchema,
  upsertPtoAccrualTiersSchema,
  UpdateLaborBurdenSettingsInput,
  CreateWorkersCompRateInput,
  UpdateWorkersCompRateInput,
  SetWorkersCompRateActiveInput,
  UpsertPtoAccrualTiersInput,
} from "@/lib/validation";

const SETTINGS_PATH = "/settings/labor-burden";

// v5 spec (job costing): company-wide labor-burden assumptions, admin-only
// like Employee pay-rate data itself (V4-AUDIT-AND-SPEC.md Phase 1) — these
// feed lib/labor-burden.ts's computeLaborBurden for every employee.

export async function updateLaborBurdenSettings(
  input: UpdateLaborBurdenSettingsInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = updateLaborBurdenSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const settings = await prisma.laborBurdenSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    revalidatePath(SETTINGS_PATH);
    revalidatePath("/job-costing");
    return ok({ id: settings.id });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

export async function createWorkersCompRate(
  input: CreateWorkersCompRateInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = createWorkersCompRateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const rate = await prisma.workersCompRate.create({ data });
    revalidatePath(SETTINGS_PATH);
    revalidatePath("/job-costing");
    revalidatePath("/employees");
    return ok({ id: rate.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`WC code "${data.code}" already exists`);
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

export async function updateWorkersCompRate(
  input: UpdateWorkersCompRateInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = updateWorkersCompRateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const rate = await prisma.workersCompRate.update({
      where: { id: data.id },
      data: { code: data.code, description: data.description, rate: data.rate },
    });
    revalidatePath(SETTINGS_PATH);
    revalidatePath("/job-costing");
    revalidatePath("/employees");
    return ok({ id: rate.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`WC code "${data.code}" already exists`);
    if (e.code === "P2025") return fail("Workers' comp rate not found");
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

export async function setWorkersCompRateActive(
  input: SetWorkersCompRateActiveInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = setWorkersCompRateActiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const rate = await prisma.workersCompRate.update({
      where: { id: data.id },
      data: { active: data.active },
    });
    revalidatePath(SETTINGS_PATH);
    revalidatePath("/job-costing");
    return ok({ id: rate.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2025") return fail("Workers' comp rate not found");
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

// Tiers are edited as a cohesive small set, not row by row — the whole list
// is replaced in one transaction rather than diffed, since there are only
// ever a handful of tenure-year buckets (see lib/validation.ts's
// upsertPtoAccrualTiersSchema).
export async function updatePtoAccrualTiers(
  input: UpsertPtoAccrualTiersInput,
): Promise<ActionResult<{ count: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = upsertPtoAccrualTiersSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  const years = data.map((t) => t.minTenureYears);
  if (new Set(years).size !== years.length) {
    return fail("Tenure-year thresholds must be unique");
  }

  try {
    await prisma.$transaction([
      prisma.ptoAccrualTier.deleteMany(),
      prisma.ptoAccrualTier.createMany({ data }),
    ]);
    revalidatePath(SETTINGS_PATH);
    revalidatePath("/job-costing");
    return ok({ count: data.length });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}
