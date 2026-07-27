import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import * as git from "isomorphic-git";
import Decimal from "decimal.js";
import { recordTransaction, updateTransaction, removeTransaction } from "@/lib/transactions";
import { prisma } from "@/lib/db";

const execFileAsync = promisify(execFile);

// Shells out to real git deliberately, even though writes now go through
// isomorphic-git — a real `git rev-list` reading an isomorphic-git-written
// repo is a valid cross-implementation sanity check that the commits it
// produces are genuinely well-formed git history, not just something
// isomorphic-git's own log() happens to agree with itself about.
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
    await git.init({ fs, dir: journalDir, defaultBranch: "main" });
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

  // Regression test for a real bug found during V4 Phase 2: isomorphic-git's
  // statusMatrix() decides whether a file counts as "changed" via a
  // stat-based (mtime/size) fast path rather than always rehashing content.
  // Two writes of same-length-but-different content landing close together
  // in time could make it report "unmodified" even though the bytes
  // genuinely differ — confirmed directly with a standalone reproduction
  // (write "hello", commit, write "world" to the same path, statusMatrix
  // still reported WorkdirStatus=1/unmodified). Since edited journal
  // entries very often keep the same digit count (e.g. $50.00 -> $60.00),
  // this silently dropped real commits for realistic edits. Fixed in
  // journal-git.ts by never asking statusMatrix what changed — everything
  // gets added unconditionally, and git.commit()/git.add() were confirmed
  // to always rehash actual content correctly regardless of stat drift.
  it("commits every edit even when the new content is the same byte length as the old", async () => {
    const before = await commitCount(journalDir);

    const { txnid } = await recordTransaction(
      {
        kind: "expense",
        jobId: null,
        date: "2026-07-24",
        description: "Same-length edit test",
        tags: {},
        postings: [
          { account: "expenses:jobs:X:a", amount: new Decimal("50.00") },
          { account: "liabilities:accounts payable:v", amount: new Decimal("-50.00") },
        ],
        amount: new Decimal("50.00"),
      },
      "test: same-length create",
    );
    txnids.push(txnid);
    expect(await commitCount(journalDir)).toBe(before + 1);

    // Same digit count as the original ("50.00" -> "60.00"), no delay
    // introduced — the exact conditions the bug needed to reproduce.
    for (const amount of ["60.00", "70.00", "80.00"]) {
      await updateTransaction(
        txnid,
        {
          kind: "expense",
          jobId: null,
          date: "2026-07-24",
          description: "Same-length edit test",
          tags: {},
          postings: [
            { account: "expenses:jobs:X:a", amount: new Decimal(amount) },
            { account: "liabilities:accounts payable:v", amount: new Decimal(amount).negated() },
          ],
          amount: new Decimal(amount),
        },
        `test: edit to ${amount}`,
      );
    }

    // 1 create + 3 edits, every single one a real commit.
    expect(await commitCount(journalDir)).toBe(before + 4);

    // And the content genuinely reflects the last edit, not a stale one.
    const { stdout } = await execFileAsync(
      "git",
      ["show", "HEAD:2026.journal"],
      { cwd: journalDir },
    );
    expect(stdout).toContain("80.00");
    expect(stdout).not.toContain("50.00");
    expect(stdout).not.toContain("60.00");
    expect(stdout).not.toContain("70.00");

    await removeTransaction(txnid, "test: same-length delete");
  });
});
