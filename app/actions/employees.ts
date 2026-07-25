"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { requireAdminRole } from "@/lib/authz";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  setEmployeeActiveSchema,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  SetEmployeeActiveInput,
} from "@/lib/validation";

// Employee pay-rate data is admin-only (V4-AUDIT-AND-SPEC.md Phase 1) —
// bookkeepers can record labor hours against existing employees, but
// creating/editing/deactivating the underlying rate records is reserved
// for admins.
export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = createEmployeeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const employee = await prisma.employee.create({
      data: {
        name: data.name,
        baseRate: data.baseRate,
        payrollTaxPct: data.payrollTaxPct ?? "0",
        workersCompPct: data.workersCompPct ?? "0",
        benefitsPct: data.benefitsPct ?? "0",
      },
    });
    revalidatePath("/employees");
    return ok({ id: employee.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`Employee "${data.name}" already exists`);
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

// Rate edits only affect future labor entries — every LaborEntry snapshots
// the rates that were in effect when it was recorded (v3 spec §F19).
export async function updateEmployee(
  input: UpdateEmployeeInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = updateEmployeeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const employee = await prisma.employee.update({
      where: { id: data.id },
      data: {
        name: data.name,
        baseRate: data.baseRate,
        payrollTaxPct: data.payrollTaxPct ?? "0",
        workersCompPct: data.workersCompPct ?? "0",
        benefitsPct: data.benefitsPct ?? "0",
      },
    });
    revalidatePath("/employees");
    return ok({ id: employee.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return fail(`Employee "${data.name}" already exists`);
    if (e.code === "P2025") return fail("Employee not found");
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}

export async function setEmployeeActive(
  input: SetEmployeeActiveInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = setEmployeeActiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const employee = await prisma.employee.update({
      where: { id: data.id },
      data: { active: data.active },
    });
    revalidatePath("/employees");
    return ok({ id: employee.id });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2025") return fail("Employee not found");
    return fail(err instanceof Error ? err.message : "Unexpected database error");
  }
}
