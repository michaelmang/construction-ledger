// Bootstraps two signed-in browser sessions (admin + viewer) before the
// smoke suite runs, without sending a real magic-link email — there is no
// username/password form to automate (Auth.js Resend provider only), and
// a real email round-trip would make CI flaky and dependent on an
// external service. The actual Prisma work lives in e2e/create-sessions.ts,
// run here via `tsx` in a child process rather than imported directly —
// Playwright's own TS loader can't handle the generated Prisma client's
// ESM `import.meta` usage. Not a security bypass in the app itself
// (proxy.ts/authz.ts are unaware this exists) — just the same
// direct-Session-row technique proven out manually earlier in this
// project for testing without real email delivery.
import { execFileSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

export default function globalSetup(config: FullConfig): void {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000";
  execFileSync("npx", ["tsx", "e2e/create-sessions.ts"], {
    stdio: "inherit",
    env: { ...process.env, E2E_BASE_URL: baseURL },
  });
}
