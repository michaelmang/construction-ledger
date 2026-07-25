"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setEmployeeActive } from "@/app/actions/employees";

export function EmployeeActiveToggle({ id, active }: { id: number; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    await setEmployeeActive({ id, active: !active });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
        active ? "bg-positive-soft text-positive" : "bg-surface-2 text-text-2"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </button>
  );
}
