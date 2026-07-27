"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, updateEmployee } from "@/app/actions/employees";
import { inputClass, primaryButtonClass, Field } from "@/components/form";
import { FormError } from "@/components/ui/FormError";
import { todayIso } from "@/lib/date-utc";

export interface WorkersCompRateOption {
  id: number;
  code: string;
  description: string;
}

export interface EmployeeInitial {
  id: number;
  name: string;
  number: string;
  jobTitle: string;
  payType: "salary" | "hourly";
  employmentType: "full_time" | "part_time" | "seasonal" | "intern";
  wcCodeId: number | "";
  startDate: string;
  holidayDays: string; // "" = inherit company default
  discretionaryPtoHours: string;
  currentPay: string;
  healthInsMonthly: string;
  retirementPct: string;
  yearlyVehicleValue: string;
}

const EMPLOYMENT_TYPE_LABEL: Record<EmployeeInitial["employmentType"], string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  seasonal: "Seasonal",
  intern: "Intern",
};

// Create (no `initial` prop, renders inline on /employees) and edit (an
// `initial` prop, renders on /employees/[id]/edit) share this one form —
// same dual-mode shape already established by
// app/(app)/jobs/[id]/transactions/labor/edit/[txnid]/LaborForm.tsx.
export function EmployeeForm({
  wcCodes,
  companyHolidayDays,
  initial,
}: {
  wcCodes: WorkersCompRateOption[];
  companyHolidayDays: number;
  initial?: EmployeeInitial;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [payType, setPayType] = useState<EmployeeInitial["payType"]>(initial?.payType ?? "hourly");
  const [employmentType, setEmploymentType] = useState<EmployeeInitial["employmentType"]>(
    initial?.employmentType ?? "full_time",
  );
  const [wcCodeId, setWcCodeId] = useState<number | "">(initial?.wcCodeId ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [holidayDays, setHolidayDays] = useState(initial?.holidayDays ?? "");
  const [discretionaryPtoHours, setDiscretionaryPtoHours] = useState(
    initial?.discretionaryPtoHours ?? "",
  );
  const [currentPay, setCurrentPay] = useState(initial?.currentPay ?? "");
  const [healthInsMonthly, setHealthInsMonthly] = useState(initial?.healthInsMonthly ?? "");
  const [retirementPct, setRetirementPct] = useState(initial?.retirementPct ?? "");
  const [yearlyVehicleValue, setYearlyVehicleValue] = useState(initial?.yearlyVehicleValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name,
      number: number || undefined,
      jobTitle: jobTitle || undefined,
      payType,
      employmentType,
      wcCodeId: wcCodeId || undefined,
      startDate: startDate || undefined,
      holidayDays: holidayDays === "" ? undefined : Number(holidayDays),
      discretionaryPtoHours: discretionaryPtoHours || undefined,
      currentPay,
      healthInsMonthly: healthInsMonthly || undefined,
      retirementPct: retirementPct || undefined,
      yearlyVehicleValue: yearlyVehicleValue || undefined,
    };

    const result = initial
      ? await updateEmployee({ id: initial.id, ...payload })
      : await createEmployee(payload);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    if (initial) {
      router.push("/employees");
    } else {
      setName("");
      setNumber("");
      setJobTitle("");
      setWcCodeId("");
      setStartDate(todayIso());
      setHolidayDays("");
      setDiscretionaryPtoHours("");
      setCurrentPay("");
      setHealthInsMonthly("");
      setRetirementPct("");
      setYearlyVehicleValue("");
      setSubmitting(false);
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={initial ? "max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-6" : "space-y-4 rounded-lg border border-border bg-surface p-4"}
    >
      <FormError error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input
            className={inputClass}
            placeholder="Jane Rivera"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Number" hint="optional">
          <input className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Job Title" hint="optional">
          <input className={inputClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Pay Type">
          <select
            className={inputClass}
            value={payType}
            onChange={(e) => setPayType(e.target.value as EmployeeInitial["payType"])}
          >
            <option value="hourly">Hourly</option>
            <option value="salary">Salary</option>
          </select>
        </Field>
        <Field label="Employment Type">
          <select
            className={inputClass}
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as EmployeeInitial["employmentType"])}
          >
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Workers' Comp Code" hint="optional">
          <select
            className={inputClass}
            value={wcCodeId}
            onChange={(e) => setWcCodeId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Unclassified (0%)</option>
            {wcCodes.map((wc) => (
              <option key={wc.id} value={wc.id}>
                {wc.description} ({wc.code})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Start Date" hint="for PTO tenure accrual">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Holiday Days" hint={`optional, defaults to ${companyHolidayDays}`}>
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder={String(companyHolidayDays)}
            value={holidayDays}
            onChange={(e) => setHolidayDays(e.target.value)}
          />
        </Field>
        <Field label="Discretionary PTO Hours" hint="optional">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0"
            value={discretionaryPtoHours}
            onChange={(e) => setDiscretionaryPtoHours(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Current Pay" hint={payType === "salary" ? "$/yr" : "$/hr"}>
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder={payType === "salary" ? "75000.00" : "28.00"}
            value={currentPay}
            onChange={(e) => setCurrentPay(e.target.value)}
            required
          />
        </Field>
        <Field label="Health Insurance" hint="$/mo, optional">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0"
            value={healthInsMonthly}
            onChange={(e) => setHealthInsMonthly(e.target.value)}
          />
        </Field>
        <Field label="Retirement Match" hint="decimal fraction, optional">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0.03"
            value={retirementPct}
            onChange={(e) => setRetirementPct(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Yearly Vehicle Value" hint="$, optional">
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0"
          value={yearlyVehicleValue}
          onChange={(e) => setYearlyVehicleValue(e.target.value)}
        />
      </Field>

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : initial ? "Save Changes" : "Add Employee"}
      </button>
    </form>
  );
}
