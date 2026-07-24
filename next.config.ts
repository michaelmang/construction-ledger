import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The home directory (a few levels up) has its own package-lock.json from
  // unrelated projects, which confuses Turbopack's workspace-root inference.
  // Pin it explicitly to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
