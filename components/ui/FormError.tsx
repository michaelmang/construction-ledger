"use client";

import { useEffect, useRef } from "react";

// Shared replacement for the inline error banner every write form rendered
// ad hoc (low-ticket sweep, V4 spec Phase 3: "focus isn't moved to the
// error summary on failure"). role="alert" gets it announced immediately by
// screen readers; the focus effect below moves keyboard/AT focus to it the
// moment a submit fails, since a sighted user notices a red banner appearing
// but a screen reader user gets nothing unless focus moves.
export function FormError({ error }: { error: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);

  if (!error) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-negative/30 bg-negative-soft px-4 py-2 text-sm text-negative focus:outline-none"
    >
      {error}
    </div>
  );
}
