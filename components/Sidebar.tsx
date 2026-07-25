"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/vendors", label: "Vendors" },
  { href: "/reports", label: "Reports" },
  { href: "/cost-codes", label: "Cost Codes" },
  { href: "/overhead", label: "Overhead" },
  { href: "/employees", label: "Employees" },
  { href: "/activity", label: "Activity" },
  { href: "/accounts", label: "Accounts" },
];

// Fixed left sidebar (v2 spec §4.2), replacing the v1 top nav. Active item:
// accent text + soft-accent background + 2px accent left rule.
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-10 w-[230px] border-r border-border bg-surface">
      <div className="px-5 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight text-text">
          Construction Ledger
        </Link>
      </div>
      <nav className="px-2">
        {links.map((link) => {
          const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`mb-0.5 flex items-center rounded-md border-l-2 px-3 py-2 text-sm ${
                isActive
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
