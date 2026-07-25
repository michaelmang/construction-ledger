import { auth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";

// Every page in this group reads live data from Prisma and the hledger
// journal. Next.js's static analysis doesn't recognize those as
// request-time sources, so without this it would prerender the dashboard/
// reports at build time and serve stale financial data forever. Scoped to
// this group (not the root layout) so the marketing landing page, which
// makes no such calls, can still be statically prerendered.
export const dynamic = "force-dynamic";

// proxy.ts already redirects unauthenticated requests to /sign-in before
// this layout ever renders, so `session` is expected to be non-null here.
// Not re-asserting that (a null session at this point means the proxy
// gate itself is broken, which is a bug to see loudly, not paper over).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <>
      <Sidebar user={session?.user ? { email: session.user.email ?? "", role: session.user.role } : null} />
      <main className="ml-[230px] min-h-screen px-10 py-10">
        <div className="mx-auto w-full max-w-6xl space-y-10">{children}</div>
      </main>
    </>
  );
}
