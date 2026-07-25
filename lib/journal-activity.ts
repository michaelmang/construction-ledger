import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "./db";

const execFileAsync = promisify(execFile);

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
}

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

// Reads the journal data repo's git history and, where a commit carries a
// `txnid:` trailer (v2 spec §F13 — written by lib/transactions.ts since the
// activity page was added), joins it back to the JournalTxn row for a
// humanized description. Commits predating the trailer, and delete commits
// (whose JournalTxn row is already gone), fall back to the commit subject —
// which is already a human phrase, never raw journal syntax.
export async function listJournalActivity(limit = 200): Promise<ActivityEntry[]> {
  const cwd = journalDir();
  const format = `%H${FIELD_SEP}%aI${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`;

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      ["log", `--max-count=${limit}`, `--date=iso-strict`, `--format=${format}`],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
    ));
  } catch {
    return []; // no commits yet (fresh journal repo)
  }

  const parsed = stdout
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, dateStr, subject, body = ""] = record.split(FIELD_SEP);
      const txnidMatch = body.match(/^txnid:\s*(\S+)/m);
      return { hash, date: new Date(dateStr), subject, txnid: txnidMatch?.[1] ?? null };
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
    };
  });
}
