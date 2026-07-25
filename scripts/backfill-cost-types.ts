// v3 spec §F17/§F19 — job-cost expense entries recorded before this feature
// shipped have no `costtype:` tag (labor/material/subcontract/equipment/
// other), so the cost-code x cost-type pivot reports show everything as
// "Untyped" until this runs once. This script finds every `expense` journal
// entry with a `job:` tag and no `costtype:` tag, infers a cost type from
// the mapping tables below, and rewrites the entry via the engine's
// txnid-based replaceEntry so the journal stays git-audited and
// hledger-valid throughout. It also backfills the matching Bill.costType row.
//
// EDIT THE MAPPING TABLES BELOW before running — they are a starting point,
// not a guess the script makes for you. Match by vendor slug first (most
// reliable: "Ridge Framing Sub" is a subcontractor regardless of what cost
// code the expense hit), then by cost-code prefix, then fall back to
// "other" for anything unmapped. Entries backfilled as "other" are exactly
// the ones a CFO should scan and hand-correct afterward (edit the expense
// in the UI — cost type is editable there).
//
// Does NOT touch labor entries — there is no pre-v3 labor data to migrate;
// labor didn't exist as an enterable cost type before this feature. If you
// find yourself trying to "fix" that omission later, don't: it's correct.
//
// Safe to run multiple times: entries that already carry a costtype tag are
// left untouched, and non-expense entries (payments, billings, bill
// payments, overhead, opening balances) are never touched — they don't
// carry the cost-type dimension.
//
// Usage: JOURNAL_DIR=/path/to/journal-data npx tsx scripts/backfill-cost-types.ts

import { print } from "../lib/hledger";
import { replaceEntry } from "../lib/journal";
import { prisma } from "../lib/db";
import { COST_TYPES, CostType } from "../lib/cost-types";

// --- Edit before running ---------------------------------------------------

// Vendor slug (lowercase, trimmed — see lib/accounts.ts vendorAccountSlug)
// -> cost type. Checked first; most reliable signal since a vendor's trade
// rarely varies by job.
const VENDOR_COST_TYPE: Record<string, CostType> = {
  "ridge framing sub": "subcontract",
  "summit electric": "subcontract",
  "blue ridge plumbing": "subcontract",
  "sunrise finish carpentry": "subcontract",
  "ace concrete supply": "material",
};

// Cost-code prefix (matches the start of the code string) -> cost type.
// Checked when the vendor isn't in the table above.
const COST_CODE_PREFIX_COST_TYPE: Record<string, CostType> = {
  "03-": "material", // concrete
  "09-": "material", // finishes
};

// ----------------------------------------------------------------------------

function inferCostType(vendorSlug: string | undefined, costCode: string | undefined): CostType {
  if (vendorSlug && VENDOR_COST_TYPE[vendorSlug]) return VENDOR_COST_TYPE[vendorSlug];
  if (costCode) {
    for (const [prefix, type] of Object.entries(COST_CODE_PREFIX_COST_TYPE)) {
      if (costCode.startsWith(prefix)) return type;
    }
  }
  return "other";
}

async function main() {
  const entries = await print(["tag:job"]);
  const journalTxns = await prisma.journalTxn.findMany({
    where: { txnid: { in: entries.map((e) => e.tags.txnid).filter((t): t is string => Boolean(t)) } },
  });
  const kindByTxnid = new Map(journalTxns.map((t) => [t.txnid, t.kind]));

  let migrated = 0;
  let skipped = 0;

  for (const entry of entries) {
    const txnid = entry.tags.txnid;
    if (!txnid || kindByTxnid.get(txnid) !== "expense") {
      skipped++; // not a job-cost expense entry (payment, billing, bill payment, ...)
      continue;
    }
    if (entry.tags.costtype && (COST_TYPES as readonly string[]).includes(entry.tags.costtype)) {
      skipped++; // already backfilled
      continue;
    }

    const costType = inferCostType(entry.tags.vendor, entry.tags.code);

    await replaceEntry(txnid, {
      date: entry.date,
      description: entry.description,
      tags: { ...entry.tags, costtype: costType },
      postings: entry.postings,
    });

    await prisma.bill.updateMany({ where: { txnid }, data: { costType } });

    console.log(`Backfilled ${entry.description} (${entry.tags.job}) -> costtype:${costType}`);
    migrated++;
  }

  console.log(`Done. ${migrated} entr${migrated === 1 ? "y" : "ies"} backfilled, ${skipped} skipped.`);

  if (migrated > 0) {
    const { commitJournalChanges } = await import("../lib/journal-git");
    await commitJournalChanges(
      `migration: cost type backfill (${migrated} entr${migrated === 1 ? "y" : "ies"})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
