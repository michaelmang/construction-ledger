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
function employeeWriteData(data: CreateEmployeeInput) {
  return {
    name: data.name,
    number: data.number,
    jobTitle: data.jobTitle,
    payType: data.payType,
    employmentType: data.employmentType,
    wcCodeId: data.wcCodeId,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    holidayDays: data.holidayDays,
    discretionaryPtoHours: data.discretionaryPtoHours ?? "0",
    currentPay: data.currentPay,
    healthInsMonthly: data.healthInsMonthly ?? "0",
    retirementPct: data.retirementPct ?? "0",
    yearlyVehicleValue: data.yearlyVehicleValue ?? "0",
  };
}

function employeeErrorMessage(err: unknown, name: string): string {
  const e = err as { code?: string; meta?: { target?: string[] } };
  if (e.code === "P2002") {
    const target = e.meta?.target?.[0];
    if (target === "number") return "That employee number is already in use";
    return `Employee "${name}" already exists`;
  }
  if (e.code === "P2025") return "Employee not found";
  return err instanceof Error ? err.message : "Unexpected database error";
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = createEmployeeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  try {
    const employee = await prisma.employee.create({ data: employeeWriteData(data) });
    revalidatePath("/employees");
    return ok({ id: employee.id });
  } catch (err) {
    return fail(employeeErrorMessage(err, data.name));
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
      data: employeeWriteData(data),
    });
    revalidatePath("/employees");
    return ok({ id: employee.id });
  } catch (err) {
    return fail(employeeErrorMessage(err, data.name));
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
