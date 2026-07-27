// Boot-time and per-write safety checks for the Vercel deployment. Local
// dev (no VERCEL env var) and vitest are unaffected by everything here —
// both run against `prisma dev` / a local journal with no preview/prod
// distinction to protect against.

const REQUIRED_IN_VERCEL = ["DATABASE_URL", "JOURNAL_DIR"] as const;
const REQUIRED_IN_PRODUCTION = ["JOURNAL_GIT_REMOTE", "JOURNAL_GIT_TOKEN"] as const;

// Called once at server boot (see instrumentation.ts). Fails loud with a
// named, actionable error instead of letting requests 500 on a mysteriously
// blank env var — an env var that was added via `vercel env add` but ended
// up empty (confirmed to happen once during initial deploy) would have been
// caught here instead of diagnosed live via `vercel logs`.
export function assertEnv(): void {
  if (!process.env.VERCEL) return; // local dev / vitest

  const missing: string[] = REQUIRED_IN_VERCEL.filter((key) => !process.env[key]);
  if (process.env.VERCEL_ENV === "production") {
    missing.push(...REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]));
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty required environment variable(s): ${missing.join(", ")}. ` +
        `Set them in the Vercel project's Environment Variables before this ${
          process.env.VERCEL_ENV ?? "deployment"
        } can serve traffic.`,
    );
  }
}

// Preview deployments currently share Production's DATABASE_URL (see
// V4-AUDIT-AND-SPEC.md Phase 0, finding C2) — a write from a preview
// container would land in the real production database while its journal
// commit goes to that container's throwaway local clone (JOURNAL_GIT_REMOTE
// is Production-only today), silently diverging the two sources of truth
// forever. Block all writes on preview by default; a preview environment
// that's been given its own isolated database can opt back in explicitly.
export class PreviewWriteBlockedError extends Error {
  constructor() {
    super(
      "Writes are disabled on preview deployments because they currently share " +
        "the production database (see V4-AUDIT-AND-SPEC.md Phase 0, finding C2). " +
        "Set ALLOW_PREVIEW_WRITES=true for this preview environment only if it has " +
        "its own isolated database and journal remote.",
    );
    this.name = "PreviewWriteBlockedError";
  }
}

export function assertWritesAllowed(): void {
  if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_WRITES !== "true") {
    throw new PreviewWriteBlockedError();
  }
}
