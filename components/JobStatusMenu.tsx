"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setJobStatus } from "@/app/actions/jobs";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  complete: "Complete",
  archived: "Archived",
};

const STATUS_CLASSES: Record<string, string> = {
  active: "bg-positive-soft text-positive",
  complete: "bg-surface-2 text-text-2",
  archived: "bg-negative-soft text-negative",
};

export function JobStatusMenu({ jobId, status }: { jobId: number; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleChange(newStatus: string) {
    if (newStatus === status) return;
    setSaving(true);
    setError(null);
    const result = await setJobStatus({ jobId, status: newStatus as "active" | "complete" | "archived" });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLASSES[status] ?? "bg-surface-2 text-text-2"}`}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && <div className="mt-1 text-xs text-negative">{error}</div>}
    </div>
  );
}
