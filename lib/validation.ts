import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// decimal.js-compatible amount: accept string or number, require it to parse
// as a finite decimal. Callers convert to Decimal after validation.
const decimalAmount = z
  .union([z.string(), z.number()])
  .refine((v) => {
    const s = String(v).trim();
    return /^-?\d+(\.\d+)?$/.test(s);
  }, "Must be a valid decimal amount")
  .transform((v) => String(v).trim());

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
  amount: decimalAmount,
  date: isoDate,
  description: z.string().optional(),
});
export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;
