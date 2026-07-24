import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/vendors", label: "Vendors" },
  { href: "/cost-codes", label: "Cost Codes" },
  { href: "/overhead", label: "Overhead" },
  { href: "/accounts", label: "Accounts" },
  { href: "/reports", label: "Reports" },
];

export function Nav() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <Link href="/" className="font-semibold text-neutral-900">
          Construction Ledger
        </Link>
        <nav className="flex gap-6 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-neutral-600 hover:text-neutral-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
