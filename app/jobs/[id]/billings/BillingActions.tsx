"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProgressBilling } from "@/app/actions/billings";

export function BillingActions({ jobId, billingId }: { jobId: number; billingId: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteProgressBilling(billingId);
    if (!result.ok) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-2">Delete?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="font-medium text-negative hover:underline disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-text-3 hover:underline">
          Cancel
        </button>
        {error && <span className="text-negative">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <Link href={`/jobs/${jobId}/billings/edit/${billingId}`} className="text-text-2 hover:underline">
        Edit
      </Link>
      <button type="button" onClick={() => setConfirming(true)} className="text-text-2 hover:underline">
        Delete
      </button>
    </div>
  );
}
