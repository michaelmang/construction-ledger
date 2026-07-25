import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Construction Ledger",
  description: "Job-centric accounting for a construction business",
  openGraph: {
    title: "Construction Ledger",
    description: "Job-costed accounting for construction, built on hledger.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Construction Ledger",
    description: "Job-costed accounting for construction, built on hledger.",
  },
  // Internal testing tool — not meant for public discovery. See also
  // app/robots.ts for the site-wide crawler directive.
  robots: {
    index: false,
    follow: false,
  },
};

// Every page reads live data from Prisma and the hledger journal. Next.js's
// static analysis doesn't recognize those as request-time sources, so
// without this it would prerender the dashboard/reports at build time and
// serve stale financial data forever.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg text-text">
        <Sidebar />
        <main className="ml-[230px] min-h-screen px-10 py-10">
          <div className="mx-auto w-full max-w-6xl space-y-10">{children}</div>
        </main>
      </body>
    </html>
  );
}
