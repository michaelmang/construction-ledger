import { defineConfig, devices } from "@playwright/test";

// V4 spec Phase 3: "Playwright smoke suite in CI ... run against a local
// prod build with seeded data." webServer builds+starts a real prod server
// itself (both locally and in CI, see .github/workflows/ci.yml) so there's
// one code path either way; if a server is already running on :3000
// (reuseExistingServer, non-CI only), it's reused instead — so
// `npm run dev` + `npm run e2e` also works for iterating on a spec without
// waiting on a full build each time.
//
// workers: 1 / fullyParallel: false — every spec shares the same seeded
// demo data (job "Miller Kitchen Remodel" etc., see scripts/seed-demo.ts);
// running them concurrently would race each other's writes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // "github" alone only emits inline annotations — it never writes an HTML
  // report, so .github/workflows/ci.yml's upload-artifact step (targeting
  // playwright-report/) had nothing to upload on failure. Pairing it with
  // "html" (never auto-opened, matching CI's non-interactive context) gives
  // a real report with screenshots/traces to download next time this fails.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Default per-test timeout, well above Playwright's 30s default — a
  // shared GitHub Actions runner is measurably slower than local dev for
  // the isomorphic-git commits several specs wait on after a mutation, and
  // expense-lifecycle.spec.ts's delete step alone now waits up to 60s
  // (evidence: a real failure's page snapshot showed it still mid-flight
  // at 30s), so the whole-test budget has to comfortably exceed that.
  timeout: 90_000,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
