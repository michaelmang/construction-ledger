import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

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
});
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;

export const recordExpenseSchema = z.object({
  jobId: z.number().int().positive(),
  costCodeId: z.number().int().positive(),
  vendor: z.string().min(1, "Vendor is required"),
  amount: positiveDecimalAmount,
  date: isoDate,
  description: z.string().optional(),
});
export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;

export const editExpenseSchema = recordExpenseSchema.extend({ txnid: txnidSchema });
export type EditExpenseInput = z.infer<typeof editExpenseSchema>;

export const recordPaymentSchema = z.object({
  jobId: z.number().int().positive(),
  amount: positiveDecimalAmount,
  date: isoDate,
  cashAccount: z.string().min(1).optional(), // defaults to "checking"
  memo: z.string().optional(),
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
