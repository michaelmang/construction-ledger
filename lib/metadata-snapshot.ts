import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { ensureJournalReady, commitJournalChanges } from "./journal-git";

// The hledger journal (a private git repo) is the only durable, versioned,
// off-Postgres store this app has. Everything queried below is data that
// lives *only* in Postgres and cannot be reconstructed from the journal —
// job metadata, budgets, bill/billing status, employee rates. Kept in sync
// by hand with prisma/schema.prisma's model list (see V4-AUDIT-AND-SPEC.md
// Phase 0, finding C3): a new model needs a new line here, same as it needs
// one in the schema.
const SNAPSHOT_QUERIES: [string, () => Promise<unknown>][] = [
  ["job", () => prisma.job.findMany()],
  ["costCode", () => prisma.costCode.findMany()],
  ["jobBudget", () => prisma.jobBudget.findMany()],
  ["changeOrder", () => prisma.changeOrder.findMany()],
  ["progressBilling", () => prisma.progressBilling.findMany()],
  ["paymentApplication", () => prisma.paymentApplication.findMany()],
  ["journalTxn", () => prisma.journalTxn.findMany()],
  ["vendor", () => prisma.vendor.findMany()],
  ["overheadCategory", () => prisma.overheadCategory.findMany()],
  ["cashAccount", () => prisma.cashAccount.findMany()],
  ["bill", () => prisma.bill.findMany()],
  ["billPayment", () => prisma.billPayment.findMany()],
  ["employee", () => prisma.employee.findMany()],
  ["laborEntry", () => prisma.laborEntry.findMany()],
  // Deliberately no account/session/verificationToken here — those hold
  // OAuth tokens and one-time sign-in secrets, which shouldn't be written
  // into a git-committed file even in a private repo. Losing them just
  // means everyone signs in again; losing `user`/`allowedUser` would mean
  // nobody could sign in at all, so those two are worth backing up.
  ["user", () => prisma.user.findMany()],
  ["allowedUser", () => prisma.allowedUser.findMany()],
];

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

// Prisma's Decimal and Date both implement toJSON() (Decimal via decimal.js,
// returning its string form; Date natively, returning an ISO string), so
// plain JSON.stringify already serializes every field type this schema
// uses without a custom replacer.
export async function snapshotMetadata(): Promise<{ takenAt: string }> {
  await ensureJournalReady();

  const takenAt = new Date().toISOString();
  const models: Record<string, unknown> = {};
  for (const [name, fetch] of SNAPSHOT_QUERIES) {
    models[name] = await fetch();
  }
  const json = JSON.stringify({ takenAt, models }, null, 2);

  const dir = path.join(journalDir(), "snapshots");
  await mkdir(dir, { recursive: true });
  // `latest.json` is what a restore script reads by default; the dated
  // copy keeps a full history of snapshots in the journal repo's own git
  // log (each is a separate commit) without needing anything beyond git
  // itself to browse or diff past states.
  await writeFile(path.join(dir, "latest.json"), json, "utf8");
  await writeFile(path.join(dir, `${takenAt.slice(0, 10)}.json`), json, "utf8");

  await commitJournalChanges(`snapshot: metadata as of ${takenAt}`);
  return { takenAt };
}
