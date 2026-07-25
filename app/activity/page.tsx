import Link from "next/link";
import { listJournalActivity, ActivityEntry } from "@/lib/journal-activity";
import { formatUSD } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, PillTone } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  expense: "Expense",
  payment: "Payment",
  "progress-billing": "Progress Billing",
  "bill-payment": "Bill Payment",
  "overhead-expense": "Overhead Expense",
  "opening-balance": "Opening Balance",
};

const KIND_TONE: Record<string, PillTone> = {
  expense: "negative",
  payment: "positive",
  "progress-billing": "positive",
  "bill-payment": "negative",
  "overhead-expense": "negative",
  "opening-balance": "neutral",
};

function describe(entry: ActivityEntry): string {
  const isDelete = entry.subject.startsWith("delete ");
  const isEdit = entry.subject.startsWith("edit ");
  if (!entry.kind) return entry.subject; // no journal-txn match — already a human phrase

  const verb = isDelete ? "Deleted" : isEdit ? "Edited" : "Recorded";
  const label = KIND_LABEL[entry.kind] ?? entry.kind;
  const jobPart = entry.jobCode ? ` on ${entry.jobName} (${entry.jobCode})` : "";
  return `${verb} ${label.toLowerCase()}${jobPart}`;
}

export default async function ActivityPage() {
  const entries = await listJournalActivity();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit Trail"
        title="Activity"
      />
      <p className="text-sm text-text-3">
        Every accounting entry is a commit in the ledger&apos;s own git history — nothing
        here can be silently altered without leaving a trace.
      </p>

      {entries.length === 0 ? (
        <EmptyState label="No Activity" message="Nothing has been recorded yet." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {entries.map((entry) => {
            const isDelete = entry.subject.startsWith("delete ");
            return (
              <li key={entry.hash}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                    <div className="flex min-w-0 items-center gap-3">
                      {entry.kind && (
                        <Pill tone={isDelete ? "negative" : (KIND_TONE[entry.kind] ?? "neutral")}>
                          {KIND_LABEL[entry.kind] ?? entry.kind}
                        </Pill>
                      )}
                      <span className="truncate text-sm text-text">{describe(entry)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      {entry.amount && (
                        <span className="font-mono text-sm tabular-nums text-text-2">
                          {formatUSD(entry.amount)}
                        </span>
                      )}
                      <span className="w-24 text-right text-xs text-text-3">
                        {entry.date.toISOString().slice(0, 10)}
                      </span>
                    </div>
                  </summary>
                  <div className="space-y-1 border-t border-border bg-surface-2 px-4 py-3 text-xs text-text-3">
                    {entry.memo && <div>Memo: {entry.memo}</div>}
                    {entry.jobId && (
                      <div>
                        Job:{" "}
                        <Link href={`/jobs/${entry.jobId}`} className="underline hover:text-text-2">
                          {entry.jobName} ({entry.jobCode})
                        </Link>
                      </div>
                    )}
                    <div>Recorded: {entry.date.toISOString().replace("T", " ").slice(0, 19)}</div>
                    <div className="font-mono">commit {entry.hash.slice(0, 10)}</div>
                    <div className="text-text-3/70">{entry.subject}</div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
