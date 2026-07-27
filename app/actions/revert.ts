"use server";

import fs from "node:fs";
import * as git from "isomorphic-git";
import { prisma } from "@/lib/db";
import { ActionResult, ok, fail } from "@/lib/action-result";
import { requireWriteRole } from "@/lib/authz";
import { deleteExpense } from "./expenses";
import { deletePayment } from "./payments";
import { deleteLaborCost } from "./labor";
import { deleteBillPayment } from "./bills";
import { deleteOverheadExpense } from "./overhead";
import { deleteProgressBilling } from "./billings";
import { deleteRetainageRelease } from "./retainage";
import { editOpeningBalance } from "./accounts";

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

const NOT_REVERTIBLE_PREFIXES = ["edit ", "delete "];

// Activity history's "Revert this change" (V4 spec Phase 2), scoped to the
// one case that's unambiguous with what the app already tracks: undoing a
// transaction that's still exactly as its creation commit left it. Reverting
// an edit or a delete would mean reconstructing the transaction's state
// *before* that commit — postings, tags, and whatever Prisma side-effects
// it undid (a Bill's paidAmount, a ProgressBilling's status) — and nothing
// today retains that; JournalTxn only ever holds the current state, and
// hledger print only sees the live journal. Guessing at a reversal for
// those cases would risk silently corrupting real financial records, so
// they're refused rather than approximated. Re-verifies server-side (never
// trusts what the client claims about a commit) by reading the commit
// itself and re-checking the transaction is still live before dispatching
// to the same kind-specific delete a user would click on that record
// directly — so a revert produces exactly the same guarded, audited
// deletion, not a shortcut around it.
export async function revertActivity(hash: string): Promise<ActionResult<{ txnid: string }>> {
  const denied = await requireWriteRole();
  if (denied) return denied;

  try {
    const dir = journalDir();
    const { commit } = await git.readCommit({ fs, dir, oid: hash });
    const [subjectLine, ...bodyParts] = commit.message.split("\n\n");
    const subject = subjectLine.trim().toLowerCase();
    const body = bodyParts.join("\n\n");

    if (NOT_REVERTIBLE_PREFIXES.some((p) => subject.startsWith(p))) {
      return fail("Only the original creation of a transaction can be reverted, not an edit or delete.");
    }

    const txnidMatch = body.match(/^txnid:\s*(\S+)/m);
    const txnid = txnidMatch?.[1];
    if (!txnid) return fail("This entry has no linked transaction to revert.");

    const journalTxn = await prisma.journalTxn.findUnique({ where: { txnid } });
    if (!journalTxn) {
      return fail("This transaction no longer exists — it may already have been deleted.");
    }

    switch (journalTxn.kind) {
      case "expense":
        return await deleteExpense(txnid);
      case "payment":
        return await deletePayment(txnid);
      case "labor":
        return await deleteLaborCost(txnid);
      case "bill-payment":
        return await deleteBillPayment(txnid);
      case "overhead-expense":
        return await deleteOverheadExpense(txnid);
      case "retainage-release":
        return await deleteRetainageRelease(txnid);
      case "progress-billing": {
        const billing = await prisma.progressBilling.findUnique({ where: { txnid } });
        if (!billing) return fail("Progress billing record for this entry not found.");
        const result = await deleteProgressBilling(billing.id);
        return result.ok ? ok({ txnid }) : result;
      }
      case "opening-balance": {
        const account = await prisma.cashAccount.findFirst({ where: { openingBalanceTxnid: txnid } });
        if (!account) return fail("Cash account for this opening balance not found.");
        const result = await editOpeningBalance({ cashAccountId: account.id, openingBalance: "0" });
        return result.ok ? ok({ txnid }) : result;
      }
      default:
        return fail(`Reverting a "${journalTxn.kind}" entry isn't supported yet.`);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}
