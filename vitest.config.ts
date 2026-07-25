import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

// Vitest doesn't load `.env` automatically the way `next dev`/scripts that
// `import "dotenv/config"` do — without this, DATABASE_URL is undefined in
// the test process. That was silently masked under sqlite (lib/db.ts had a
// hardcoded `?? "file:./dev.db"` fallback); Postgres has no such fallback,
// so this is required now, not optional.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    env: loadEnv(mode, process.cwd(), ""),
    // Test files hit a single shared local Postgres instance (real network
    // round trips, unlike the old per-process sqlite file), and each file
    // spins up its own Prisma connection pool — running files in parallel
    // was intermittently exhausting the local instance's connection budget
    // under load, surfacing as sporadic unrelated-looking test failures.
    // These tests are I/O-bound, not CPU-bound, so serializing files costs
    // very little wall-clock time and removes the flakiness entirely.
    fileParallelism: false,
  },
}));
