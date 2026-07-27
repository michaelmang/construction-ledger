import Decimal from "decimal.js";

// v5 spec (job costing) — burden convention, ported line-for-line from the
// PM-provided Excel labor-burden calculator (every formula below was
// verified against real output rows from that workbook before being
// ported). One deliberate deviation: the source sheet defines employer
// payroll tax rates (FICA/FUTA/state unemployment) but never actually
// applies them anywhere in its own formulas — a gap in that sheet. This
// module folds them into hourlyLaborBurden/otLaborBurden, so this app's
// numbers are higher (more correct) than the source sheet's for anyone
// comparing the two side by side.
//
//   yearlyRate    = payType==="salary" ? currentPay : currentPay * avgHoursPerYear
//   hourlyRate    = payType==="salary" ? currentPay / avgHoursPerYear : currentPay
//   otHourlyRate  = payType==="salary" ? 0 : hourlyRate * 1.5
//   totalHoursOff = avgHoursPerYear*(ptoAccrualPct+sickRate) + holidayDays*10 + discretionaryPtoHours
//   base          = (hourlyRate * totalHoursOff) + yearlyRate + yearlyVehicleValue
//   yearlyPackage = base*retirementPct + base + (healthInsMonthly*12/2)
//   hourlyLaborBurden = (yearlyPackage/avgHoursPerYear) * (1 + wcRate + payrollTaxPct)
//   otLaborBurden = payType==="salary" ? 0
//     : (otHourlyRate + totalHoursOff/avgHoursPerYear) + otHourlyRate*(wcRate + payrollTaxPct)
//
// Intermediate values are kept at full Decimal precision through the whole
// chain — only the final LaborBurdenResult fields are rounded to cents,
// each independently at the point of return (this app's existing
// "round once, at the boundary" discipline — see lib/labor.ts, which this
// module replaces). Excel, by contrast, never rounds until display; this
// is a deliberate deviation to avoid compounding rounding error across a
// 7-step chain while still landing on a display-ready number.

export type PayType = "salary" | "hourly";

function roundCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface PtoAccrualTierInput {
  minTenureYears: number;
  accrualPct: Decimal.Value;
}

// Mirrors the company-wide constants an admin manages via
// LaborBurdenSettings + PtoAccrualTier[] (see lib/queries.ts's
// getCompanyAssumptions). Taken as plain data so this module stays
// framework/DB-free and testable with hand-built fixtures.
export interface CompanyAssumptions {
  sickTimeAccrualPct: Decimal.Value;
  companyHolidayDays: number;
  avgHoursPerYear: Decimal.Value;
  ficaPct: Decimal.Value;
  futaPct: Decimal.Value;
  stateUnemploymentPct: Decimal.Value;
  ptoTiers: PtoAccrualTierInput[]; // any order; sorted internally
}

export interface EmployeeBurdenInputs {
  payType: PayType;
  startDate: Date;
  holidayDays: number | null; // null = inherit company.companyHolidayDays
  discretionaryPtoHours: Decimal.Value;
  currentPay: Decimal.Value; // $/yr if payType="salary", $/hr if payType="hourly"
  healthInsMonthly: Decimal.Value;
  retirementPct: Decimal.Value;
  yearlyVehicleValue: Decimal.Value;
  wcRate: Decimal.Value; // resolved WorkersCompRate.rate; 0 if the employee has no WC code set
}

export interface LaborBurdenResult {
  yearlyRate: Decimal; // "Annual Gross"
  hourlyRate: Decimal;
  otHourlyRate: Decimal;
  tenureYears: number;
  ptoAccrualPct: Decimal;
  sickRate: Decimal;
  totalHoursOff: Decimal;
  base: Decimal;
  yearlyPackage: Decimal; // "Total Yearly Package"
  hourlyLaborBurden: Decimal; // fully-loaded $/hr, includes employer payroll tax
  otLaborBurden: Decimal;
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

export function tenureYears(startDate: Date, asOf: Date): number {
  return Math.max(0, Math.floor((asOf.getTime() - startDate.getTime()) / MS_PER_YEAR));
}

// The highest tier whose minTenureYears is <= the employee's tenure —
// "5+ years" (minTenureYears: 5) applies from year 5 onward, or forever if
// no higher tier exists. Falls back to 0 if no tier matches (e.g. an empty
// tier list), never throws — the calling admin UI is responsible for
// keeping at least a tier-0 row configured.
export function resolvePtoAccrualPct(years: number, tiers: PtoAccrualTierInput[]): Decimal {
  const applicable = tiers
    .filter((t) => t.minTenureYears <= years)
    .sort((a, b) => b.minTenureYears - a.minTenureYears);
  return applicable.length > 0 ? new Decimal(applicable[0].accrualPct) : new Decimal(0);
}

export function computeLaborBurden(
  employee: EmployeeBurdenInputs,
  company: CompanyAssumptions,
  asOf: Date,
): LaborBurdenResult {
  const avgHoursPerYear = new Decimal(company.avgHoursPerYear);
  const currentPay = new Decimal(employee.currentPay);
  const isSalary = employee.payType === "salary";

  const yearlyRate = isSalary ? currentPay : currentPay.times(avgHoursPerYear);
  const hourlyRate = isSalary ? currentPay.dividedBy(avgHoursPerYear) : currentPay;
  const otHourlyRate = isSalary ? new Decimal(0) : hourlyRate.times(1.5);

  const years = tenureYears(employee.startDate, asOf);
  const ptoAccrualPct = resolvePtoAccrualPct(years, company.ptoTiers);
  const sickRate = new Decimal(company.sickTimeAccrualPct);
  const holidayDays = employee.holidayDays ?? company.companyHolidayDays;

  const totalHoursOff = avgHoursPerYear
    .times(ptoAccrualPct.plus(sickRate))
    .plus(holidayDays * 10)
    .plus(employee.discretionaryPtoHours);

  const base = hourlyRate
    .times(totalHoursOff)
    .plus(yearlyRate)
    .plus(employee.yearlyVehicleValue);

  const retirementPct = new Decimal(employee.retirementPct);
  const healthInsMonthly = new Decimal(employee.healthInsMonthly);
  const yearlyPackage = base.times(retirementPct).plus(base).plus(healthInsMonthly.times(12).dividedBy(2));

  const payrollTaxPct = new Decimal(company.ficaPct).plus(company.futaPct).plus(company.stateUnemploymentPct);
  const wcRate = new Decimal(employee.wcRate);

  const hourlyLaborBurden = yearlyPackage
    .dividedBy(avgHoursPerYear)
    .times(new Decimal(1).plus(wcRate).plus(payrollTaxPct));

  const otLaborBurden = isSalary
    ? new Decimal(0)
    : otHourlyRate
        .plus(totalHoursOff.dividedBy(avgHoursPerYear))
        .plus(otHourlyRate.times(wcRate.plus(payrollTaxPct)));

  return {
    yearlyRate: roundCents(yearlyRate),
    hourlyRate: roundCents(hourlyRate),
    otHourlyRate: roundCents(otHourlyRate),
    tenureYears: years,
    ptoAccrualPct,
    sickRate,
    totalHoursOff: totalHoursOff.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    base: roundCents(base),
    yearlyPackage: roundCents(yearlyPackage),
    hourlyLaborBurden: roundCents(hourlyLaborBurden),
    otLaborBurden: roundCents(otLaborBurden),
  };
}

// The inline "Gross: $1,200.00 · Burdened: $1,542.00 (+28.5%)" delta shown
// on the expense form's labor mode — a percentage, not a dollar amount,
// rounded to one decimal place for display. Carried over unchanged from
// lib/labor.ts.
export function burdenDeltaPct(gross: Decimal, burdened: Decimal): Decimal {
  if (gross.isZero()) return new Decimal(0);
  return burdened.minus(gross).dividedBy(gross).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
}
