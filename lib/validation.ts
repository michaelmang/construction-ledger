import { z } from "zod";
import { COST_TYPES } from "./cost-types";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const costTypeSchema = z.enum(COST_TYPES);

// Expenses go through recordExpense/editExpense; labor has its own action
// (recordLaborCost) since it takes an employee + hours instead of a vendor +
// amount, so "labor" is excluded here (v3 spec §F19 design decision 5).
export const expenseCostTypeSchema = z.enum(
  COST_TYPES.filter((t) => t !== "labor") as Exclude<(typeof COST_TYPES)[number], "labor">[],
);

// decimal.js-compatible amount: accept string or number, require it to parse
// as a finite decimal. Callers convert to Decimal after validation.
export const decimalAmount = z
  .union([z.string(), z.number()])
  .refine((v) => {
    const s = String(v).trim();
    return /^-?\d+(\.\d+)?$/.test(s);
  }, "Must be a valid decimal amount")
  .transform((v) => String(v).trim());

export const positiveDecimalAmount = decimalAmount.refine(
  (v) => Number(v) > 0,
  "Must be greater than zero",
);

export const nonNegativeDecimalAmount = decimalAmount.refine(
  (v) => Number(v) >= 0,
  "Must not be negative",
);

export const txnidSchema = z.string().min(1, "txnid is required");

export const createJobSchema = z.object({
  code: z.string().min(1, "Job code is required"),
  name: z.string().min(1, "Job name is required"),
  clientName: z.string().optional(),
  contractValue: decimalAmount.optional(),
  retainagePct: decimalAmount.optional(),
  startDate: isoDate.optional(),
  targetEndDate: isoDate.optional(),
  notes: z.string().optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const setJobStatusSchema = z.object({
  jobId: z.number().int().positive(),
  status: z.enum(["active", "complete", "archived"]),
});
export type SetJobStatusInput = z.infer<typeof setJobStatusSchema>;

export const createCostCodeSchema = z.object({
  code: z.string().min(1, "Cost code is required"),
  name: z.string().min(1, "Cost code name is required"),
  csiDivision: z.string().optional(),
});
export type CreateCostCodeInput = z.infer<typeof createCostCodeSchema>;

export const setBudgetSchema = z.object({
  jobId: z.number().int().positive(),
  costCodeId: z.number().int().positive(),
  budgetedAmount: decimalAmount,
  // null explicitly clears a previously-set revised estimate, reverting to
  // budgetedAmount; undefined leaves whatever is already stored untouched.
  revisedEstimate: z.union([decimalAmount, z.null()]).optional(),
});
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;

export const recordExpenseSchema = z.object({
  jobId: z.number().int().positive(),
  costCodeId: z.number().int().positive(),
  vendorId: z.number().int().positive(),
  costType: expenseCostTypeSchema, // required (v3 spec §F17)
  amount: positiveDecimalAmount,
  retainageWithheld: nonNegativeDecimalAmount.optional(), // withheld from this sub's bill (v2 spec §F1)
  date: isoDate,
  description: z.string().optional(),
});
export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;

export const editExpenseSchema = recordExpenseSchema.extend({ txnid: txnidSchema });
export type EditExpenseInput = z.infer<typeof editExpenseSchema>;

export const recordOverheadExpenseSchema = z.object({
  vendorId: z.number().int().positive(),
  overheadCategoryId: z.number().int().positive(),
  amount: positiveDecimalAmount,
  date: isoDate,
  description: z.string().optional(),
});
export type RecordOverheadExpenseInput = z.infer<typeof recordOverheadExpenseSchema>;

export const createVendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const createOverheadCategorySchema = z.object({
  code: z.string().min(1, "Category code is required"),
  name: z.string().min(1, "Category name is required"),
});
export type CreateOverheadCategoryInput = z.infer<typeof createOverheadCategorySchema>;

export const createCashAccountSchema = z.object({
  name: z.string().min(1, "Account slug is required"),
  label: z.string().min(1, "Account label is required"),
  isDefault: z.boolean().optional(),
  openingBalance: decimalAmount.optional(),
  openingDate: isoDate.optional(),
});
export type CreateCashAccountInput = z.infer<typeof createCashAccountSchema>;

export const payBillSchema = z.object({
  billId: z.number().int().positive(),
  amount: positiveDecimalAmount,
  date: isoDate,
  cashAccount: z.string().min(1).optional(),
});
export type PayBillInput = z.infer<typeof payBillSchema>;

export const recordPaymentSchema = z.object({
  jobId: z.number().int().positive(),
  amount: positiveDecimalAmount,
  date: isoDate,
  cashAccount: z.string().min(1).optional(), // defaults to "checking"
  memo: z.string().optional(),
  billingId: z.number().int().positive().optional(), // apply to a specific progress billing (v2 spec §F10)
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const editPaymentSchema = recordPaymentSchema.extend({ txnid: txnidSchema });
export type EditPaymentInput = z.infer<typeof editPaymentSchema>;

export const createProgressBillingSchema = z.object({
  jobId: z.number().int().positive(),
  billingDate: isoDate,
  periodLabel: z.string().optional(),
  amountBilled: positiveDecimalAmount,
  retainageWithheld: nonNegativeDecimalAmount.optional(), // defaults to job.retainagePct * amountBilled
  pctCompleteEstimate: decimalAmount.optional(),
});
export type CreateProgressBillingInput = z.infer<typeof createProgressBillingSchema>;

export const editProgressBillingSchema = createProgressBillingSchema.extend({
  id: z.number().int().positive(),
  txnid: txnidSchema,
});
export type EditProgressBillingInput = z.infer<typeof editProgressBillingSchema>;

export const createChangeOrderSchema = z.object({
  jobId: z.number().int().positive(),
  coNumber: z.string().optional(),
  description: z.string().optional(),
  amount: decimalAmount, // can be negative
  approvedDate: isoDate.optional(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});
export type CreateChangeOrderInput = z.infer<typeof createChangeOrderSchema>;

export const approveChangeOrderSchema = z.object({
  id: z.number().int().positive(),
  approvedDate: isoDate,
});
export type ApproveChangeOrderInput = z.infer<typeof approveChangeOrderSchema>;

// v3 spec §F19: rate components are decimal fractions of base rate (see
// lib/labor.ts for the burden formula).
export const createEmployeeSchema = z.object({
  name: z.string().min(1, "Employee name is required"),
  baseRate: positiveDecimalAmount,
  payrollTaxPct: nonNegativeDecimalAmount.optional(),
  workersCompPct: nonNegativeDecimalAmount.optional(),
  benefitsPct: nonNegativeDecimalAmount.optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.extend({
  id: z.number().int().positive(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const setEmployeeActiveSchema = z.object({
  id: z.number().int().positive(),
  active: z.boolean(),
});
export type SetEmployeeActiveInput = z.infer<typeof setEmployeeActiveSchema>;

export const recordLaborSchema = z.object({
  jobId: z.number().int().positive(),
  costCodeId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  hours: positiveDecimalAmount,
  date: isoDate,
  memo: z.string().optional(),
});
export type RecordLaborInput = z.infer<typeof recordLaborSchema>;

export const editLaborSchema = recordLaborSchema.extend({ txnid: txnidSchema });
export type EditLaborInput = z.infer<typeof editLaborSchema>;

// V4 spec Phase 1 — invite-only allowlist, admin-managed.
export const userRoleSchema = z.enum(["admin", "bookkeeper", "viewer"]);

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: userRoleSchema,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const revokeUserSchema = z.object({
  email: z.string().email(),
});
export type RevokeUserInput = z.infer<typeof revokeUserSchema>;
