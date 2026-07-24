// v2 spec §F1: client-withheld retainage was booked as a liability
// (liabilities:retainage payable:<job>) and AR was debited the full billed
// amount. Retainage a client withholds from our pay app is actually money
// owed TO us — an asset. This script finds every existing
// `type:progress-billing` journal entry, reconstructs the amounts from its
// postings, and rewrites it via the engine's txnid-based replaceEntry so the
// journal stays git-audited and hledger-valid throughout.
//
// Safe to run multiple times: entries already using the new convention (no
// `liabilities:retainage payable:<job>` posting) are left untouched.
//
// Usage: JOURNAL_DIR=/path/to/journal-data npx tsx scripts/migrate-retainage-receivable.ts

import { print } from "../lib/hledger";
import { replaceEntry } from "../lib/journal";
import { accountsReceivable, incomeJob, retainageReceivable } from "../lib/accounts";

async function main() {
  const entries = await print(["tag:type=progress-billing"]);
  let migrated = 0;
  let skipped = 0;

  for (const entry of entries) {
    const jobCode = entry.tags.job;
    const txnid = entry.tags.txnid;
    if (!jobCode || !txnid) {
      console.warn(`Skipping entry with missing job/txnid tag: ${entry.description}`);
      skipped++;
      continue;
    }

    const oldRetainagePayable = entry.postings.find(
      (p) => p.account === `liabilities:retainage payable:${jobCode}`,
    );
    if (!oldRetainagePayable) {
      skipped++; // already on the new convention
      continue;
    }

    const ar = entry.postings.find((p) => p.account === accountsReceivable(jobCode));
    const income = entry.postings.find((p) => p.account === incomeJob(jobCode));
    if (!ar || !income) {
      console.warn(`Skipping entry with unexpected posting shape: ${entry.description}`);
      skipped++;
      continue;
    }

    // Old convention: AR = full amountBilled, retainage payable = -retainage,
    // income = -(amountBilled - retainage). Reconstruct amountBilled from AR.
    const amountBilled = ar.amount;
    const retainageWithheld = oldRetainagePayable.amount.negated();
    const netBilled = amountBilled.minus(retainageWithheld);

    await replaceEntry(txnid, {
      date: entry.date,
      description: entry.description,
      tags: entry.tags,
      postings: [
        { account: accountsReceivable(jobCode), amount: netBilled },
        { account: retainageReceivable(jobCode), amount: retainageWithheld },
        { account: incomeJob(jobCode), amount: amountBilled.negated() },
      ],
    });

    console.log(
      `Migrated ${entry.description} (${jobCode}): retainage ${retainageWithheld.toFixed(2)} moved to receivable`,
    );
    migrated++;
  }

  console.log(`Done. ${migrated} entr${migrated === 1 ? "y" : "ies"} migrated, ${skipped} skipped.`);

  if (migrated > 0) {
    const { commitJournalChanges } = await import("../lib/journal-git");
    await commitJournalChanges(
      `migration: retainage receivable rework (${migrated} entr${migrated === 1 ? "y" : "ies"})`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
