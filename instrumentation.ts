import { assertEnv } from "./lib/env-guard";

// Runs once per server instance before it accepts requests (stable since
// Next 15, no config flag needed here on 16). Validates required env vars
// are actually set — see lib/env-guard.ts for why this exists.
export function register() {
  assertEnv();
}
