"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "", label: "Overview" },
  { href: "/cost-codes", label: "Cost Codes" },
  { href: "/transactions", label: "Transactions" },
  { href: "/billings", label: "Billings" },
  { href: "/change-orders", label: "Change Orders" },
];

export function JobTabs({ jobId }: { jobId: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-neutral-200">
      {tabs.map((tab) => {
        const href = `/jobs/${jobId}${tab.href}`;
        const isActive = tab.href === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            className={`border-b-2 px-3 py-2 text-sm ${
              isActive
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
