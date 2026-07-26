// Shared between Sidebar (desktop, >= lg) and MobileNav (< lg, V4 spec
// Phase 3 responsive shell) so the two surfaces can't drift out of sync.
export const NAV_LINKS = [
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

export const ADMIN_ONLY_NAV_LINKS = [
  { href: "/users", label: "Users" },
  { href: "/ledger-doctor", label: "Ledger Doctor" },
];

export interface SidebarUser {
  email: string;
  role: string;
}

export function navLinksFor(user: SidebarUser | null) {
  return user?.role === "admin" ? [...NAV_LINKS, ...ADMIN_ONLY_NAV_LINKS] : NAV_LINKS;
}
