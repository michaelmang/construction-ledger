// Vercel's serverless runtime has no pre-installed hledger binary, and
// neither does a GitHub Actions runner. This downloads the official
// prebuilt Linux binary at build time and vendors it into bin/hledger/ so
// next.config.ts's outputFileTracingIncludes can ship it with the deployed
// function (Vercel) or so CI can just run it directly off disk. lib/hledger.ts
// picks this path over a bare PATH lookup only when process.env.VERCEL or
// process.env.CI is set — local dev keeps using Homebrew's hledger unchanged.
//
// Version is pinned deliberately, not "latest" — a version bump in a
// trusted accounting engine should be a tested, reviewed action, never a
// silent side effect of the next build. Verified locally before pinning:
// the linux-x64 release asset is a statically linked ELF binary (no glibc
// dynamic-link risk on Vercel's runtime image), ~68MB uncompressed, well
// under Vercel's 250MB function size limit.
//
// Usage: npx tsx scripts/fetch-hledger.ts (no-ops outside Vercel's build)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, chmod, access } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const HLEDGER_VERSION = "1.52.1";
const RELEASE_URL = `https://github.com/simonmichael/hledger/releases/download/${HLEDGER_VERSION}/hledger-linux-x64.tar.gz`;
const BIN_DIR = path.join(process.cwd(), "bin", "hledger");
const BIN_PATH = path.join(BIN_DIR, "hledger");

async function main() {
  if (!process.env.VERCEL && !process.env.CI) {
    console.log("Not Vercel or CI — skipping hledger binary fetch (using system hledger).");
    return;
  }

  try {
    await access(BIN_PATH);
    console.log(`hledger binary already present at ${BIN_PATH}, skipping fetch.`);
    return;
  } catch {
    // not present yet, continue
  }

  console.log(`Fetching hledger ${HLEDGER_VERSION} for linux-x64...`);
  await rm(BIN_DIR, { recursive: true, force: true });
  await mkdir(BIN_DIR, { recursive: true });

  const tarballPath = path.join(BIN_DIR, "hledger-linux-x64.tar.gz");
  await execFileAsync("curl", ["-sL", "-o", tarballPath, RELEASE_URL]);

  // Extract only the `hledger` binary (not hledger-ui/hledger-web, unused).
  await execFileAsync("tar", ["-xzf", tarballPath, "-C", BIN_DIR, "hledger"]);
  await rm(tarballPath);
  await chmod(BIN_PATH, 0o755);

  console.log(`hledger binary ready at ${BIN_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
