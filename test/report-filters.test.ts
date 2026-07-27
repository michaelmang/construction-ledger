import { describe, expect, it } from "vitest";
import { parseReportFilters, reportFilterQueryString } from "@/lib/report-filters";

describe("parseReportFilters", () => {
  it("parses jobId, asOf, and a single costType", () => {
    const filters = parseReportFilters({ jobId: "42", asOf: "2026-06-24", costType: "labor" });
    expect(filters.jobId).toBe(42);
    expect(filters.asOf?.toISOString().slice(0, 10)).toBe("2026-06-24");
    expect(filters.costTypes).toEqual(["labor"]);
  });

  it("parses multiple costType values from a <select multiple>", () => {
    const filters = parseReportFilters({ costType: ["labor", "material"] });
    expect(filters.costTypes).toEqual(["labor", "material"]);
  });

  it("drops unknown cost type values rather than passing them through", () => {
    const filters = parseReportFilters({ costType: ["labor", "not-a-real-type"] });
    expect(filters.costTypes).toEqual(["labor"]);
  });

  it("returns undefined for every field when nothing is set (unfiltered)", () => {
    const filters = parseReportFilters({});
    expect(filters.jobId).toBeUndefined();
    expect(filters.asOf).toBeUndefined();
    expect(filters.costTypes).toBeUndefined();
  });

  it("ignores a malformed date rather than throwing", () => {
    const filters = parseReportFilters({ asOf: "not-a-date" });
    expect(filters.asOf).toBeUndefined();
  });

  it("ignores a non-numeric jobId rather than throwing", () => {
    const filters = parseReportFilters({ jobId: "not-a-number" });
    expect(filters.jobId).toBeUndefined();
  });
});

describe("reportFilterQueryString", () => {
  it("builds an empty string when nothing is set", () => {
    expect(reportFilterQueryString({})).toBe("");
  });

  it("round-trips jobId, asOf, and multiple costType values", () => {
    const qs = reportFilterQueryString({ jobId: "7", asOf: "2026-06-24", costType: ["labor", "material"] });
    const params = new URLSearchParams(qs.replace(/^\?/, ""));
    expect(params.get("jobId")).toBe("7");
    expect(params.get("asOf")).toBe("2026-06-24");
    expect(params.getAll("costType")).toEqual(["labor", "material"]);
  });
});
