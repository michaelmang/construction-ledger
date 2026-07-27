import { auth } from "@/auth";
import { getLaborBurdenSettings, listWorkersCompRates, listPtoAccrualTiers } from "@/lib/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { LaborBurdenSettingsForm } from "./LaborBurdenSettingsForm";
import { WorkersCompRateTable } from "./WorkersCompRateTable";
import { PtoAccrualTiersEditor } from "./PtoAccrualTiersEditor";

export const dynamic = "force-dynamic";

// v5 spec (job costing): the company-wide assumptions lib/labor-burden.ts's
// computeLaborBurden reads for every employee — flat constants, workers'
// comp rate table, and PTO accrual tiers all live on one page since they
// belong to a single Excel tab's assumptions block and are edited together
// rarely (annually, at insurance renewal). Admin-gated like /employees and
// /job-costing — same pay-rate-derived data everywhere else in this app.
export default async function LaborBurdenSettingsPage() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center text-sm text-text-2">
        Admins only.
      </div>
    );
  }

  const [settings, wcRates, tiers] = await Promise.all([
    getLaborBurdenSettings(),
    listWorkersCompRates(),
    listPtoAccrualTiers(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Settings" title="Labor Burden" />
      <p className="text-sm text-text-3">
        Company-wide assumptions used to compute every employee&apos;s fully-loaded labor cost on{" "}
        <a href="/job-costing" className="underline">
          Job Costing
        </a>{" "}
        and when recording labor against a job.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text">Flat Assumptions</h2>
        <LaborBurdenSettingsForm
          initial={{
            sickTimeAccrualPct: settings?.sickTimeAccrualPct.toString() ?? "0.033",
            companyHolidayDays: String(settings?.companyHolidayDays ?? 13),
            avgHoursPerYear: settings?.avgHoursPerYear.toString() ?? "2000",
            ficaPct: settings?.ficaPct.toString() ?? "0.0765",
            futaPct: settings?.futaPct.toString() ?? "0.006",
            stateUnemploymentPct: settings?.stateUnemploymentPct.toString() ?? "0.013",
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text">Workers&apos; Comp Rates</h2>
        <WorkersCompRateTable
          rates={wcRates.map((r) => ({
            id: r.id,
            code: r.code,
            description: r.description,
            rate: r.rate.toString(),
            active: r.active,
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text">PTO Accrual Tiers</h2>
        <PtoAccrualTiersEditor
          tiers={tiers.map((t) => ({
            minTenureYears: t.minTenureYears,
            accrualPct: t.accrualPct.toString(),
          }))}
        />
      </section>
    </div>
  );
}
