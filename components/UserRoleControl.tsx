"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserRole, revokeUser } from "@/app/actions/users";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  bookkeeper: "Bookkeeper",
  viewer: "Viewer",
};

// Mirrors components/JobStatusMenu.tsx's auto-submitting <select> pattern.
export function UserRoleControl({ email, role }: { email: string; role: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(newRole: string) {
    if (newRole === role) return;
    setSaving(true);
    setError(null);
    const result = await setUserRole({ email, role: newRole as "admin" | "bookkeeper" | "viewer" });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setSaving(false);
    router.refresh();
  }

  async function handleRevoke() {
    if (!confirm(`Revoke access for ${email}? They'll be signed out immediately.`)) return;
    setSaving(true);
    setError(null);
    const result = await revokeUser({ email });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-3">
      <select
        value={role}
        onChange={(e) => handleRoleChange(e.target.value)}
        disabled={saving}
        className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text disabled:opacity-40"
      >
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleRevoke}
        disabled={saving}
        className="text-xs text-negative hover:underline disabled:opacity-40"
      >
        Revoke
      </button>
      {error && <span className="text-xs text-negative">{error}</span>}
    </div>
  );
}
