"use server";

import { signIn } from "@/auth";

// No try/catch here — verified directly against
// node_modules/next-auth/lib/actions.js: the Next.js signIn() wrapper never
// throws an AuthError back to caller code for a rejected sign-in (whether
// rejected by auth.ts's allowlist callback, a provider send failure, or
// anything else). It reads whatever redirect target @auth/core's request
// handler already decided on — pages.error ("/sign-in") with the real
// `?error=<Type>` query param on failure, pages.verifyRequest ("/sign-in")
// with `?type=email` on success — and calls Next's redirect() to it
// directly. An earlier version of this function wrapped the call in a
// try/catch that rewrote every AuthError to the literal string
// "AccessDenied", which was actively wrong: it never fired in testing (this
// code path doesn't throw AuthError to begin with), and had it fired for a
// different real error (e.g. Configuration, from a missing/invalid Resend
// key), it would have mislabeled it. Letting signIn() redirect on its own
// is both simpler and correct.
export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");
  await signIn("resend", { email, redirectTo: callbackUrl });
}
