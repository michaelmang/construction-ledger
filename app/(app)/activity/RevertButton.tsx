"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { revertActivity } from "@/app/actions/revert";
import { hapticTap, hapticSuccess, hapticError } from "@/lib/haptics";

export function RevertButton({ hash }: { hash: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  async function handleRevert() {
    setReverting(true);
    setError(null);
    const result = await revertActivity(hash);
    if (!result.ok) {
      hapticError();
      setError(result.error);
      setReverting(false);
      return;
    }
    hapticSuccess();
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <span className="text-text-2">Revert this entry?</span>
        <button
          type="button"
          onClick={handleRevert}
          disabled={reverting}
          className="font-medium text-negative hover:underline disabled:opacity-40"
        >
          {reverting ? "Reverting…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-text-3 hover:underline">
          Cancel
        </button>
        {error && <span className="text-negative">{error}</span>}
      </div>
    );
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => {
          hapticTap();
          setConfirming(true);
        }}
        className="text-text-2 hover:underline"
      >
        Revert this change
      </button>
    </div>
  );
}
