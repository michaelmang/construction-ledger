"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setJobStatus } from "@/app/actions/jobs";
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { pillToneClasses, PillTone } from "@/components/ui/Pill";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  complete: "Complete",
  archived: "Archived",
};

const STATUS_TONE: Record<string, PillTone> = {
  active: "positive",
  complete: "neutral",
  archived: "negative",
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
      hapticError();
      setError(result.error);
      setSaving(false);
      return;
    }
    hapticSuccess();
    router.refresh();
  }

  return (
    <div className="text-right">
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={`rounded-full border-0 py-0.5 pl-3 pr-6 text-xs font-medium capitalize ${pillToneClasses(STATUS_TONE[status] ?? "neutral")}`}
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
