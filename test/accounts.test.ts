import { describe, expect, it } from "vitest";
import { humanizeAccount } from "@/lib/accounts";

describe("humanizeAccount", () => {
  it("drops the type segment and title-cases the rest", () => {
    expect(humanizeAccount("assets:accounts receivable:J2026-014")).toBe(
      "Accounts Receivable — J2026-014",
    );
  });

  it("handles vendor accounts", () => {
    expect(humanizeAccount("liabilities:accounts payable:ace concrete supply")).toBe(
      "Accounts Payable — Ace Concrete Supply",
    );
  });

  it("handles job cost-code expense accounts", () => {
    expect(humanizeAccount("expenses:jobs:J2026-014:03-CONCRETE")).toBe(
      "Jobs — J2026-014 — 03-CONCRETE",
    );
  });
});
