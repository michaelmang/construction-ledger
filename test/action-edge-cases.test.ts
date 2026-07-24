import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Server actions call revalidatePath(), which throws outside a real Next.js
// request context ("Invariant: static generation store missing"). Stub it so
// these actions can run directly in a test process.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { createJob } from "@/app/actions/jobs";
import { recordExpense } from "@/app/actions/expenses";
import { createProgressBilling } from "@/app/actions/billings";
import { createVendor } from "@/app/actions/vendors";

describe("action edge cases (Phase 5 hardening)", () => {
  let journalDir: string;
  const createdJobIds: number[] = [];
  const createdCostCodeIds: number[] = [];
  const createdVendorIds: number[] = [];

  beforeAll(async () => {
    journalDir = await mkdtemp(path.join(tmpdir(), "edge-case-test-"));
    process.env.JOURNAL_DIR = journalDir;
    await promisify(execFile)("git", ["init"], { cwd: journalDir });
  });

  afterEach(async () => {
    for (const jobId of createdJobIds.splice(0)) {
      await prisma.bill.deleteMany({ where: { jobId } });
      await prisma.journalTxn.deleteMany({ where: { jobId } });
      await prisma.progressBilling.deleteMany({ where: { jobId } });
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }
    for (const id of createdCostCodeIds.splice(0)) {
      await prisma.costCode.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdVendorIds.splice(0)) {
      await prisma.vendor.delete({ where: { id } }).catch(() => {});
    }
  });

  afterAll(async () => {
    await rm(journalDir, { recursive: true, force: true });
  });

  it("rejects a duplicate job code with a friendly message", async () => {
    const code = `EDGE-${Date.now()}`;
    const first = await createJob({ code, name: "First" });
    expect(first.ok).toBe(true);
    if (first.ok) createdJobIds.push(first.data.id);

    const second = await createJob({ code, name: "Second" });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toContain("already in use");
    }
  });

  it("rejects an expense against an archived job", async () => {
    const code = `EDGE-${Date.now()}-archived`;
    const jobResult = await createJob({ code, name: "Archived Job" });
    expect(jobResult.ok).toBe(true);
    if (!jobResult.ok) return;
    createdJobIds.push(jobResult.data.id);
    await prisma.job.update({ where: { id: jobResult.data.id }, data: { status: "archived" } });

    const costCode = await prisma.costCode.create({
      data: { code: `EDGE-CC-${Date.now()}`, name: "Edge Cost Code" },
    });
    createdCostCodeIds.push(costCode.id);

    const vendorResult = await createVendor({ name: `Edge Vendor ${Date.now()}` });
    expect(vendorResult.ok).toBe(true);
    if (!vendorResult.ok) return;
    createdVendorIds.push(vendorResult.data.id);

    const result = await recordExpense({
      jobId: jobResult.data.id,
      costCodeId: costCode.id,
      vendorId: vendorResult.data.id,
      amount: "100.00",
      date: "2026-07-24",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("archived");
    }
  });

  it("rejects negative retainage withheld on a progress billing", async () => {
    const code = `EDGE-${Date.now()}-retainage`;
    const jobResult = await createJob({ code, name: "Retainage Job", contractValue: "50000" });
    expect(jobResult.ok).toBe(true);
    if (!jobResult.ok) return;
    createdJobIds.push(jobResult.data.id);

    const result = await createProgressBilling({
      jobId: jobResult.data.id,
      billingDate: "2026-07-24",
      amountBilled: "10000",
      retainageWithheld: "-500",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain("negative");
    }
  });

  it("allows over-billing (billed > revised contract value) but returns a warning", async () => {
    const code = `EDGE-${Date.now()}-overbill`;
    const jobResult = await createJob({ code, name: "Overbill Job", contractValue: "1000.00" });
    expect(jobResult.ok).toBe(true);
    if (!jobResult.ok) return;
    createdJobIds.push(jobResult.data.id);

    const result = await createProgressBilling({
      jobId: jobResult.data.id,
      billingDate: "2026-07-24",
      amountBilled: "1500.00",
      retainageWithheld: "0",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("exceeds the revised contract value");
    }
  });
});
