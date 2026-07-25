import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  computeWipSchedule,
  computeJobProfitability,
  computeCostCodeBreakdown,
  computeEstimatedTotalCost,
  computeRetainageAging,
  computeArAging,
  computeApAging,
  computeCostTypePivot,
  computeCostTypePivotByJob,
} from "@/lib/wip";

const d = (v: string) => new Decimal(v);

describe("computeWipSchedule", () => {
  it("matches a hand-computed worked example", () => {
    // contract 150,000 + 12,000 approved COs = revised 162,000
    // costs to date 40,500 / estimated total cost 135,000 = 30% complete
    // earned revenue = 30% * 162,000 = 48,600
    // billed to date 45,000 -> underbilled by 3,600 (45,000 - 48,600)
    const result = computeWipSchedule({
      contractValue: d("150000"),
      approvedChangeOrdersTotal: d("12000"),
      costsToDate: d("40500"),
      estimatedTotalCost: d("135000"),
      billedToDate: d("45000"),
    });

    expect(result.revisedContractValue.toFixed(2)).toBe("162000.00");
    expect(result.pctComplete.toFixed(4)).toBe("0.3000");
    expect(result.earnedRevenue.toFixed(2)).toBe("48600.00");
    expect(result.overUnderBilling.toFixed(2)).toBe("-3600.00");

    const profitability = computeJobProfitability(result);
    expect(profitability.projectedMargin.toFixed(2)).toBe("27000.00");
    expect(profitability.actualMarginToDate.toFixed(2)).toBe("8100.00");
  });

  it("guards against division by zero when estimated total cost is 0", () => {
    const result = computeWipSchedule({
      contractValue: d("100000"),
      approvedChangeOrdersTotal: d("0"),
      costsToDate: d("0"),
      estimatedTotalCost: d("0"),
      billedToDate: d("5000"),
    });

    expect(result.pctComplete.toFixed(2)).toBe("0.00");
    expect(result.earnedRevenue.toFixed(2)).toBe("0.00");
    expect(result.overUnderBilling.toFixed(2)).toBe("5000.00");
  });

  it("reports overbilling as a positive number", () => {
    const result = computeWipSchedule({
      contractValue: d("200000"),
      approvedChangeOrdersTotal: d("0"),
      costsToDate: d("50000"),
      estimatedTotalCost: d("200000"),
      billedToDate: d("60000"),
    });
    // earned = 25% * 200,000 = 50,000; billed 60,000 -> overbilled by 10,000
    expect(result.overUnderBilling.toFixed(2)).toBe("10000.00");
  });
});

describe("computeCostCodeBreakdown", () => {
  it("uses budgetedAmount when there is no revised estimate", () => {
    const [row] = computeCostCodeBreakdown([
      {
        costCodeId: 1,
        costCode: "03-CONCRETE",
        costCodeName: "Concrete",
        budgetedAmount: d("42000"),
        revisedEstimate: null,
        actual: d("30000"),
      },
    ]);
    expect(row.estimatedAtCompletion.toFixed(2)).toBe("42000.00");
    expect(row.remaining.toFixed(2)).toBe("12000.00");
  });

  it("prefers the revised estimate and reports negative remaining when over budget", () => {
    const [row] = computeCostCodeBreakdown([
      {
        costCodeId: 1,
        costCode: "03-CONCRETE",
        costCodeName: "Concrete",
        budgetedAmount: d("42000"),
        revisedEstimate: d("48000"),
        actual: d("50000"),
      },
    ]);
    expect(row.estimatedAtCompletion.toFixed(2)).toBe("48000.00");
    expect(row.remaining.toFixed(2)).toBe("-2000.00");
  });
});

describe("computeEstimatedTotalCost", () => {
  it("sums estimate-at-completion across cost codes, mixing revised and original", () => {
    const total = computeEstimatedTotalCost([
      { budgetedAmount: d("42000"), revisedEstimate: d("48000") },
      { budgetedAmount: d("38000"), revisedEstimate: null },
    ]);
    expect(total.toFixed(2)).toBe("86000.00");
  });
});

describe("computeRetainageAging", () => {
  it("computes days outstanding since each billing date", () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const [row] = computeRetainageAging(
      [
        {
          billingDate: new Date("2026-06-09T00:00:00Z"), // 45 days before asOf
          periodLabel: "Pay App #4",
          retainageWithheld: d("1800"),
        },
      ],
      asOf,
    );
    expect(row.daysOutstanding).toBe(45);
  });

  it("floors days outstanding at 0 for a future-dated billing", () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const [row] = computeRetainageAging(
      [
        {
          billingDate: new Date("2026-08-01T00:00:00Z"),
          periodLabel: null,
          retainageWithheld: d("500"),
        },
      ],
      asOf,
    );
    expect(row.daysOutstanding).toBe(0);
  });
});

describe("computeArAging", () => {
  it("computes amount due (net billed minus paid) and days outstanding", () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const [row] = computeArAging(
      [
        {
          billingId: 1,
          periodLabel: "Pay App #1",
          billingDate: new Date("2026-06-24T00:00:00Z"), // 30 days before asOf
          netBilled: d("18000"),
          paidAmount: d("5000"),
        },
      ],
      asOf,
    );
    expect(row.amountDue.toFixed(2)).toBe("13000.00");
    expect(row.daysOutstanding).toBe(30);
  });

  it("excludes fully paid billings", () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const rows = computeArAging(
      [
        {
          billingId: 1,
          periodLabel: "Pay App #1",
          billingDate: new Date("2026-06-24T00:00:00Z"),
          netBilled: d("18000"),
          paidAmount: d("18000"),
        },
      ],
      asOf,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("computeApAging", () => {
  it("computes amount due (amount minus retainage minus paid) and days outstanding", () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const [row] = computeApAging(
      [
        {
          billId: 1,
          vendorName: "Ridge Framing Sub",
          description: "Framing",
          billDate: new Date("2026-06-14T00:00:00Z"), // 40 days before asOf
          amount: d("8000"),
          retainageWithheld: d("800"),
          paidAmount: d("2000"),
        },
      ],
      asOf,
    );
    expect(row.amountDue.toFixed(2)).toBe("5200.00");
    expect(row.daysOutstanding).toBe(40);
  });

  it("excludes fully paid bills", () => {
    const asOf = new Date("2026-07-24T00:00:00Z");
    const rows = computeApAging(
      [
        {
          billId: 1,
          vendorName: "Vendor",
          description: null,
          billDate: new Date("2026-06-14T00:00:00Z"),
          amount: d("1000"),
          retainageWithheld: d("0"),
          paidAmount: d("1000"),
        },
      ],
      asOf,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("computeCostTypePivot", () => {
  it("buckets amounts by cost code x cost type and totals correctly", () => {
    // Concrete: 4200 material + 331 labor. Carpentry: 8000 subcontract, no labor/material.
    // A stray 500 with no costtype tag lands in "untyped", not silently dropped.
    const rows = computeCostTypePivot(
      [
        { costCodeId: 1, costCode: "03-CONCRETE", costCodeName: "Concrete" },
        { costCodeId: 2, costCode: "06-CARPENTRY", costCodeName: "Carpentry" },
      ],
      [
        { key: 1, costType: "material", amount: d("4200") },
        { key: 1, costType: "labor", amount: d("331") },
        { key: 1, costType: "untyped", amount: d("500") },
        { key: 2, costType: "subcontract", amount: d("8000") },
      ],
    );

    expect(rows).toHaveLength(2);
    const concrete = rows[0];
    expect(concrete.material.toFixed(2)).toBe("4200.00");
    expect(concrete.labor.toFixed(2)).toBe("331.00");
    expect(concrete.untyped.toFixed(2)).toBe("500.00");
    expect(concrete.subcontract.toFixed(2)).toBe("0.00");
    expect(concrete.equipment.toFixed(2)).toBe("0.00");
    expect(concrete.other.toFixed(2)).toBe("0.00");
    expect(concrete.total.toFixed(2)).toBe("5031.00"); // 4200 + 331 + 500

    const carpentry = rows[1];
    expect(carpentry.subcontract.toFixed(2)).toBe("8000.00");
    expect(carpentry.total.toFixed(2)).toBe("8000.00");
  });

  it("a cost code with no matching amounts has all-zero buckets, not a missing row", () => {
    const rows = computeCostTypePivot(
      [{ costCodeId: 9, costCode: "99-UNUSED", costCodeName: "Unused" }],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total.toFixed(2)).toBe("0.00");
  });
});

describe("computeCostTypePivotByJob", () => {
  it("buckets amounts by job x cost type across cost codes", () => {
    // Job A: 4200 material (concrete) + 8000 subcontract (carpentry) = 12200 total.
    // Job B: 331 labor only.
    const rows = computeCostTypePivotByJob(
      [
        { jobId: 10, jobCode: "J-A", jobName: "Job A" },
        { jobId: 11, jobCode: "J-B", jobName: "Job B" },
      ],
      [
        { key: 10, costType: "material", amount: d("4200") },
        { key: 10, costType: "subcontract", amount: d("8000") },
        { key: 11, costType: "labor", amount: d("331") },
      ],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].total.toFixed(2)).toBe("12200.00");
    expect(rows[0].material.toFixed(2)).toBe("4200.00");
    expect(rows[0].subcontract.toFixed(2)).toBe("8000.00");
    expect(rows[1].total.toFixed(2)).toBe("331.00");
    expect(rows[1].labor.toFixed(2)).toBe("331.00");
  });
});
