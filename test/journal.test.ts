import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Decimal from "decimal.js";
import {
  deleteEntry,
  formatEntry,
  JournalValidationError,
  replaceEntry,
  writeEntry,
} from "@/lib/journal";

describe("formatEntry", () => {
  it("formats a balanced two-posting entry with tags", () => {
    const text = formatEntry({
      date: "2026-07-24",
      description: "Ace Concrete Supply - footings pour",
      tags: { job: "J2026-014", code: "03-CONCRETE", txnid: "abc-123" },
      postings: [
        { account: "expenses:jobs:J2026-014:03-CONCRETE", amount: new Decimal("4200.00") },
        {
          account: "liabilities:accounts payable:ace concrete",
          amount: new Decimal("-4200.00"),
        },
      ],
    });

    expect(text).toContain("2026-07-24 Ace Concrete Supply - footings pour");
    expect(text).toContain("; job:J2026-014, code:03-CONCRETE, txnid:abc-123");
    expect(text).toContain("expenses:jobs:J2026-014:03-CONCRETE");
    expect(text).toContain("4200.00 USD");
    expect(text).toContain("-4200.00 USD");
  });

  it("rejects postings that do not sum to zero", () => {
    expect(() =>
      formatEntry({
        date: "2026-07-24",
        description: "bad entry",
        tags: {},
        postings: [
          { account: "expenses:jobs:X", amount: new Decimal("100.00") },
          { account: "liabilities:accounts payable:x", amount: new Decimal("-99.00") },
        ],
      }),
    ).toThrow(JournalValidationError);
  });

  it("rejects entries with fewer than two postings", () => {
    expect(() =>
      formatEntry({
        date: "2026-07-24",
        description: "bad entry",
        tags: {},
        postings: [{ account: "expenses:jobs:X", amount: new Decimal("100.00") }],
      }),
    ).toThrow(JournalValidationError);
  });
});

describe("writeEntry / replaceEntry / deleteEntry", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "journal-test-"));
    process.env.JOURNAL_DIR = dir;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("routes an entry to the correct year file and links it from main.journal", async () => {
    const { txnid } = await writeEntry({
      date: "2026-07-24",
      description: "Test expense",
      tags: { job: "J1" },
      postings: [
        { account: "expenses:jobs:J1:concrete", amount: new Decimal("100.00") },
        { account: "liabilities:accounts payable:vendor", amount: new Decimal("-100.00") },
      ],
    });

    expect(txnid).toBeTruthy();

    const main = await readFile(path.join(dir, "main.journal"), "utf8");
    expect(main).toContain("include 2026.journal");

    const year = await readFile(path.join(dir, "2026.journal"), "utf8");
    expect(year).toContain(`txnid:${txnid}`);
    expect(year).toContain("Test expense");
  });

  it("appends multiple entries separated by exactly one blank line", async () => {
    await writeEntry({
      date: "2026-07-01",
      description: "First",
      tags: {},
      postings: [
        { account: "expenses:jobs:J1:a", amount: new Decimal("10.00") },
        { account: "liabilities:accounts payable:v", amount: new Decimal("-10.00") },
      ],
    });
    await writeEntry({
      date: "2026-07-02",
      description: "Second",
      tags: {},
      postings: [
        { account: "expenses:jobs:J1:b", amount: new Decimal("20.00") },
        { account: "liabilities:accounts payable:v", amount: new Decimal("-20.00") },
      ],
    });

    const year = await readFile(path.join(dir, "2026.journal"), "utf8");
    const blocks = year.split(/\n\n+/).filter((b) => b.trim().length > 0);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("First");
    expect(blocks[1]).toContain("Second");
  });

  it("replaces an entry in place by txnid", async () => {
    const { txnid } = await writeEntry({
      date: "2026-07-24",
      description: "Original",
      tags: { job: "J1" },
      postings: [
        { account: "expenses:jobs:J1:concrete", amount: new Decimal("100.00") },
        { account: "liabilities:accounts payable:vendor", amount: new Decimal("-100.00") },
      ],
    });

    await replaceEntry(txnid, {
      date: "2026-07-24",
      description: "Corrected",
      tags: { job: "J1" },
      postings: [
        { account: "expenses:jobs:J1:concrete", amount: new Decimal("150.00") },
        { account: "liabilities:accounts payable:vendor", amount: new Decimal("-150.00") },
      ],
    });

    const year = await readFile(path.join(dir, "2026.journal"), "utf8");
    expect(year).toContain("Corrected");
    expect(year).not.toContain("Original");
    expect(year).toContain(`txnid:${txnid}`);
    const blocks = year.split(/\n\n+/).filter((b) => b.trim().length > 0);
    expect(blocks).toHaveLength(1);
  });

  it("removes an entry by txnid", async () => {
    const { txnid } = await writeEntry({
      date: "2026-07-24",
      description: "To delete",
      tags: {},
      postings: [
        { account: "expenses:jobs:J1:concrete", amount: new Decimal("100.00") },
        { account: "liabilities:accounts payable:vendor", amount: new Decimal("-100.00") },
      ],
    });
    await writeEntry({
      date: "2026-07-25",
      description: "Keep me",
      tags: {},
      postings: [
        { account: "expenses:jobs:J1:concrete", amount: new Decimal("50.00") },
        { account: "liabilities:accounts payable:vendor", amount: new Decimal("-50.00") },
      ],
    });

    await deleteEntry(txnid);

    const year = await readFile(path.join(dir, "2026.journal"), "utf8");
    expect(year).not.toContain("To delete");
    expect(year).toContain("Keep me");
  });

  it("throws when replacing/deleting a txnid that doesn't exist", async () => {
    await expect(
      replaceEntry("nonexistent", {
        date: "2026-07-24",
        description: "x",
        tags: {},
        postings: [
          { account: "a", amount: new Decimal("1") },
          { account: "b", amount: new Decimal("-1") },
        ],
      }),
    ).rejects.toThrow(JournalValidationError);

    await expect(deleteEntry("nonexistent")).rejects.toThrow(JournalValidationError);
  });
});
