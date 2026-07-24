"use client";

import { inputClass } from "@/components/form";

export interface VendorOption {
  id: number;
  name: string;
}

// Shared by every form that records a bill (job expense, overhead expense):
// pick an existing vendor or create one inline. Keeps vendor selection
// consistent so AP account slugs never fork on a typo (v2 spec §F6).
export function VendorPicker({
  vendors,
  value,
  onChange,
  newName,
  onNewNameChange,
}: {
  vendors: VendorOption[];
  value: number | "new" | "";
  onChange: (value: number | "new" | "") => void;
  newName: string;
  onNewNameChange: (value: string) => void;
}) {
  return (
    <div>
      <select
        className={inputClass}
        value={value}
        onChange={(e) =>
          onChange(e.target.value === "new" ? "new" : e.target.value ? Number(e.target.value) : "")
        }
        required
      >
        <option value="">Select vendor…</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
        <option value="new">+ New vendor…</option>
      </select>
      {value === "new" && (
        <input
          className={`${inputClass} mt-2`}
          placeholder="Vendor name"
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
        />
      )}
    </div>
  );
}
