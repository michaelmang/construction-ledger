import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  computeLaborBurden,
  tenureYears,
  resolvePtoAccrualPct,
  burdenDeltaPct,
  CompanyAssumptions,
} from "@/lib/labor-burden";

// Mirrors the friend-provided Excel workbook's own Assumptions tab exactly
// (v5 spec job costing) — the same constants scripts/seed-demo.ts seeds.
const company: CompanyAssumptions = {
  sickTimeAccrualPct: "0.033",
  companyHolidayDays: 13,
  avgHoursPerYear: "2000",
  ficaPct: "0.0765",
  futaPct: "0.006",
  stateUnemploymentPct: "0.013",
  ptoTiers: [
    { minTenureYears: 0, accrualPct: "0.01" },
    { minTenureYears: 1, accrualPct: "0.022" },
    { minTenureYears: 2, accrualPct: "0.042" },
    { minTenureYears: 5, accrualPct: "0.062" },
  ],
};

describe("computeLaborBurden", () => {
  it("matches the workbook's salaried/EXEMPT fixture, with employer payroll tax added on top", () => {
    // Salary $150,000, EXEMPT (0% WC), started 2018-03-10 -> ~8yr tenure at
    // 2026-07-24 -> top (5+yr) 6.2% PTO tier, 0% retirement, $0 health,
    // $15,000/yr vehicle, 13 holiday days. yearlyPackage and the pre-tax
    // hourlyLaborBurden match the workbook's own output exactly; the
    // workbook never applies its own FICA/FUTA/SUTA rates, so the taxed
    // hourlyLaborBurden here ($103.52) intentionally diverges upward.
    const result = computeLaborBurden(
      {
        payType: "salary",
        startDate: new Date("2018-03-10"),
        holidayDays: 13,
        discretionaryPtoHours: "0",
        currentPay: "150000",
        healthInsMonthly: "0",
        retirementPct: "0",
        yearlyVehicleValue: "15000",
        wcRate: "0",
      },
      company,
      new Date("2026-07-24"),
    );

    expect(result.tenureYears).toBe(8);
    expect(result.ptoAccrualPct.toString()).toBe("0.062");
    expect(result.yearlyPackage.toFixed(2)).toBe("189000.00");
    expect(result.hourlyLaborBurden.toFixed(2)).toBe("103.52");
    expect(result.otLaborBurden.toFixed(2)).toBe("0.00"); // salaried: always 0
  });

  it("matches the workbook's hourly Carpentry fixture, including the asymmetric OT formula", () => {
    // $28/hr, Carpentry (4.1472% WC), started 2023-01-01 -> 3yr tenure at
    // 2026-07-24 -> 4.2% PTO tier, 3% retirement, $400/mo health, 40
    // discretionary PTO hours, $0 vehicle.
    const result = computeLaborBurden(
      {
        payType: "hourly",
        startDate: new Date("2023-01-01"),
        holidayDays: null, // inherits company default (13)
        discretionaryPtoHours: "40",
        currentPay: "28",
        healthInsMonthly: "400",
        retirementPct: "0.03",
        yearlyVehicleValue: "0",
        wcRate: "0.041472",
      },
      company,
      new Date("2026-07-24"),
    );

    expect(result.tenureYears).toBe(3);
    expect(result.ptoAccrualPct.toString()).toBe("0.042");
    expect(result.yearlyRate.toFixed(2)).toBe("56000.00");
    expect(result.base.toFixed(2)).toBe("64960.00");
    expect(result.yearlyPackage.toFixed(2)).toBe("69308.80");
    expect(result.hourlyLaborBurden.toFixed(2)).toBe("39.40");
    expect(result.otHourlyRate.toFixed(2)).toBe("42.00");
    expect(result.otLaborBurden.toFixed(2)).toBe("47.91");
  });

  it("produces a sane zero result when every input is zero (no NaN/div-by-zero)", () => {
    const result = computeLaborBurden(
      {
        payType: "hourly",
        startDate: new Date("2026-07-24"),
        holidayDays: 0,
        discretionaryPtoHours: "0",
        currentPay: "0",
        healthInsMonthly: "0",
        retirementPct: "0",
        yearlyVehicleValue: "0",
        wcRate: "0",
      },
      {
        ...company,
        ptoTiers: [],
        sickTimeAccrualPct: "0",
        ficaPct: "0",
        futaPct: "0",
        stateUnemploymentPct: "0",
      },
      new Date("2026-07-24"),
    );

    expect(result.yearlyPackage.toFixed(2)).toBe("0.00");
    expect(result.hourlyLaborBurden.toFixed(2)).toBe("0.00");
    expect(result.otLaborBurden.toFixed(2)).toBe("0.00");
  });

  it("a null holidayDays inherits the company default; an explicit override wins", () => {
    const base = {
      payType: "hourly" as const,
      startDate: new Date("2026-07-24"), // tenure 0 -> 1% PTO tier
      discretionaryPtoHours: "0",
      currentPay: "20",
      healthInsMonthly: "0",
      retirementPct: "0",
      yearlyVehicleValue: "0",
      wcRate: "0",
    };

    const inherited = computeLaborBurden({ ...base, holidayDays: null }, company, new Date("2026-07-24"));
    const overridden = computeLaborBurden({ ...base, holidayDays: 5 }, company, new Date("2026-07-24"));

    // totalHoursOff = avgHoursPerYear * (0.01 + 0.033) + holidayDays * 10
    expect(inherited.totalHoursOff.toFixed(2)).toBe("216.00"); // 13 * 10 = 130
    expect(overridden.totalHoursOff.toFixed(2)).toBe("136.00"); // 5 * 10 = 50
  });

  it("salaried employees always post a zero OT Labor Burden, never a stale non-zero value", () => {
    const result = computeLaborBurden(
      {
        payType: "salary",
        startDate: new Date("2020-01-01"),
        holidayDays: null,
        discretionaryPtoHours: "0",
        currentPay: "90000",
        healthInsMonthly: "0",
        retirementPct: "0",
        yearlyVehicleValue: "0",
        wcRate: "0.05",
      },
      company,
      new Date("2026-07-24"),
    );

    expect(result.otHourlyRate.toFixed(2)).toBe("0.00");
    expect(result.otLaborBurden.toFixed(2)).toBe("0.00");
  });
});

describe("tenureYears", () => {
  it("floors partial years", () => {
    // 2020 is a leap year, so Jan 1 -> Dec 31 is exactly 365 days (one full
    // MS_PER_YEAR) -> tenure 1, not 0; use a date clearly short of a year.
    expect(tenureYears(new Date("2020-01-01"), new Date("2020-06-15"))).toBe(0);
    expect(tenureYears(new Date("2020-01-01"), new Date("2021-01-01"))).toBe(1);
    expect(tenureYears(new Date("2020-01-01"), new Date("2025-01-01"))).toBe(5);
  });

  it("never goes negative for a future start date", () => {
    expect(tenureYears(new Date("2030-01-01"), new Date("2026-07-24"))).toBe(0);
  });
});

describe("resolvePtoAccrualPct", () => {
  const tiers = company.ptoTiers;

  it.each([
    [0, "0.01"],
    [1, "0.022"],
    [2, "0.042"],
    [4, "0.042"], // between the 2yr and 5yr tiers -> 2yr tier still applies
    [5, "0.062"],
    [10, "0.062"],
  ])("tenure of %i years resolves to the %s tier", (years, expected) => {
    expect(resolvePtoAccrualPct(years, tiers).toString()).toBe(expected);
  });

  it("returns 0 when no tier is configured", () => {
    expect(resolvePtoAccrualPct(3, []).toString()).toBe("0");
  });
});

describe("burdenDeltaPct", () => {
  it("computes the percentage lift from gross to burdened", () => {
    expect(burdenDeltaPct(new Decimal(100), new Decimal(139.4)).toFixed(1)).toBe("39.4");
  });

  it("guards against division by zero when gross is zero", () => {
    expect(burdenDeltaPct(new Decimal(0), new Decimal(0)).toFixed(1)).toBe("0.0");
  });
});
