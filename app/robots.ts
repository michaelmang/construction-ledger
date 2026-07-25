import type { MetadataRoute } from "next";

// Internal testing tool, not meant for public discovery — see the
// `robots: { index: false }` metadata in app/layout.tsx for the
// per-page-level version of this same intent.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
