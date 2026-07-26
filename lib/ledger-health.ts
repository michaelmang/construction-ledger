import { prisma } from "./db";
import { check } from "./hledger";

// hledger `check` validates every balance assertion and that every
// transaction actually balances — the whole-journal integrity check this
// app's per-entry validation (lib/journal.ts's validateBalanced) can't
// catch on its own (e.g. a bad manual edit to the journal file outside the
// app, or a merge/resync gone wrong). Was dead code before V4 Phase 2 —
// nothing ever called it. Persisted as a singleton row so the result
// survives across containers/cold-starts and can be shown on the
// dashboard instead of only existing for the duration of one request.
export async function runLedgerCheck(): Promise<{ ok: boolean; error: string | null }> {
  const error = await check();
  const ok = error === null;
  await prisma.ledgerHealth.upsert({
    where: { id: 1 },
    create: { id: 1, lastCheckedAt: new Date(), ok, error },
    update: { lastCheckedAt: new Date(), ok, error },
  });
  return { ok, error };
}

export async function getLedgerHealth() {
  return prisma.ledgerHealth.findUnique({ where: { id: 1 } });
}
