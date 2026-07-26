"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/authz";
import { ActionResult, ok } from "@/lib/action-result";
import { repairLedger, RepairResult } from "@/lib/ledger-doctor";

export async function runLedgerRepair(): Promise<ActionResult<RepairResult>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const result = await repairLedger();
  revalidatePath("/ledger-doctor");
  return ok(result);
}
