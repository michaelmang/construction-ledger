import Link from "next/link";
import { inputClass, primaryButtonClass } from "@/components/form";
import { requestMagicLink } from "./actions";

// Also configured as auth.ts's pages.verifyRequest and pages.error, so
// Auth.js redirects both "check your email" (type=email) and any sign-in
// failure (error=<Type> — AccessDenied for "not on the allowlist",
// Configuration for a provider/env problem, etc.) back to this same page
// instead of its own unstyled built-in pages. `error` is whatever real
// AuthError subclass name @auth/core's request handler decided on — not
// something this app invents, so every value it can take is handled here,
// not just the one this app happens to trigger on purpose.
function errorMessage(error: string): string {
  if (error === "AccessDenied") {
    return "That email isn't on the invite list yet. Ask an admin to add you, then try again.";
  }
  return "Something went wrong sending the sign-in link. Try again in a moment.";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; type?: string; callbackUrl?: string }>;
}) {
  const { error, type, callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center">
        <Link href="/" className="text-sm font-semibold tracking-tight text-text">
          Construction Ledger
        </Link>

        {type === "email" ? (
          <>
            <h1 className="mt-6 text-lg font-medium text-text">Check your email</h1>
            <p className="mt-2 text-sm text-text-2">
              We sent a sign-in link. It expires in 24 hours and can only be used once.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-lg font-medium text-text">Sign in</h1>
            {error && (
              <p className="mt-2 rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">
                {errorMessage(error)}
              </p>
            )}
            <form action={requestMagicLink} className="mt-6 space-y-3 text-left">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/dashboard"} />
              <label className="block">
                <span className="text-sm font-medium text-text-2">Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <button type="submit" className={`w-full ${primaryButtonClass}`}>
                Send sign-in link
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
