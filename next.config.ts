import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The home directory (a few levels up) has its own package-lock.json from
  // unrelated projects, which confuses Turbopack's workspace-root inference.
  // Pin it explicitly to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // scripts/fetch-hledger.ts vendors the hledger binary into bin/hledger/ at
  // Vercel build time. It's invoked via execFile, not import/require, so
  // Next's automatic file tracing can't see it — this makes the bundler
  // ship it with every function explicitly. Nearly every route reads
  // through lib/hledger.ts (dashboard, every report, every job page), so
  // this is scoped broadly on purpose, not narrowed per-route.
  //
  // KNOWN RISK: there's an open Turbopack bug class where an explicit
  // `turbopack.root` (set above) can cause Vercel's build to re-root traced
  // paths and silently drop outputFileTracingIncludes entries. Don't trust
  // this config alone — verify the binary actually lands in the deployed
  // function bundle on a real Vercel deploy before relying on it.
  outputFileTracingIncludes: {
    "/**": ["./bin/hledger/**"],
  },
};

export default nextConfig;
