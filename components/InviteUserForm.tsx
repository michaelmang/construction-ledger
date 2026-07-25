"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "@/app/actions/users";
import { Field, inputClass, primaryButtonClass } from "@/components/form";

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "bookkeeper" | "viewer">("bookkeeper");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await setUserRole({ email, role });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setEmail("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="text-sm text-negative">{error}</div>}
      <Field label="Email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={inputClass}
        />
      </Field>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "bookkeeper" | "viewer")}
          className={inputClass}
        >
          <option value="admin">Admin</option>
          <option value="bookkeeper">Bookkeeper</option>
          <option value="viewer">Viewer</option>
        </select>
      </Field>
      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
