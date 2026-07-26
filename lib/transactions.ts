import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { prisma } from "./db";
import { writeEntry, replaceEntry, deleteEntry, Posting } from "./journal";
import { commitJournalChanges, resyncJournalFromRemote, JournalPushRejectedError } from "./journal-git";
import { assertWritesAllowed } from "./env-guard";

export type TransactionKind =
  | "expense"
  | "labor"
  | "payment"
  | "progress-billing"
  | "bill-payment"
  | "overhead-expense"
  | "opening-balance"
  | "retainage-release";

export interface TransactionEntry {
  kind: TransactionKind;
  jobId: number | null;
  date: string;
  description: string;
  tags: Record<string, string>;
  postings: Posting[];
  amount: Decimal; // headline amount stored on the JournalTxn index
  memo?: string;
}

// A separate, container-scoped mutex from lib/journal.ts's serialized()
// queue. That one only guards the plain-text file read-modify-write inside
// writeEntry/replaceEntry/deleteEntry; it doesn't cover the git commit+push
// that follows. Two concurrent requests in the same warm Vercel container
// could each safely (queue-protected) write their own file changes, then
// race each other's `git commit`/`git push` against the same on-disk repo —
// isomorphic-git operating on shared .git state concurrently isn't safe the
// way two sequential filesystem writes already are. This wraps the whole
// write-then-commit-then-push sequence (including the retry-on-rejection
// path below) so only one runs at a time per container.
let txnQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = txnQueue.then(fn, fn);
  txnQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// A git trailer, not part of the human-readable commit subject, so the
// Activity page (v2 spec §F13) can join a commit back to its JournalTxn row
// without parsing journal syntax out of the message text.
function withTxnidTrailer(commitMessage: string, txnid: string): string {
  return `${commitMessage}\n\ntxnid: ${txnid}`;
}

// On Vercel, a push can be rejected because another container pushed first
// (this container's /tmp clone has diverged). isomorphic-git can't merge —
// the recovery is to discard the local clone, re-sync from the remote, and
// redo the entire write against the freshly synced content. This lives here
// (not inside journal-git.ts) because only the caller knows how to redo a
// writeEntry/replaceEntry/deleteEntry call; journal-git.ts only knows git
// plumbing. One retry — proportionate for this app's traffic level, not a
// distributed lock.
async function withPushRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    if (!(err instanceof JournalPushRejectedError)) throw err;
    await resyncJournalFromRemote();
    return attempt();
  }
}

// Writes the journal entry, indexes it in JournalTxn (so edits/deletes can
// find it by txnid without re-parsing the journal), and commits the journal
// data repo. Every domain write (expense, payment, progress billing) goes
// through this so the three stay consistent (product spec §4.5/§4.6).
//
// The txnid is generated up front (not inside writeEntry) so a retry after
// a rejected push reuses the exact same value instead of minting a
// duplicate entry — writeEntry accepts an explicit tags.txnid override for
// exactly this. The JournalTxn row is written only after the push succeeds
// (upsert, since a retry may run this twice): indexing before persistence
// was confirmed would leave a DB row pointing at journal state that never
// actually landed if the push failed.
export async function recordTransaction(
  entry: TransactionEntry,
  commitMessage: string,
): Promise<{ txnid: string }> {
  assertWritesAllowed();
  const txnid = entry.tags.txnid ?? randomUUID();
  const tags = { ...entry.tags, txnid };

  return serialized(() =>
    withPushRetry(async () => {
      await writeEntry({
        date: entry.date,
        description: entry.description,
        tags,
        postings: entry.postings,
      });

      await commitJournalChanges(withTxnidTrailer(commitMessage, txnid));

      await prisma.journalTxn.upsert({
        where: { txnid },
        create: {
          txnid,
          jobId: entry.jobId,
          kind: entry.kind,
          date: new Date(entry.date),
          amount: entry.amount.toFixed(2),
          memo: entry.memo,
        },
        update: {
          jobId: entry.jobId,
          kind: entry.kind,
          date: new Date(entry.date),
          amount: entry.amount.toFixed(2),
          memo: entry.memo,
        },
      });

      return { txnid };
    }),
  );
}

export async function updateTransaction(
  txnid: string,
  entry: TransactionEntry,
  commitMessage: string,
): Promise<void> {
  assertWritesAllowed();
  return serialized(() =>
    withPushRetry(async () => {
      await replaceEntry(txnid, {
        date: entry.date,
        description: entry.description,
        tags: entry.tags,
        postings: entry.postings,
      });

      await commitJournalChanges(withTxnidTrailer(commitMessage, txnid));

      await prisma.journalTxn.update({
        where: { txnid },
        data: {
          jobId: entry.jobId,
          date: new Date(entry.date),
          amount: entry.amount.toFixed(2),
          memo: entry.memo,
        },
      });
    }),
  );
}

export async function removeTransaction(
  txnid: string,
  commitMessage: string,
): Promise<void> {
  assertWritesAllowed();
  return serialized(() =>
    withPushRetry(async () => {
      await deleteEntry(txnid);
      await commitJournalChanges(withTxnidTrailer(commitMessage, txnid));
      await prisma.journalTxn.delete({ where: { txnid } });
    }),
  );
}
