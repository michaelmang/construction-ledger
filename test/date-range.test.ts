import { describe, expect, it } from "vitest";
import { resolveDateRangeParams } from "@/lib/date-range";

describe("resolveDateRangeParams", () => {
  it("accepts a valid inclusive custom range", () => {
    const range = resolveDateRangeParams({ from: "2026-06-01", to: "2026-07-24" });
    expect(range).toMatchObject({ preset: null });
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-07-24");
  });

  it("falls back to the default preset for malformed or reversed custom dates", () => {
    expect(resolveDateRangeParams({ from: "2026-02-30", to: "2026-03-01" }).preset).toBe("3m");
    expect(resolveDateRangeParams({ from: "2026-07-25", to: "2026-07-24" }).preset).toBe("3m");
  });
});
