import Decimal from "decimal.js";
import { Money } from "@/components/Money";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

export interface CostTypePivotRowProps {
  costCodeId: number;
  costCode: string;
  costCodeName: string;
  labor: Decimal;
  material: Decimal;
  subcontract: Decimal;
  equipment: Decimal;
  other: Decimal;
  untyped: Decimal;
  total: Decimal;
}

// Cost code x cost type pivot (v3 spec §F17/§F19) — "is Concrete over budget
// because of material price increases, or because we self-performed work we
// bid as sub work?" The "Untyped" column only renders when at least one row
// has a nonzero value, since it's a signal that the cost-type backfill
// migration hasn't run yet, not a normal category.
export function CostTypePivotTable({ rows }: { rows: CostTypePivotRowProps[] }) {
  const hasUntyped = rows.some((r) => !r.untyped.isZero());

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-text-2">Cost by Type</h2>
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Cost Code</th>
              <th className={`${thClass} text-right`}>Labor</th>
              <th className={`${thClass} text-right`}>Material</th>
              <th className={`${thClass} text-right`}>Subcontract</th>
              <th className={`${thClass} text-right`}>Equipment</th>
              <th className={`${thClass} text-right`}>Other</th>
              {hasUntyped && <th className={`${thClass} text-right`}>Untyped</th>}
              <th className={`${thClass} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {rows.map((r) => (
              <tr key={r.costCodeId} className={trClass}>
                <td className={tdClass}>
                  <span className="font-medium text-text">{r.costCode}</span>
                  <span className="ml-2 text-text-3">{r.costCodeName}</span>
                </td>
                <td className={tdNumericClass}>
                  <Money value={r.labor} />
                </td>
                <td className={tdNumericClass}>
                  <Money value={r.material} />
                </td>
                <td className={tdNumericClass}>
                  <Money value={r.subcontract} />
                </td>
                <td className={tdNumericClass}>
                  <Money value={r.equipment} />
                </td>
                <td className={tdNumericClass}>
                  <Money value={r.other} />
                </td>
                {hasUntyped && (
                  <td className={tdNumericClass}>
                    {r.untyped.isZero() ? (
                      <span className="text-text-3">—</span>
                    ) : (
                      <span className="text-accent">
                        <Money value={r.untyped} />
                      </span>
                    )}
                  </td>
                )}
                <td className={`${tdNumericClass} font-medium`}>
                  <Money value={r.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
