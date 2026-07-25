// Role-based write authorization for Server Actions (the "use server"
// files in app/actions/), not lib/*.ts. That split matters: lib/*
// functions are also called directly by scripts/seed-demo.ts and the test
// suite, entirely outside any Next.js request — the SAME reason those
// callers already avoid next/cache's revalidatePath (see
// scripts/seed-demo.ts's own header comment). auth() reads cookies() under
// the hood, which throws outside a request scope exactly like
// revalidatePath does, so this must stay at the action-file boundary,
// not inside lib/transactions.ts or a Prisma Client extension.
import { auth } from "@/auth";
import { ActionResult, fail } from "./action-result";

const WRITE_ROLES = new Set(["admin", "bookkeeper"]);

// Call as the first line of every mutating Server Action, matching the
// existing `if (!parsed.success) return fail(...)` validation idiom
// already used throughout app/actions/ — returns null when the write may
// proceed, or an ActionResult to return immediately otherwise.
//
//   const denied = await requireWriteRole();
//   if (denied) return denied;
//
export async function requireWriteRole(): Promise<ActionResult<never> | null> {
  const session = await auth();
  if (!session?.user) return fail("Sign in required before making changes.");
  if (!WRITE_ROLES.has(session.user.role)) {
    return fail("Your account is read-only and can't make changes.");
  }
  return null;
}

// Employee pay-rate data and user/role management are admin-only per
// V4-AUDIT-AND-SPEC.md Phase 1 ("admin: settings, employees, deletes, user
// management").
export async function requireAdminRole(): Promise<ActionResult<never> | null> {
  const session = await auth();
  if (!session?.user) return fail("Sign in required before making changes.");
  if (session.user.role !== "admin") {
    return fail("Only admins can do this.");
  }
  return null;
}
