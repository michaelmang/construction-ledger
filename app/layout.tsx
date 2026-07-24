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

export const metadata: Metadata = {
  title: "Construction Ledger",
  description: "Job-centric accounting for a construction business",
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
