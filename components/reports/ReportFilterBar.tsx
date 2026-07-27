import { COST_TYPES, COST_TYPE_LABEL } from "@/lib/cost-types";
import { ReportFilterParams } from "@/lib/report-filters";

export interface ReportFilterJob {
  id: number;
  code: string;
  name: string;
}

const filterInputClass =
  "rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

// Plain GET form, mirroring app/(app)/job-costing/page.tsx's filter bar —
// every report page renders this with the exact searchParams it received,
// so the "Filter" submit and the "Download CSV" link (built from the same
// raw params in each page) never disagree about what's currently applied.
export function ReportFilterBar({
  basePath,
  jobs,
  raw,
  showCostTypes,
  jobRequired,
}: {
  basePath: string;
  jobs: ReportFilterJob[];
  raw: ReportFilterParams;
  showCostTypes?: boolean;
  jobRequired?: boolean;
}) {
  const selectedCostTypes = raw.costType === undefined
    ? []
    : Array.isArray(raw.costType)
      ? raw.costType
      : [raw.costType];

  return (
    <form className="flex flex-wrap items-end gap-2" action={basePath}>
      <div>
        <label className="block text-xs text-text-3">Job</label>
        <select name="jobId" defaultValue={raw.jobId ?? ""} className={filterInputClass}>
          {!jobRequired && <option value="">All Jobs</option>}
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} ({j.code})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-text-3">As Of</label>
        <input
          type="date"
          name="asOf"
          defaultValue={raw.asOf ?? ""}
          className={filterInputClass}
        />
      </div>
      {showCostTypes && (
        <div>
          <label className="block text-xs text-text-3">Cost Type</label>
          <select
            name="costType"
            multiple
            defaultValue={selectedCostTypes}
            className={`${filterInputClass} h-[70px]`}
          >
            {COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2"
      >
        Filter
      </button>
    </form>
  );
}
