// Single source of truth for the cost-type dimension (v3 spec §F17/§F19).
// Imported by lib/validation.ts (zod schema), the expense form's selector,
// and the cost code x cost type pivot report — never redeclared.
export const COST_TYPES = ["labor", "material", "subcontract", "equipment", "other"] as const;
export type CostType = (typeof COST_TYPES)[number];

export const COST_TYPE_LABEL: Record<CostType, string> = {
  labor: "Labor",
  material: "Material",
  subcontract: "Subcontract",
  equipment: "Equipment",
  other: "Other",
};
