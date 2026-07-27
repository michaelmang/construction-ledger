"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createWorkersCompRate,
  updateWorkersCompRate,
  setWorkersCompRateActive,
} from "@/app/actions/labor-burden-settings";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/form";
import { FormError } from "@/components/ui/FormError";
import {
  tableWrapClass,
  tableClass,
  theadClass,
  thClass,
  tbodyClass,
  trClass,
  tdClass,
} from "@/components/table";

export interface WorkersCompRateRow {
  id: number;
  code: string;
  description: string;
  rate: string;
  active: boolean;
}

function ActiveToggle({ id, active }: { id: number; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    await setWorkersCompRateActive({ id, active: !active });
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

function EditRow({
  row,
  onDone,
}: {
  row: WorkersCompRateRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(row.code);
  const [description, setDescription] = useState(row.description);
  const [rate, setRate] = useState(row.rate);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const result = await updateWorkersCompRate({ id: row.id, code, description, rate });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <tr className={trClass}>
      <td className={tdClass} colSpan={5}>
        <div className="flex flex-wrap items-end gap-2">
          <input className={`w-24 ${inputClass}`} value={code} onChange={(e) => setCode(e.target.value)} />
          <input
            className={`w-48 ${inputClass}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className={`w-28 ${inputClass}`}
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className={primaryButtonClass}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onDone} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
        <FormError error={error} />
      </td>
    </tr>
  );
}

export function WorkersCompRateTable({ rates }: { rates: WorkersCompRateRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRate, setNewRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createWorkersCompRate({
      code: newCode,
      description: newDescription,
      rate: newRate,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewCode("");
    setNewDescription("");
    setNewRate("");
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Code</th>
              <th className={thClass}>Description</th>
              <th className={thClass}>Rate</th>
              <th className={thClass}>Status</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {rates.map((r) =>
              editingId === r.id ? (
                <EditRow key={r.id} row={r} onDone={() => setEditingId(null)} />
              ) : (
                <tr key={r.id} className={trClass}>
                  <td className={tdClass}>{r.code}</td>
                  <td className={tdClass}>{r.description}</td>
                  <td className={tdClass}>{r.rate}</td>
                  <td className={tdClass}>
                    <ActiveToggle id={r.id} active={r.active} />
                  </td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => setEditingId(r.id)}
                      className="text-text-2 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3"
        >
          <FormError error={error} />
          <input
            className={`w-24 ${inputClass}`}
            placeholder="Code"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            required
          />
          <input
            className={`w-48 ${inputClass}`}
            placeholder="Description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            required
          />
          <input
            className={`w-28 ${inputClass}`}
            inputMode="decimal"
            placeholder="Rate"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className={secondaryButtonClass}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={secondaryButtonClass}>
          + Add Workers&apos; Comp Rate
        </button>
      )}
    </div>
  );
}
