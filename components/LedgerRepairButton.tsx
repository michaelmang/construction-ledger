"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runLedgerRepair } from "@/app/actions/ledger-doctor";
import { primaryButtonClass } from "@/components/form";

export function LedgerRepairButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleRepair() {
    if (!confirm("Repair the ledger index? DB rows with no live journal entry will be deleted; journal entries with no DB row will be reconstructed from the journal (best-effort).")) {
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    const res = await runLedgerRepair();
    setRunning(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(
      `Removed ${res.data.removedFromDb} orphaned DB row(s), reconstructed ${res.data.addedToDb} row(s) from the journal.` +
        (res.data.skipped.length > 0 ? ` Skipped ${res.data.skipped.length}: ${res.data.skipped.map((s) => s.reason).join("; ")}` : ""),
    );
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={handleRepair} disabled={running} className={primaryButtonClass}>
        {running ? "Repairing…" : "Repair"}
      </button>
      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
      {result && <p className="mt-2 text-sm text-positive">{result}</p>}
    </div>
  );
}
