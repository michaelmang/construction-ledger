// Disaster recovery: rebuilds the Postgres metadata tables from a nightly
// snapshot committed into the journal repo's snapshots/ directory (see
// lib/metadata-snapshot.ts and V4-AUDIT-AND-SPEC.md Phase 0, finding C3).
// The journal (git history of the hledger files) is untouched by this
// script — it's already durable on its own.
//
// This is a manual, rarely-run tool, not something the app calls itself.
// It refuses to run against a non-empty database unless --force is passed,
// because restoring into a live DB would create duplicate-key errors at
// best and interleave stale snapshot rows with newer real rows at worst.
//
// Usage:
//   npx tsx scripts/restore-metadata-snapshot.ts <path-to-snapshot.json>
//   npx tsx scripts/restore-metadata-snapshot.ts <path> --force

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/db";

// Insert order matters: a table can only be restored after every table its
// rows have a foreign key into has already been restored. Independent
// tables (first group) can go in any order relative to each other.
const RESTORE_ORDER: [string, (rows: unknown[]) => Promise<unknown>][] = [
  ["costCode", (rows) => prisma.costCode.createMany({ data: rows as never[] })],
  ["vendor", (rows) => prisma.vendor.createMany({ data: rows as never[] })],
  ["overheadCategory", (rows) => prisma.overheadCategory.createMany({ data: rows as never[] })],
  ["cashAccount", (rows) => prisma.cashAccount.createMany({ data: rows as never[] })],
  ["employee", (rows) => prisma.employee.createMany({ data: rows as never[] })],
  ["job", (rows) => prisma.job.createMany({ data: rows as never[] })],
  ["jobBudget", (rows) => prisma.jobBudget.createMany({ data: rows as never[] })],
  ["changeOrder", (rows) => prisma.changeOrder.createMany({ data: rows as never[] })],
  ["progressBilling", (rows) => prisma.progressBilling.createMany({ data: rows as never[] })],
  ["bill", (rows) => prisma.bill.createMany({ data: rows as never[] })],
  ["billPayment", (rows) => prisma.billPayment.createMany({ data: rows as never[] })],
  ["laborEntry", (rows) => prisma.laborEntry.createMany({ data: rows as never[] })],
  ["paymentApplication", (rows) => prisma.paymentApplication.createMany({ data: rows as never[] })],
  ["journalTxn", (rows) => prisma.journalTxn.createMany({ data: rows as never[] })],
];

// Every restored table has an autoincrement `id` primary key, and we insert
// with the snapshot's original ids preserved (so foreign keys still point
// at the right rows) — but explicit-id inserts don't advance Postgres's
// sequence counter, so the very next ordinary `create()` after a restore
// would collide with a restored id. Bump every sequence to the current max
// once the data is in.
const TABLE_NAMES: Record<string, string> = {
  costCode: "CostCode",
  vendor: "Vendor",
  overheadCategory: "OverheadCategory",
  cashAccount: "CashAccount",
  employee: "Employee",
  job: "Job",
  changeOrder: "ChangeOrder",
  progressBilling: "ProgressBilling",
  bill: "Bill",
  billPayment: "BillPayment",
  laborEntry: "LaborEntry",
  paymentApplication: "PaymentApplication",
  journalTxn: "JournalTxn",
  // jobBudget has a composite primary key (no autoincrement id) — no
  // sequence to fix.
};

async function main() {
  const [, , snapshotPath, flag] = process.argv;
  if (!snapshotPath) {
    console.error("Usage: npx tsx scripts/restore-metadata-snapshot.ts <path-to-snapshot.json> [--force]");
    process.exit(1);
  }
  const force = flag === "--force";

  const existingJobCount = await prisma.job.count();
  if (existingJobCount > 0 && !force) {
    console.error(
      `Refusing to restore: the database already has ${existingJobCount} job row(s). ` +
        `Pass --force to restore anyway (will likely fail on duplicate keys unless the DB is actually empty).`,
    );
    process.exit(1);
  }

  const raw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw) as { takenAt: string; models: Record<string, unknown[]> };
  console.log(`Restoring snapshot taken at ${snapshot.takenAt}...`);

  for (const [name, restore] of RESTORE_ORDER) {
    const rows = snapshot.models[name] ?? [];
    if (rows.length === 0) continue;
    await restore(rows);
    console.log(`  ${name}: ${rows.length} row(s)`);

    const tableName = TABLE_NAMES[name];
    if (tableName) {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1))`,
      );
    }
  }

  console.log("Restore complete. The hledger journal itself was not touched by this script.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
