import { Sidebar } from "@/components/Sidebar";

// Every page in this group reads live data from Prisma and the hledger
// journal. Next.js's static analysis doesn't recognize those as
// request-time sources, so without this it would prerender the dashboard/
// reports at build time and serve stale financial data forever. Scoped to
// this group (not the root layout) so the marketing landing page, which
// makes no such calls, can still be statically prerendered.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="ml-[230px] min-h-screen px-10 py-10">
        <div className="mx-auto w-full max-w-6xl space-y-10">{children}</div>
      </main>
    </>
  );
}
