import { auth } from "@/auth";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (confirmed against node_modules/next/dist/docs — `middleware.ts` still
// resolves for backward compat, but is the deprecated name). Runs on the
// Node.js runtime by default here, same runtime auth.ts's Prisma adapter
// needs, so there's no edge/node config split to worry about.
//
// Route groups don't add URL prefixes, so `(marketing)`'s only page is
// literally `/` and every `(app)` page has its own distinct real pathname
// (`/dashboard`, `/jobs`, ...) — gating by exact pathname here is enough
// to keep the landing page public while protecting everything else,
// including the CSV export route handlers under /api/reports.
const PUBLIC_PATHS = new Set(["/", "/sign-in"]);

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/auth")) {
    return;
  }
  if (!req.auth?.user) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt).*)",
  ],
};
