import { auth } from "@/auth";
import { diagnoseLedger } from "@/lib/ledger-doctor";
import { PageHeader } from "@/components/ui/PageHeader";
import { LedgerRepairButton } from "@/components/LedgerRepairButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

// Admin-only, same pattern as /users — proxy.ts only asserts "signed in",
// not role, so this page (and app/actions/ledger-doctor.ts) each assert
// admin independently.
export default async function LedgerDoctorPage() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center text-sm text-text-2">
        Admins only.
      </div>
    );
  }

  const report = await diagnoseLedger();
  const hasIssues = report.orphanedInDb.length > 0 || report.orphanedInJournal.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Settings" title="Ledger Doctor" />
      <p className="max-w-2xl text-sm text-text-2">
        Reconciles the database index against the journal&apos;s actual current entries. The
        journal is always the source of truth for money — repair only ever removes stale DB rows
        or reconstructs missing ones from the journal, never the other way around.
      </p>

      {!hasIssues ? (
        <EmptyState label="In sync" message="Every journal entry has a matching database row and vice versa." />
      ) : (
        <>
          <LedgerRepairButton />

          {report.orphanedInDb.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-text">
                Orphaned in database ({report.orphanedInDb.length})
              </h2>
              <p className="mb-3 text-xs text-text-3">
                These txnids have a database index row but no live entry in the journal anymore —
                repair deletes the stale row.
              </p>
              <div className={tableWrapClass}>
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>txnid</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyClass}>
                    {report.orphanedInDb.map((txnid) => (
                      <tr key={txnid} className={trClass}>
                        <td className={`${tdClass} font-mono text-xs`}>{txnid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.orphanedInJournal.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-text">
                Orphaned in journal ({report.orphanedInJournal.length})
              </h2>
              <p className="mb-3 text-xs text-text-3">
                These journal entries have no database index row — repair reconstructs a row from
                the entry&apos;s tags/postings (best-effort: kind and amount are inferred, not
                guaranteed exact).
              </p>
              <div className={tableWrapClass}>
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Description</th>
                      <th className={thClass}>Guessed Kind</th>
                      <th className={thClass}>Job</th>
                      <th className={thClass}>Guessed Amount</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyClass}>
                    {report.orphanedInJournal.map((e) => (
                      <tr key={e.txnid} className={trClass}>
                        <td className={`${tdClass} font-mono text-xs`}>{e.date}</td>
                        <td className={tdClass}>{e.description}</td>
                        <td className={tdClass}>{e.guessedKind}</td>
                        <td className={tdClass}>{e.jobCode ?? "—"}</td>
                        <td className={`${tdNumericClass}`}>{e.guessedAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
