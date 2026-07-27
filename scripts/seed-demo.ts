// v2 spec §F16 — a realistic 3-job dataset so the redesigned UI (and the
// Activity audit trail, §F13) can be evaluated with real-looking density
// instead of the single hand-built job used during development.
//
// Resets both stores it seeds — the Prisma DB and the hledger journal git
// repo — so the result is reproducible. Goes through the same lib/*
// primitives the server actions use (recordTransaction, account-path
// helpers) rather than the "use server" action wrappers, since those import
// next/cache's revalidatePath, which throws outside a Next request (see
// scripts/migrate-retainage-receivable.ts for the same pattern).
//
// Usage: npm run seed:demo

import "dotenv/config";
import fs from "node:fs";
import { rm } from "node:fs/promises";
import * as git from "isomorphic-git";
import Decimal from "decimal.js";
import { prisma } from "../lib/db";
import { recordTransaction } from "../lib/transactions";
import { forcePushSeededJournal } from "../lib/journal-git";
import {
  accountsPayable,
  accountsReceivable,
  accruedPayroll,
  cash,
  employeeSlug,
  equityOpeningBalances,
  expenseJobCostCode,
  expenseOverhead,
  incomeJob,
  retainagePayable,
  retainageReceivable,
  vendorAccountSlug,
} from "../lib/accounts";
import { formatUSD } from "../lib/money";
import { computeLaborBurden } from "../lib/labor-burden";
import { getCompanyAssumptions } from "../lib/queries";
import { CostType } from "../lib/cost-types";

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

// If seeding against production (JOURNAL_GIT_REMOTE set), the domain-write
// loop below still runs as pure local commits — pushing on every one of the
// ~30 seed transactions individually would be slow and pointless. The whole
// point of a reset is one clean history pushed once at the end (see
// forcePushSeededJournal, called from main()); temporarily unsetting the
// remote here is what makes lib/journal-git.ts's commitJournalChanges treat
// every seed write as local-only, exactly like local dev.
const journalRemote = process.env.JOURNAL_GIT_REMOTE;

async function resetJournalRepo(): Promise<void> {
  const dir = journalDir();
  await rm(dir, { recursive: true, force: true });
  await fs.promises.mkdir(dir, { recursive: true });
  await git.init({ fs, dir, defaultBranch: "main" });
  delete process.env.JOURNAL_GIT_REMOTE;
}

async function resetDatabase(): Promise<void> {
  await prisma.billPayment.deleteMany();
  await prisma.paymentApplication.deleteMany();
  await prisma.laborEntry.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.progressBilling.deleteMany();
  await prisma.changeOrder.deleteMany();
  await prisma.jobBudget.deleteMany();
  await prisma.journalTxn.deleteMany();
  await prisma.job.deleteMany();
  await prisma.costCode.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.workersCompRate.deleteMany();
  await prisma.ptoAccrualTier.deleteMany();
  await prisma.laborBurdenSettings.deleteMany();
  await prisma.overheadCategory.deleteMany();
  await prisma.cashAccount.deleteMany();
}

// --- Domain helpers, mirroring the posting/tag conventions in app/actions/* ---

async function openCashAccount(opts: {
  name: string;
  label: string;
  isDefault?: boolean;
  openingBalance: string;
  openingDate: string;
}) {
  const openingBalance = new Decimal(opts.openingBalance);
  await prisma.cashAccount.create({
    data: {
      name: opts.name,
      label: opts.label,
      isDefault: opts.isDefault ?? false,
      openingBalance: openingBalance.toFixed(2),
      openingDate: new Date(opts.openingDate),
    },
  });

  if (!openingBalance.isZero()) {
    await recordTransaction(
      {
        kind: "opening-balance",
        jobId: null,
        date: opts.openingDate,
        description: `Opening balance - ${opts.label}`,
        tags: { type: "opening-balance" },
        postings: [
          { account: cash(opts.name), amount: openingBalance },
          { account: equityOpeningBalances(), amount: openingBalance.negated() },
        ],
        amount: openingBalance,
      },
      `opening balance: ${opts.label} ${formatUSD(openingBalance)}`,
    );
  }
}

async function recordJobExpense(opts: {
  job: { id: number; code: string };
  costCode: { id: number; code: string };
  vendor: { id: number; name: string };
  costType: CostType;
  amount: string;
  retainageWithheld?: string;
  date: string;
  description?: string;
}) {
  const amount = new Decimal(opts.amount);
  const retainageWithheld = new Decimal(opts.retainageWithheld ?? 0);
  const vendorSlug = vendorAccountSlug(opts.vendor.name);
  const apAmount = amount.minus(retainageWithheld);

  const postings = retainageWithheld.isZero()
    ? [
        { account: expenseJobCostCode(opts.job.code, opts.costCode.code), amount },
        { account: accountsPayable(vendorSlug), amount: amount.negated() },
      ]
    : [
        { account: expenseJobCostCode(opts.job.code, opts.costCode.code), amount },
        { account: accountsPayable(vendorSlug), amount: apAmount.negated() },
        { account: retainagePayable(opts.job.code), amount: retainageWithheld.negated() },
      ];

  const { txnid } = await recordTransaction(
    {
      kind: "expense",
      jobId: opts.job.id,
      date: opts.date,
      description: opts.description ? `${opts.vendor.name} - ${opts.description}` : opts.vendor.name,
      tags: { job: opts.job.code, code: opts.costCode.code, vendor: vendorSlug, costtype: opts.costType },
      postings,
      amount,
      memo: opts.description ? `${opts.vendor.name} - ${opts.description}` : opts.vendor.name,
    },
    `expense: ${opts.job.code} ${opts.costCode.code} ${formatUSD(amount)}`,
  );

  await prisma.bill.create({
    data: {
      vendorId: opts.vendor.id,
      jobId: opts.job.id,
      costCodeId: opts.costCode.id,
      amount: amount.toFixed(2),
      retainageWithheld: retainageWithheld.toFixed(2),
      date: new Date(opts.date),
      description: opts.description,
      costType: opts.costType,
      txnid,
    },
  });

  return txnid;
}

async function recordLaborCost(opts: {
  job: { id: number; code: string };
  costCode: { id: number; code: string };
  employee: {
    id: number;
    name: string;
    payType: string;
    startDate: Date | null;
    createdAt: Date;
    holidayDays: number | null;
    discretionaryPtoHours: Decimal.Value;
    currentPay: Decimal.Value;
    healthInsMonthly: Decimal.Value;
    retirementPct: Decimal.Value;
    yearlyVehicleValue: Decimal.Value;
    wcCode: { rate: Decimal.Value } | null;
  };
  hours: string;
  date: string;
  memo?: string;
}) {
  const hours = new Decimal(opts.hours);
  const company = await getCompanyAssumptions();
  const burden = computeLaborBurden(
    {
      payType: opts.employee.payType as "salary" | "hourly",
      startDate: opts.employee.startDate ?? opts.employee.createdAt,
      holidayDays: opts.employee.holidayDays,
      discretionaryPtoHours: opts.employee.discretionaryPtoHours,
      currentPay: opts.employee.currentPay,
      healthInsMonthly: opts.employee.healthInsMonthly,
      retirementPct: opts.employee.retirementPct,
      yearlyVehicleValue: opts.employee.yearlyVehicleValue,
      wcRate: opts.employee.wcCode?.rate ?? 0,
    },
    company,
    new Date(opts.date),
  );
  const gross = burden.hourlyRate.times(hours).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const burdened = burden.hourlyLaborBurden.times(hours).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const rate = burden.hourlyLaborBurden;
  const slug = employeeSlug(opts.employee.name);
  const description = `${opts.employee.name} — ${hours.toFixed(2)}h ${opts.costCode.code}${opts.memo ? ` - ${opts.memo}` : ""}`;

  const { txnid } = await recordTransaction(
    {
      kind: "labor",
      jobId: opts.job.id,
      date: opts.date,
      description,
      tags: { job: opts.job.code, code: opts.costCode.code, costtype: "labor", employee: slug },
      postings: [
        { account: expenseJobCostCode(opts.job.code, opts.costCode.code), amount: burdened },
        { account: accruedPayroll(), amount: burdened.negated() },
      ],
      amount: burdened,
      memo: description,
    },
    `labor: ${opts.job.code} ${opts.costCode.code} ${formatUSD(burdened)}`,
  );

  await prisma.laborEntry.create({
    data: {
      txnid,
      employeeId: opts.employee.id,
      jobId: opts.job.id,
      costCodeId: opts.costCode.id,
      date: new Date(opts.date),
      hours: hours.toFixed(2),
      baseRate: burden.hourlyRate.toFixed(2),
      burdenedRate: rate.toFixed(2),
      grossAmount: gross.toFixed(2),
      burdenedAmount: burdened.toFixed(2),
      memo: opts.memo,
    },
  });

  return txnid;
}

async function recordOverhead(opts: {
  category: { id: number; code: string };
  vendor: { id: number; name: string };
  amount: string;
  date: string;
  description?: string;
}) {
  const amount = new Decimal(opts.amount);
  const vendorSlug = vendorAccountSlug(opts.vendor.name);
  const description = opts.description ? `${opts.vendor.name} - ${opts.description}` : opts.vendor.name;

  const { txnid } = await recordTransaction(
    {
      kind: "overhead-expense",
      jobId: null,
      date: opts.date,
      description,
      tags: { type: "overhead-expense", category: opts.category.code },
      postings: [
        { account: expenseOverhead(opts.category.code), amount },
        { account: accountsPayable(vendorSlug), amount: amount.negated() },
      ],
      amount,
      memo: description,
    },
    `overhead: ${opts.category.code} ${formatUSD(amount)}`,
  );

  await prisma.bill.create({
    data: {
      vendorId: opts.vendor.id,
      overheadCategoryId: opts.category.id,
      amount: amount.toFixed(2),
      date: new Date(opts.date),
      description: opts.description,
      txnid,
    },
  });
}

async function payVendorBill(billId: number, amount: string, date: string, cashAccount = "checking") {
  const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId }, include: { vendor: true } });
  const paymentAmount = new Decimal(amount);
  const vendorSlug = vendorAccountSlug(bill.vendor.name);
  const description = `Bill payment - ${bill.vendor.name}`;

  const { txnid } = await recordTransaction(
    {
      kind: "bill-payment",
      jobId: bill.jobId,
      date,
      description,
      tags: {
        type: "bill-payment",
        vendor: vendorSlug,
        ...(bill.jobId ? { job: (await prisma.job.findUniqueOrThrow({ where: { id: bill.jobId } })).code } : {}),
      },
      postings: [
        { account: accountsPayable(vendorSlug), amount: paymentAmount },
        { account: cash(cashAccount), amount: paymentAmount.negated() },
      ],
      amount: paymentAmount,
      memo: description,
    },
    `pay bill: ${bill.vendor.name} ${formatUSD(paymentAmount)}`,
  );

  const newPaidAmount = new Decimal(bill.paidAmount).plus(paymentAmount);
  const newAmountDue = new Decimal(bill.amount).minus(bill.retainageWithheld).minus(newPaidAmount);

  await prisma.billPayment.create({
    data: { billId: bill.id, amount: paymentAmount.toFixed(2), date: new Date(date), txnid },
  });
  await prisma.bill.update({
    where: { id: bill.id },
    data: { paidAmount: newPaidAmount.toFixed(2), status: newAmountDue.isZero() ? "paid" : "partial" },
  });
}

async function createBilling(opts: {
  job: { id: number; code: string; name: string };
  billingDate: string;
  periodLabel: string;
  amountBilled: string;
  retainageWithheld: string;
  pctCompleteEstimate?: string;
}) {
  const amountBilled = new Decimal(opts.amountBilled);
  const retainageWithheld = new Decimal(opts.retainageWithheld);
  const netBilled = amountBilled.minus(retainageWithheld);
  const description = `Progress billing - ${opts.job.name} - ${opts.periodLabel}`;

  const { txnid } = await recordTransaction(
    {
      kind: "progress-billing",
      jobId: opts.job.id,
      date: opts.billingDate,
      description,
      tags: { job: opts.job.code, type: "progress-billing" },
      postings: [
        { account: accountsReceivable(opts.job.code), amount: netBilled },
        { account: retainageReceivable(opts.job.code), amount: retainageWithheld },
        { account: incomeJob(opts.job.code), amount: amountBilled.negated() },
      ],
      amount: amountBilled,
      memo: opts.periodLabel,
    },
    `progress billing: ${opts.job.code} ${formatUSD(amountBilled)}`,
  );

  return prisma.progressBilling.create({
    data: {
      jobId: opts.job.id,
      billingDate: new Date(opts.billingDate),
      periodLabel: opts.periodLabel,
      amountBilled: amountBilled.toFixed(2),
      retainageWithheld: retainageWithheld.toFixed(2),
      pctCompleteEstimate: opts.pctCompleteEstimate,
      txnid,
    },
  });
}

async function applyPayment(opts: {
  job: { id: number; code: string; name: string };
  billing: { id: number; amountBilled: Decimal; retainageWithheld: Decimal; paidAmount: Decimal };
  amount: string;
  date: string;
  memo?: string;
}) {
  const amount = new Decimal(opts.amount);
  const description = opts.memo
    ? `Payment received - ${opts.job.name} - ${opts.memo}`
    : `Payment received - ${opts.job.name}`;

  const { txnid } = await recordTransaction(
    {
      kind: "payment",
      jobId: opts.job.id,
      date: opts.date,
      description,
      tags: { job: opts.job.code, type: "payment" },
      postings: [
        { account: cash("checking"), amount },
        { account: accountsReceivable(opts.job.code), amount: amount.negated() },
      ],
      amount,
      memo: opts.memo,
    },
    `payment: ${opts.job.code} ${formatUSD(amount)}`,
  );

  const netBilled = opts.billing.amountBilled.minus(opts.billing.retainageWithheld);
  const newPaidAmount = opts.billing.paidAmount.plus(amount);
  await prisma.paymentApplication.create({
    data: { billingId: opts.billing.id, amount: amount.toFixed(2), date: new Date(opts.date), txnid },
  });
  await prisma.progressBilling.update({
    where: { id: opts.billing.id },
    data: {
      paidAmount: newPaidAmount.toFixed(2),
      status: newPaidAmount.greaterThanOrEqualTo(netBilled) ? "paid" : "partial",
    },
  });
}

async function main() {
  console.log(`Resetting journal repo at ${journalDir()}...`);
  await resetJournalRepo();
  console.log("Resetting database...");
  await resetDatabase();

  console.log("Seeding cost codes, vendors, cash accounts, overhead categories...");
  const [concrete, carpentry, finishes, plumbing, electrical] = await Promise.all([
    prisma.costCode.create({ data: { code: "03-CONCRETE", name: "Concrete", csiDivision: "03" } }),
    prisma.costCode.create({ data: { code: "06-CARPENTRY", name: "Carpentry", csiDivision: "06" } }),
    prisma.costCode.create({ data: { code: "09-FINISHES", name: "Finishes", csiDivision: "09" } }),
    prisma.costCode.create({ data: { code: "22-PLUMBING", name: "Plumbing", csiDivision: "22" } }),
    prisma.costCode.create({ data: { code: "26-ELECTRICAL", name: "Electrical", csiDivision: "26" } }),
  ]);

  const [aceConcrete, ridgeFraming, summitElectric, blueRidgePlumbing, sunriseFinish, staples, statewideInsurance, metroFuel] =
    await Promise.all([
      prisma.vendor.create({ data: { name: "Ace Concrete Supply" } }),
      prisma.vendor.create({ data: { name: "Ridge Framing Sub" } }),
      prisma.vendor.create({ data: { name: "Summit Electric" } }),
      prisma.vendor.create({ data: { name: "Blue Ridge Plumbing" } }),
      prisma.vendor.create({ data: { name: "Sunrise Finish Carpentry" } }),
      prisma.vendor.create({ data: { name: "Staples Office Supply" } }),
      prisma.vendor.create({ data: { name: "Statewide Insurance" } }),
      prisma.vendor.create({ data: { name: "Metro Fuel Co" } }),
    ]);

  const [office, insurance, fuel] = await Promise.all([
    prisma.overheadCategory.create({ data: { code: "OFFICE", name: "Office Expenses" } }),
    prisma.overheadCategory.create({ data: { code: "INSURANCE", name: "Insurance" } }),
    prisma.overheadCategory.create({ data: { code: "FUEL", name: "Fuel" } }),
  ]);

  // v5 spec (job costing) — company-wide labor-burden assumptions, mirroring
  // the friend-provided Excel workbook's own Assumptions tab exactly (rates
  // captured by re-parsing that workbook, not invented).
  await prisma.laborBurdenSettings.create({
    data: {
      id: 1,
      sickTimeAccrualPct: "0.033",
      companyHolidayDays: 13,
      avgHoursPerYear: "2000",
      ficaPct: "0.0765",
      futaPct: "0.006",
      stateUnemploymentPct: "0.013",
    },
  });
  await prisma.ptoAccrualTier.createMany({
    data: [
      { minTenureYears: 0, accrualPct: "0.01" },
      { minTenureYears: 1, accrualPct: "0.022" },
      { minTenureYears: 2, accrualPct: "0.042" },
      { minTenureYears: 5, accrualPct: "0.062" },
    ],
  });
  const wcRates = await Promise.all(
    [
      { code: "0", description: "EXEMPT", rate: "0" },
      { code: "5020", description: "Susp Ceiling", rate: "0.019794" },
      { code: "5022", description: "Masonry", rate: "0.027591" },
      { code: "5102", description: "Dr & Win", rate: "0.023649" },
      { code: "5183", description: "Plumbing", rate: "0.014053" },
      { code: "5190", description: "Electrical", rate: "0.009168" },
      { code: "5221", description: "Conc & Cem", rate: "0.018765" },
      { code: "5348", description: "Tile", rate: "0.016023" },
      { code: "5445", description: "Drywall", rate: "0.027163" },
      { code: "5474", description: "Painting", rate: "0.022193" },
      { code: "5478", description: "Crpt & Lam", rate: "0.012596" },
      { code: "5606", description: "Contractor", rate: "0.004541" },
      { code: "5645", description: "Carpentry", rate: "0.041472" },
      { code: "6217", description: "Excavation", rate: "0.017908" },
      { code: "8810", description: "Clerical", rate: "0.000428" },
    ].map((data) => prisma.workersCompRate.create({ data })),
  );
  const wcByCode = new Map(wcRates.map((wc) => [wc.code, wc]));

  // Distinct burden profiles (v3 spec §F18/§F19, v5 spec job costing) so the
  // pivot report and "labor as % of revenue" trend render with real
  // density: an hourly carpenter early in tenure, an hourly electrician
  // with several years of tenure and benefits, and a salaried foreman with
  // a full benefits package and a company vehicle.
  const [carpenterEmployee, electricianEmployee, foremanEmployee] = await Promise.all([
    prisma.employee.create({
      data: {
        name: "Dave Kowalski",
        number: "EMP-001",
        jobTitle: "Carpenter",
        payType: "hourly",
        employmentType: "full_time",
        wcCodeId: wcByCode.get("5645")!.id,
        startDate: new Date("2023-03-01"),
        discretionaryPtoHours: "0",
        currentPay: "28.00",
        healthInsMonthly: "0",
        retirementPct: "0",
        yearlyVehicleValue: "0",
      },
      include: { wcCode: true },
    }),
    prisma.employee.create({
      data: {
        name: "Marcus Lee",
        number: "EMP-002",
        jobTitle: "Electrician",
        payType: "hourly",
        employmentType: "full_time",
        wcCodeId: wcByCode.get("5190")!.id,
        startDate: new Date("2020-01-15"),
        discretionaryPtoHours: "0",
        currentPay: "34.00",
        healthInsMonthly: "400.00",
        retirementPct: "0.03",
        yearlyVehicleValue: "0",
      },
      include: { wcCode: true },
    }),
    prisma.employee.create({
      data: {
        name: "Renee Ortiz",
        number: "EMP-003",
        jobTitle: "Foreman",
        payType: "salary",
        employmentType: "full_time",
        wcCodeId: wcByCode.get("5606")!.id,
        startDate: new Date("2019-06-01"),
        discretionaryPtoHours: "40",
        currentPay: "78000.00",
        healthInsMonthly: "600.00",
        retirementPct: "0.05",
        yearlyVehicleValue: "8000.00",
      },
      include: { wcCode: true },
    }),
  ]);

  await openCashAccount({
    name: "checking",
    label: "Operating Checking",
    isDefault: true,
    openingBalance: "15000.00",
    openingDate: "2026-01-01",
  });
  await openCashAccount({
    name: "savings",
    label: "Business Savings",
    openingBalance: "50000.00",
    openingDate: "2026-01-01",
  });

  // --- Job 1: early-stage remodel, active ---
  console.log("Seeding Job 1 — Smith Residence Addition (early stage)...");
  const job1 = await prisma.job.create({
    data: {
      code: "J2026-014",
      name: "Smith Residence Addition",
      clientName: "Smith Residence",
      contractValue: "180000.00",
      retainagePct: "0.10",
      startDate: new Date("2026-06-01"),
    },
  });
  await prisma.jobBudget.createMany({
    data: [
      { jobId: job1.id, costCodeId: concrete.id, budgetedAmount: "42000.00" },
      { jobId: job1.id, costCodeId: carpentry.id, budgetedAmount: "38000.00" },
      { jobId: job1.id, costCodeId: plumbing.id, budgetedAmount: "18000.00" },
    ],
  });
  const job1ConcreteBillId = await recordJobExpense({
    job: job1,
    costCode: concrete,
    vendor: aceConcrete,
    costType: "material",
    amount: "4200.00",
    date: "2026-06-10",
  });
  const job1CarpentryBillId = await recordJobExpense({
    job: job1,
    costCode: carpentry,
    vendor: ridgeFraming,
    costType: "subcontract",
    amount: "8000.00",
    retainageWithheld: "800.00",
    date: "2026-06-25",
    description: "framing labor",
  });
  await recordLaborCost({
    job: job1,
    costCode: carpentry,
    employee: carpenterEmployee,
    hours: "24",
    date: "2026-06-28",
    memo: "self-performed trim carpentry",
  });
  const job1Billing1 = await createBilling({
    job: job1,
    billingDate: "2026-07-15",
    periodLabel: "Pay App #1",
    amountBilled: "20000.00",
    retainageWithheld: "2000.00",
  });
  await applyPayment({
    job: job1,
    billing: {
      id: job1Billing1.id,
      amountBilled: new Decimal(job1Billing1.amountBilled),
      retainageWithheld: new Decimal(job1Billing1.retainageWithheld),
      paidAmount: new Decimal(job1Billing1.paidAmount),
    },
    amount: "10000.00",
    date: "2026-07-20",
  });
  const job1ConcreteBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job1ConcreteBillId } });
  await payVendorBill(job1ConcreteBill.id, "4200.00", "2026-07-22");
  const job1CarpentryBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job1CarpentryBillId } });
  await payVendorBill(job1CarpentryBill.id, "5000.00", "2026-07-24");

  // --- Job 2: mid-stage remodel with a change order, active ---
  console.log("Seeding Job 2 — Miller Kitchen Remodel (mid-stage, over budget on carpentry)...");
  const job2 = await prisma.job.create({
    data: {
      code: "J2026-021",
      name: "Miller Kitchen Remodel",
      clientName: "Miller Family Trust",
      contractValue: "95000.00",
      retainagePct: "0.10",
      startDate: new Date("2026-04-01"),
    },
  });
  await prisma.jobBudget.createMany({
    data: [
      { jobId: job2.id, costCodeId: concrete.id, budgetedAmount: "5000.00" },
      { jobId: job2.id, costCodeId: carpentry.id, budgetedAmount: "30000.00" },
      { jobId: job2.id, costCodeId: finishes.id, budgetedAmount: "25000.00" },
      { jobId: job2.id, costCodeId: electrical.id, budgetedAmount: "15000.00" },
    ],
  });
  await prisma.changeOrder.create({
    data: {
      jobId: job2.id,
      coNumber: "CO-1",
      description: "Add pantry cabinetry",
      amount: "6000.00",
      status: "approved",
      approvedDate: new Date("2026-05-10"),
    },
  });
  await recordJobExpense({
    job: job2,
    costCode: concrete,
    vendor: aceConcrete,
    costType: "material",
    amount: "4800.00",
    date: "2026-04-10",
  });
  const job2CarpentryBillId = await recordJobExpense({
    job: job2,
    costCode: carpentry,
    vendor: ridgeFraming,
    costType: "subcontract",
    amount: "31500.00",
    date: "2026-04-28",
    description: "cabinetry framing — exceeded original estimate",
  });
  const job2ElectricalBillId = await recordJobExpense({
    job: job2,
    costCode: electrical,
    vendor: summitElectric,
    costType: "subcontract",
    amount: "9000.00",
    date: "2026-05-20",
  });
  await recordJobExpense({
    job: job2,
    costCode: finishes,
    vendor: sunriseFinish,
    costType: "subcontract",
    amount: "12000.00",
    date: "2026-06-15",
  });
  await recordLaborCost({
    job: job2,
    costCode: electrical,
    employee: electricianEmployee,
    hours: "16",
    date: "2026-05-25",
    memo: "panel upgrade, self-performed",
  });
  await recordLaborCost({
    job: job2,
    costCode: finishes,
    employee: foremanEmployee,
    hours: "12",
    date: "2026-06-20",
    memo: "finish carpentry punch list",
  });
  const job2Billing1 = await createBilling({
    job: job2,
    billingDate: "2026-05-01",
    periodLabel: "Pay App #1",
    amountBilled: "40000.00",
    retainageWithheld: "4000.00",
  });
  await applyPayment({
    job: job2,
    billing: {
      id: job2Billing1.id,
      amountBilled: new Decimal(job2Billing1.amountBilled),
      retainageWithheld: new Decimal(job2Billing1.retainageWithheld),
      paidAmount: new Decimal(job2Billing1.paidAmount),
    },
    amount: "36000.00",
    date: "2026-05-10",
  });
  const job2Billing2 = await createBilling({
    job: job2,
    billingDate: "2026-06-20",
    periodLabel: "Pay App #2",
    amountBilled: "25000.00",
    retainageWithheld: "2500.00",
  });
  await applyPayment({
    job: job2,
    billing: {
      id: job2Billing2.id,
      amountBilled: new Decimal(job2Billing2.amountBilled),
      retainageWithheld: new Decimal(job2Billing2.retainageWithheld),
      paidAmount: new Decimal(job2Billing2.paidAmount),
    },
    amount: "15000.00",
    date: "2026-06-25",
  });
  const job2CarpentryBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job2CarpentryBillId } });
  await payVendorBill(job2CarpentryBill.id, "20000.00", "2026-06-01");
  const job2ElectricalBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job2ElectricalBillId } });
  await payVendorBill(job2ElectricalBill.id, "9000.00", "2026-06-20");

  // --- Job 3: small job, fully billed and complete ---
  console.log("Seeding Job 3 — Turner Garage Build (complete)...");
  const job3 = await prisma.job.create({
    data: {
      code: "J2025-098",
      name: "Turner Garage Build",
      clientName: "Turner Household",
      contractValue: "45000.00",
      retainagePct: "0.05",
      status: "complete",
      startDate: new Date("2025-11-01"),
      targetEndDate: new Date("2026-02-01"),
    },
  });
  await prisma.jobBudget.createMany({
    data: [
      { jobId: job3.id, costCodeId: concrete.id, budgetedAmount: "8000.00" },
      { jobId: job3.id, costCodeId: carpentry.id, budgetedAmount: "15000.00" },
      { jobId: job3.id, costCodeId: electrical.id, budgetedAmount: "6000.00" },
    ],
  });
  const job3ConcreteBillId = await recordJobExpense({
    job: job3,
    costCode: concrete,
    vendor: aceConcrete,
    costType: "material",
    amount: "7800.00",
    date: "2025-11-15",
  });
  const job3CarpentryBillId = await recordJobExpense({
    job: job3,
    costCode: carpentry,
    vendor: ridgeFraming,
    costType: "subcontract",
    amount: "14200.00",
    date: "2025-12-10",
  });
  const job3ElectricalBillId = await recordJobExpense({
    job: job3,
    costCode: electrical,
    vendor: summitElectric,
    costType: "subcontract",
    amount: "5600.00",
    date: "2026-01-05",
  });
  const job3Billing1 = await createBilling({
    job: job3,
    billingDate: "2026-01-20",
    periodLabel: "Final Pay App",
    amountBilled: "45000.00",
    retainageWithheld: "2250.00",
  });
  await applyPayment({
    job: job3,
    billing: {
      id: job3Billing1.id,
      amountBilled: new Decimal(job3Billing1.amountBilled),
      retainageWithheld: new Decimal(job3Billing1.retainageWithheld),
      paidAmount: new Decimal(job3Billing1.paidAmount),
    },
    amount: "42750.00",
    date: "2026-02-01",
  });
  const job3ConcreteBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job3ConcreteBillId } });
  await payVendorBill(job3ConcreteBill.id, "7800.00", "2026-02-05");
  const job3CarpentryBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job3CarpentryBillId } });
  await payVendorBill(job3CarpentryBill.id, "14200.00", "2026-02-05");
  const job3ElectricalBill = await prisma.bill.findUniqueOrThrow({ where: { txnid: job3ElectricalBillId } });
  await payVendorBill(job3ElectricalBill.id, "5600.00", "2026-02-05");

  // --- Overhead ---
  console.log("Seeding overhead expenses...");
  await recordOverhead({ category: insurance, vendor: statewideInsurance, amount: "2200.00", date: "2026-06-01" });
  await recordOverhead({ category: office, vendor: staples, amount: "340.00", date: "2026-06-05" });
  await recordOverhead({ category: fuel, vendor: metroFuel, amount: "580.00", date: "2026-07-01" });
  await recordOverhead({ category: office, vendor: staples, amount: "210.00", date: "2026-07-10" });

  void blueRidgePlumbing; // seeded for use as a vendor option in the UI; not billed in this dataset

  if (journalRemote) {
    process.env.JOURNAL_GIT_REMOTE = journalRemote;
    console.log(`\nPushing seeded journal history to ${journalRemote}...`);
    await forcePushSeededJournal();
    console.log("Pushed.");
  }

  const [journalTxnCount, jobCount, billCount, employeeCount, laborEntryCount] = await Promise.all([
    prisma.journalTxn.count(),
    prisma.job.count(),
    prisma.bill.count(),
    prisma.employee.count(),
    prisma.laborEntry.count(),
  ]);
  console.log(
    `\nDone. Seeded ${jobCount} jobs, ${billCount} bills, ${employeeCount} employees, ` +
      `${laborEntryCount} labor entries, ${journalTxnCount} journal transactions.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
