"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/vendors", label: "Vendors" },
  { href: "/reports", label: "Reports" },
  { href: "/cost-codes", label: "Cost Codes" },
  { href: "/overhead", label: "Overhead" },
  { href: "/employees", label: "Employees" },
  { href: "/activity", label: "Activity" },
  { href: "/accounts", label: "Accounts" },
];

const ADMIN_ONLY_LINKS = [{ href: "/users", label: "Users" }];

export interface SidebarUser {
  email: string;
  role: string;
}

// Fixed left sidebar (v2 spec §4.2), replacing the v1 top nav. Active item:
// accent text + soft-accent background + 2px accent left rule.
export function Sidebar({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname();
  const allLinks = user?.role === "admin" ? [...links, ...ADMIN_ONLY_LINKS] : links;

  return (
    <aside className="fixed inset-y-0 left-0 z-10 flex w-[230px] flex-col border-r border-border bg-surface">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-text">
          Construction Ledger
        </Link>
      </div>
      <nav className="flex-1 px-2">
        {allLinks.map((link) => {
          const isActive = pathname.startsWith(link.href);
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
      {user && (
        <div className="border-t border-border px-4 py-3">
          <div className="truncate text-xs text-text-2" title={user.email}>
            {user.email}
          </div>
          <div className="text-[11px] capitalize text-text-3">{user.role}</div>
          <form action={signOutAction} className="mt-2">
            <button type="submit" className="text-xs text-text-3 hover:text-text hover:underline">
              Sign out
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
