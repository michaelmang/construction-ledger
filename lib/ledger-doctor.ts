import { prisma } from "./db";
import { print } from "./hledger";
import Decimal from "decimal.js";

// Reconciles the JournalTxn index (Postgres) against the journal's actual
// current txnid: tags (the journal file, not git history — a deleted entry
// has no live tag even though it's still visible in past commits). The
// write pipeline (lib/transactions.ts) keeps these in sync on the happy
// path, but nothing detects drift if a write is interrupted mid-sequence,
// or if the journal is ever hand-edited outside the app.
//
// V4-AUDIT-AND-SPEC.md Phase 2, finding H1: "no reconciliation tool." The
// journal is the source of truth for money (product spec §4.5) — repair
// only ever flows journal-to-DB, never the reverse.

export interface OrphanedJournalEntry {
  txnid: string;
  date: string;
  description: string;
  jobCode: string | null;
  guessedKind: string;
  guessedAmount: string;
}

export interface LedgerDoctorReport {
  // JournalTxn rows whose txnid has no live entry in the journal anymore.
  orphanedInDb: string[];
  // Live journal entries (have a txnid: tag) with no matching JournalTxn
  // row.
  orphanedInJournal: OrphanedJournalEntry[];
}

// Best-effort kind detection from the entry's own tags, matching the exact
// tagging conventions each app/actions/*.ts writer uses today (kept in
// sync by hand — there's no single shared enum to derive this from):
// progress-billing/payment/bill-payment/overhead-expense/opening-balance
// all set an explicit `type` tag; expense sets `vendor`; labor sets
// `costtype=labor` with no vendor. Anything that matches none of these
// is reported as "unknown" rather than guessed wrong.
function guessKind(tags: Record<string, string>): string {
  if (tags.type) return tags.type;
  if (tags.costtype === "labor") return "labor";
  if (tags.vendor) return "expense";
  return "unknown";
}

// The app's `amount` field is a headline figure, not directly recoverable
// from postings alone — approximated as the sum of the positive (debit)
// side, which matches the headline for every posting shape this app
// writes (expense, labor, payment, billing, overhead, bill-payment,
// opening-balance all debit the headline amount on one line).
function guessAmount(postings: { amount: Decimal }[]): Decimal {
  return postings.reduce(
    (sum, p) => (p.amount.isPositive() ? sum.plus(p.amount) : sum),
    new Decimal(0),
  );
}

export async function diagnoseLedger(): Promise<LedgerDoctorReport> {
  const [allEntries, dbTxns] = await Promise.all([print([]), prisma.journalTxn.findMany()]);

  const journalTxnids = new Set(
    allEntries.map((e) => e.tags.txnid).filter((t): t is string => Boolean(t)),
  );
  const dbTxnids = new Set(dbTxns.map((t) => t.txnid));

  const orphanedInDb = dbTxns.filter((t) => !journalTxnids.has(t.txnid)).map((t) => t.txnid);

  const orphanedInJournal: OrphanedJournalEntry[] = allEntries
    .filter((e) => e.tags.txnid && !dbTxnids.has(e.tags.txnid))
    .map((e) => ({
      txnid: e.tags.txnid,
      date: e.date,
      description: e.description,
      jobCode: e.tags.job ?? null,
      guessedKind: guessKind(e.tags),
      guessedAmount: guessAmount(e.postings).toFixed(2),
    }));

  return { orphanedInDb, orphanedInJournal };
}

export interface RepairResult {
  removedFromDb: number;
  addedToDb: number;
  skipped: { txnid: string; reason: string }[];
}

export async function repairLedger(): Promise<RepairResult> {
  const { orphanedInDb, orphanedInJournal } = await diagnoseLedger();

  if (orphanedInDb.length > 0) {
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: orphanedInDb } } });
  }

  let addedToDb = 0;
  const skipped: { txnid: string; reason: string }[] = [];
  for (const entry of orphanedInJournal) {
    const job = entry.jobCode ? await prisma.job.findUnique({ where: { code: entry.jobCode } }) : null;
    if (entry.jobCode && !job) {
      skipped.push({ txnid: entry.txnid, reason: `job code ${entry.jobCode} not found` });
      continue;
    }
    await prisma.journalTxn.create({
      data: {
        txnid: entry.txnid,
        jobId: job?.id ?? null,
        kind: entry.guessedKind,
        date: new Date(entry.date),
        amount: entry.guessedAmount,
        memo: `[reconstructed by ledger doctor] ${entry.description}`,
      },
    });
    addedToDb++;
  }

  return { removedFromDb: orphanedInDb.length, addedToDb, skipped };
}
