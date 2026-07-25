// Account naming convention from the product spec §3.2. Keeping this in one
// place means hledger's own `balance`/`register` CLI stays usable as a
// fallback with predictable account names, even without the UI.

export function accountsReceivable(jobCode: string): string {
  return `assets:accounts receivable:${jobCode}`;
}

export function retainageReceivable(jobCode: string): string {
  return `assets:retainage receivable:${jobCode}`;
}

export function accountsPayable(vendor: string): string {
  return `liabilities:accounts payable:${vendor}`;
}

export function retainagePayable(jobCode: string): string {
  return `liabilities:retainage payable:${jobCode}`;
}

export function incomeJob(jobCode: string): string {
  return `income:jobs:${jobCode}`;
}

export function expenseJobCostCode(jobCode: string, costCode: string): string {
  return `expenses:jobs:${jobCode}:${costCode}`;
}

export function expenseOverhead(category: string): string {
  return `expenses:overhead:${category}`;
}

export function cash(account = "checking"): string {
  return `assets:${account}`;
}

export function equityOpeningBalances(): string {
  return "equity:opening balances";
}

// Labor is not a vendor bill (no vendor, no AP) — it clears through a single
// accrued-payroll liability instead (v3 spec §F19 design decision 4). Actual
// payroll payment is deferred, unchanged from prior scope decisions.
export function accruedPayroll(): string {
  return "liabilities:accrued payroll";
}

// AP/retainage accounts are keyed by this slug, computed once from the
// vendor's stored name, so bill creation and bill payment always agree on
// the account path (v2 spec §F6 — free-typed vendor names used to silently
// fork the AP account on a typo).
export function vendorAccountSlug(vendorName: string): string {
  return vendorName.trim().toLowerCase();
}

// Same convention as vendorAccountSlug, used for the `employee:` tag on
// labor entries (v3 spec §F19). Labor doesn't get a per-employee account —
// all labor clears through the single accrued-payroll liability — this slug
// is for tagging/filtering only.
export function employeeSlug(employeeName: string): string {
  return employeeName.trim().toLowerCase();
}

// Turns an hledger account path into construction-first language for the UI
// (product spec's guiding rule: the user should never need to know hledger
// exists). Drops the top-level type segment and title-cases the rest, e.g.
// "assets:accounts receivable:J2026-014" -> "Accounts Receivable — J2026-014".
export function humanizeAccount(account: string): string {
  const segments = account.split(":").slice(1);
  const titleCase = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());
  return segments.map(titleCase).join(" — ");
}
