import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("joins headers and rows with commas and trailing newline", () => {
    const csv = toCsv(
      ["Job", "Amount"],
      [
        ["J2026-014", "4200.00"],
        ["J2026-015", 100],
      ],
    );
    expect(csv).toBe("Job,Amount\nJ2026-014,4200.00\nJ2026-015,100\n");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    const csv = toCsv(["Description"], [['Ace "Best" Concrete, Inc.']]);
    expect(csv).toBe('Description\n"Ace ""Best"" Concrete, Inc."\n');
  });
});
