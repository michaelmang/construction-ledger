import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Decimal from "decimal.js";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { prisma } from "@/lib/db";

const execFileAsync = promisify(execFile);

async function commitCount(cwd: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd });
    return Number(stdout.trim());
  } catch {
    return 0; // no commits yet
  }
}

// Product spec §4.5 / Phase 5: every write must commit to the journal data
// repo so the git history is a real audit trail. Verify it fires on every
// write path (create, edit, delete), not just some of them.
describe("git auto-commit on every write path", () => {
  let journalDir: string;
  const txnids: string[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "git-commit-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await execFileAsync("git", ["init"], { cwd: journalDir });
  });

  afterAll(async () => {
    await prisma.journalTxn.deleteMany({ where: { txnid: { in: txnids } } });
    await rm(journalDir, { recursive: true, force: true });
  });

  it("commits on create, edit, and delete", async () => {
    expect(await commitCount(journalDir)).toBe(0);

    const { txnid } = await recordTransaction(
      {
        kind: "expense",
        jobId: null,
        date: "2026-07-24",
        description: "Commit test expense",
        tags: {},
        postings: [
          { account: "expenses:jobs:X:a", amount: new Decimal("50.00") },
          { account: "liabilities:accounts payable:v", amount: new Decimal("-50.00") },
        ],
        amount: new Decimal("50.00"),
      },
      "test: create",
    );
    txnids.push(txnid);
    expect(await commitCount(journalDir)).toBe(1);

    await updateTransaction(
      txnid,
      {
        kind: "expense",
        jobId: null,
        date: "2026-07-24",
        description: "Commit test expense (edited)",
        tags: {},
        postings: [
          { account: "expenses:jobs:X:a", amount: new Decimal("75.00") },
          { account: "liabilities:accounts payable:v", amount: new Decimal("-75.00") },
        ],
        amount: new Decimal("75.00"),
      },
      "test: edit",
    );
    expect(await commitCount(journalDir)).toBe(2);

    await removeTransaction(txnid, "test: delete");
    expect(await commitCount(journalDir)).toBe(3);
  });
});
