import fs from "node:fs";
import * as git from "isomorphic-git";
import { prisma } from "./db";
import { ensureJournalReady } from "./journal-git";

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

export interface ActivityEntry {
  hash: string;
  date: Date;
  subject: string;
  txnid: string | null;
  kind: string | null;
  amount: string | null;
  jobId: number | null;
  jobCode: string | null;
  jobName: string | null;
  memo: string | null;
  // True only for a still-live create commit (see app/actions/revert.ts for
  // why edits/deletes can't be safely reverted with what's tracked today).
  revertible: boolean;
}

const NOT_REVERTIBLE_PREFIXES = ["edit ", "delete "];

// Reads the journal data repo's git history and, where a commit carries a
// `txnid:` trailer (v2 spec §F13 — written by lib/transactions.ts since the
// activity page was added), joins it back to the JournalTxn row for a
// humanized description. Commits predating the trailer, and delete commits
// (whose JournalTxn row is already gone), fall back to the commit subject —
// which is already a human phrase, never raw journal syntax.
export async function listJournalActivity(limit = 200): Promise<ActivityEntry[]> {
  await ensureJournalReady();
  const dir = journalDir();

  let commits: Awaited<ReturnType<typeof git.log>>;
  try {
    commits = await git.log({ fs, dir, depth: limit });
  } catch {
    return []; // no commits yet (fresh journal repo)
  }

  const parsed = commits.map(({ oid, commit }) => {
    const [subject, ...bodyParts] = commit.message.split("\n\n");
    const body = bodyParts.join("\n\n");
    const txnidMatch = body.match(/^txnid:\s*(\S+)/m);
    return {
      hash: oid,
      date: new Date(commit.author.timestamp * 1000),
      subject: subject.trim(),
      txnid: txnidMatch?.[1] ?? null,
    };
  });

  const txnids = parsed.map((p) => p.txnid).filter((t): t is string => t !== null);
  const journalTxns = txnids.length
    ? await prisma.journalTxn.findMany({ where: { txnid: { in: txnids } } })
    : [];
  const byTxnid = new Map(journalTxns.map((jt) => [jt.txnid, jt]));

  const jobIds = journalTxns.map((jt) => jt.jobId).filter((id): id is number => id !== null);
  const jobs = jobIds.length
    ? await prisma.job.findMany({ where: { id: { in: jobIds } } })
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  return parsed.map((p) => {
    const jt = p.txnid ? byTxnid.get(p.txnid) : undefined;
    const job = jt?.jobId ? jobById.get(jt.jobId) : undefined;
    const lowerSubject = p.subject.toLowerCase();
    return {
      hash: p.hash,
      date: p.date,
      subject: p.subject,
      txnid: p.txnid,
      kind: jt?.kind ?? null,
      amount: jt ? jt.amount.toFixed(2) : null,
      jobId: job?.id ?? null,
      jobCode: job?.code ?? null,
      jobName: job?.name ?? null,
      memo: jt?.memo ?? null,
      revertible: jt !== undefined && !NOT_REVERTIBLE_PREFIXES.some((prefix) => lowerSubject.startsWith(prefix)),
    };
  });
}
