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

export function cash(account = "checking"): string {
  return `assets:${account}`;
}
