import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

// Route-group layouts control dynamic-vs-static per section: (app) forces
// dynamic rendering (live Prisma/hledger data), (marketing) has no data
// dependency and is statically prerendered. Nothing scoped here.

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
      <body className="min-h-full bg-bg text-text">{children}</body>
    </html>
  );
}
