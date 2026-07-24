import Decimal from "decimal.js";
import { prisma } from "./db";
import { writeEntry, replaceEntry, deleteEntry, Posting } from "./journal";
import { commitJournalChanges } from "./journal-git";

export type TransactionKind =
  | "expense"
  | "payment"
  | "progress-billing"
  | "bill-payment"
  | "overhead-expense"
  | "opening-balance";

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

// Writes the journal entry, indexes it in JournalTxn (so edits/deletes can
// find it by txnid without re-parsing the journal), and commits the journal
// data repo. Every domain write (expense, payment, progress billing) goes
// through this so the three stay consistent (product spec §4.5/§4.6).
export async function recordTransaction(
  entry: TransactionEntry,
  commitMessage: string,
): Promise<{ txnid: string }> {
  const { txnid } = await writeEntry({
    date: entry.date,
    description: entry.description,
    tags: entry.tags,
    postings: entry.postings,
  });

  await prisma.journalTxn.create({
    data: {
      txnid,
      jobId: entry.jobId,
      kind: entry.kind,
      date: new Date(entry.date),
      amount: entry.amount.toFixed(2),
      memo: entry.memo,
    },
  });

  await commitJournalChanges(commitMessage);
  return { txnid };
}

export async function updateTransaction(
  txnid: string,
  entry: TransactionEntry,
  commitMessage: string,
): Promise<void> {
  await replaceEntry(txnid, {
    date: entry.date,
    description: entry.description,
    tags: entry.tags,
    postings: entry.postings,
  });

  await prisma.journalTxn.update({
    where: { txnid },
    data: {
      jobId: entry.jobId,
      date: new Date(entry.date),
      amount: entry.amount.toFixed(2),
      memo: entry.memo,
    },
  });

  await commitJournalChanges(commitMessage);
}

export async function removeTransaction(
  txnid: string,
  commitMessage: string,
): Promise<void> {
  await deleteEntry(txnid);
  await prisma.journalTxn.delete({ where: { txnid } });
  await commitJournalChanges(commitMessage);
}
