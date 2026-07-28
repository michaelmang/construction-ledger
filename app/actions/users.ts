"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { requireAdminRole } from "@/lib/authz";
import { auth, signIn } from "@/auth";
import { inviteUserSchema, revokeUserSchema, InviteUserInput, RevokeUserInput } from "@/lib/validation";

// Invite-only allowlist (V4 spec Phase 1): adding an email here is what
// lets it sign in at all — see auth.ts's signIn callback. Upsert covers
// both "invite someone new" and "change an existing person's role" with
// one action; if they've already signed in (a User row exists), their
// live role is updated too, not just the invite record, so a role change
// takes effect on their very next request rather than their next sign-in.
//
// This is also the only place that actually sends the invite email: it's
// shared by InviteUserForm (brand-new emails) and UserRoleControl (role
// edits for people already on the allowlist), so the Resend magic link is
// only fired when the email wasn't already an AllowedUser row — otherwise
// every role tweak for an active teammate would re-send them a sign-in link.
export async function setUserRole(
  input: InviteUserInput,
): Promise<ActionResult<{ email: string; role: string }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  const alreadyInvited = await prisma.allowedUser.findUnique({ where: { email: data.email } });

  await prisma.allowedUser.upsert({
    where: { email: data.email },
    create: { email: data.email, role: data.role },
    update: { role: data.role },
  });
  await prisma.user.updateMany({ where: { email: data.email }, data: { role: data.role } });

  if (!alreadyInvited) {
    // redirect: false so this returns the destination URL instead of
    // throwing Next's redirect() — @auth/core's signin handler encodes
    // success/failure (a bad Resend key, etc.) into that URL's query
    // string rather than throwing, per requestMagicLink's comment above.
    const redirectUrl = await signIn("resend", {
      email: data.email,
      redirectTo: "/dashboard",
      redirect: false,
    });
    if (typeof redirectUrl === "string" && redirectUrl.includes("error=")) {
      await prisma.allowedUser.delete({ where: { email: data.email } }).catch(() => {});
      return fail("Couldn't send the invite email. Check the Resend configuration and try again.");
    }
  }

  revalidatePath("/users");
  return ok({ email: data.email, role: data.role });
}

// Removes the invite so the email can no longer sign in, and immediately
// invalidates any current session for that person (deleting the User row
// cascades to their Account/Session rows) rather than only blocking their
// next sign-in attempt.
export async function revokeUser(input: RevokeUserInput): Promise<ActionResult<{ email: string }>> {
  const denied = await requireAdminRole();
  if (denied) return denied;

  const parsed = revokeUserSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  const session = await auth();
  if (session?.user.email === data.email) {
    return fail("You can't revoke your own access.");
  }

  const remainingAdmins = await prisma.allowedUser.count({
    where: { role: "admin", email: { not: data.email } },
  });
  const target = await prisma.allowedUser.findUnique({ where: { email: data.email } });
  if (target?.role === "admin" && remainingAdmins === 0) {
    return fail("Can't remove the last admin — invite another admin first.");
  }

  await prisma.allowedUser.delete({ where: { email: data.email } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: data.email } });

  revalidatePath("/users");
  return ok({ email: data.email });
}
