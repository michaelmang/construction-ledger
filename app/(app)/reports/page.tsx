import Link from "next/link";

const reports = [
  {
    href: "/reports/wip",
    title: "WIP Schedule",
    description: "% complete, earned revenue, and over/under billing for every active job.",
  },
  {
    href: "/reports/profitability",
    title: "Job Profitability",
    description: "Projected margin and actual margin to date for every active job.",
  },
  {
    href: "/reports/retainage",
    title: "Retainage Aging",
    description: "What's withheld on each progress billing, and how long it's been outstanding.",
  },
  {
    href: "/reports/ar-aging",
    title: "AR Aging",
    description: "What clients still owe on each progress billing, net of retainage and payments.",
  },
  {
    href: "/reports/ap-aging",
    title: "AP Aging",
    description: "What's still owed on every open vendor bill, across jobs and overhead.",
  },
  {
    href: "/reports/cost-types",
    title: "Cost by Type",
    description: "Labor, material, subcontract, and equipment cost across every job.",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="block rounded-lg border border-border bg-surface p-5 hover:border-accent/50"
          >
            <h2 className="font-medium">{r.title}</h2>
            <p className="mt-1 text-sm text-text-3">{r.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
