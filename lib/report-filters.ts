// Shared "job / as-of date / cost type" filter parsing for every report
// page and CSV route under app/(app)/reports and app/api/reports (v6 spec:
// report filters). One parser so a page's on-screen filter state and its
// "Download CSV" link always agree — both read the same searchParams shape.
import { parseIsoDate } from "./date-utc";
import { COST_TYPES, CostType } from "./cost-types";

export interface ReportFilterParams {
  jobId?: string;
  asOf?: string;
  costType?: string | string[];
}

export interface ReportFilterOptions {
  asOf?: Date; // undefined = today (each lib/reports.ts function's own existing default)
  jobId?: number; // undefined = all jobs
  costTypes?: CostType[]; // undefined = all types
}

function isCostType(value: string): value is CostType {
  return (COST_TYPES as readonly string[]).includes(value);
}

export function parseReportFilters(params: ReportFilterParams): ReportFilterOptions {
  const asOf = parseIsoDate(params.asOf) ?? undefined;
  const jobId = params.jobId ? Number(params.jobId) : undefined;
  const rawCostTypes = params.costType === undefined
    ? []
    : Array.isArray(params.costType)
      ? params.costType
      : [params.costType];
  const costTypes = rawCostTypes.filter(isCostType);

  return {
    asOf,
    jobId: jobId !== undefined && !Number.isNaN(jobId) ? jobId : undefined,
    costTypes: costTypes.length > 0 ? costTypes : undefined,
  };
}

// Builds a query string from the raw (unparsed) params — used by every
// report page's "Download CSV" link so the on-screen filters and the
// downloaded CSV always match. Takes the raw shape (not ReportFilterOptions)
// so multi-value costType survives round-tripping through a <select multiple>.
export function reportFilterQueryString(raw: ReportFilterParams): string {
  const params = new URLSearchParams();
  if (raw.jobId) params.set("jobId", raw.jobId);
  if (raw.asOf) params.set("asOf", raw.asOf);
  const costTypes = raw.costType === undefined
    ? []
    : Array.isArray(raw.costType)
      ? raw.costType
      : [raw.costType];
  for (const c of costTypes) params.append("costType", c);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
