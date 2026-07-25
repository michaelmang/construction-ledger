# V3 Build Instructions — Cost Type & Labor Burden (F17/F18/F19)

Scope: the **delta** between `v3-spec.md` and what has shipped. F1–F16 and all of
Phases A/B/C are live (commits `0153233`, `cb7d7b0`, `21ae61c`, `0b20fb4`). V3
adds exactly three findings — F17 (no cost-type dimension), F18 (labor booked at
gross wages, not burdened cost), F19 (the model for both).

The spec sequenced this as "Phase A.5, before Phase B" — that window is gone, so
this is a **retrofit**: the cost-to-complete grid, transaction filters,
edit/delete flows, Activity page, and seed script already exist and each needs
the new dimension threaded through, and existing journal entries need a backfill
migration. The phases below are ordered so every entry written after Phase 2
lands carries the dimension, and the backfill (Phase 4) runs exactly once.

Implement phase by phase. After each phase: `npx tsc --noEmit`, `npx eslint .`,
`npm test`, and for UI phases `npm run build` (all routes must stay `ƒ Dynamic`)
plus a real browser walkthrough. Commit at each phase boundary.

---

## Design decisions (resolved here, not during implementation)

These settle every "pick one convention" the spec leaves open. Do not revisit
them mid-build.

1. **Journal tag name: `costtype:`, not `type:`.** The `type:` tag already means
   *transaction kind* on billing/payment/bill-payment/overhead/opening entries,
   and `type:` is a reserved hledger query prefix (account types) — the codebase
   already documents that queries must use `tag:type=X`. A second meaning would
   be ambiguous. All cost-type queries use `tag:costtype=X`.

2. **No Prisma enum.** SQLite does not support Prisma enums. `costType` is a
   `String` column; the value set `labor | material | subcontract | equipment |
   other` is enforced by a shared zod enum in `lib/validation.ts` and a single
   exported constant (e.g. `COST_TYPES`) that the UI selector, zod schema, and
   reports all import — one source of truth.

3. **Burden convention (document verbatim in `lib/labor.ts`):** all rate
   components are decimal fractions of base rate.
   `burdenedRate = baseRate × (1 + payrollTaxPct + workersCompPct + benefitsPct)`,
   rounded half-up to cents; `burdenedAmount = burdenedRate × hours`, rounded
   half-up to cents. Gross = `baseRate × hours` (same rounding) — kept for the
   inline delta display only; **the journal posts the burdened amount** (spec:
   the journal is the source of truth for true cost).

4. **Labor credit side: `liabilities:accrued payroll`** (single clearing
   account, add `accruedPayroll()` to `lib/accounts.ts`). Labor is not a vendor
   bill: no vendor, no `Bill` row, no AP posting. Payroll itself stays deferred
   (unchanged v1 decision); the clearing account represents wages+burden owed.
   When the CFO pays payroll externally, an overhead-style "payroll payment"
   flow is out of scope for v3 — note it in the spec's deferred list.

5. **Cost type scope:** required on **job cost entries** (the expense form).
   Overhead expenses keep their existing category dimension and do not get a
   cost type (they are outside job costing). Progress billings, payments, bill
   payments, opening balances: not applicable.

6. **Labor is a new `JournalTxn.kind`: `"labor"`.** It flows through the same
   `recordTransaction`/`updateTransaction`/`removeTransaction` engine (txnid,
   git commit with trailer, edit/delete guards) as every other kind.

---

## Phase 1 — Schema & labor math library

**Prisma (`prisma/schema.prisma`)** — one migration, then `npx prisma generate`
(not automatic in Prisma 7):

- `Employee`: `id`, `name` (unique), `baseRate Decimal`, `payrollTaxPct
  Decimal @default(0)`, `workersCompPct Decimal @default(0)`, `benefitsPct
  Decimal @default(0)`, `active Boolean @default(true)`, `createdAt`. Rates are
  editable; a rate change affects **future** entries only (each `LaborEntry`
  snapshots the rates used).
- `LaborEntry`: `id`, `txnid String @unique`, `employeeId`, `jobId`,
  `costCodeId`, `date DateTime`, `hours Decimal`, `baseRate Decimal`,
  `burdenedRate Decimal`, `grossAmount Decimal`, `burdenedAmount Decimal`,
  `memo String?`, relations to `Employee`/`Job`/`CostCode`, `createdAt`.
  Snapshotting rates on the row makes edits deterministic and the gross-vs-
  burdened delta renderable forever without recomputing from mutable employee
  rates.
- `Bill`: add `costType String?` — semantically required for **job** bills
  going forward (enforced in zod, backfilled in Phase 4), stays `NULL` for
  overhead bills.

**`lib/labor.ts`** (pure functions, no I/O — same ethos as `lib/wip.ts`):
`burdenedRate(components)`, `laborAmounts(components, hours) → { gross,
burdened }`, with the convention comment from Design Decision 3. All math in
Decimal; no floats.

**`lib/accounts.ts`:** add `accruedPayroll(): "liabilities:accrued payroll"`.

**`lib/validation.ts`:** `costTypeSchema` (zod enum from `COST_TYPES`),
`createEmployeeSchema`, `recordLaborSchema` (employeeId, jobId, costCodeId,
hours > 0, date, memo?), `editLaborSchema`; extend `recordExpenseSchema`/
`editExpenseSchema` with required `costType` (excluding `"labor"` — labor goes
through its own action).

**Tests (`test/labor.test.ts`):** hand-computed fixtures for `burdenedRate` and
`laborAmounts` — include a rounding edge (e.g. base 33.33/hr, 7.65% + 9.5% +
11% over 7.75 h) verified by hand, and the zero-burden case (burdened == gross).

*Accept:* migration applies cleanly to the existing dev DB (additive only —
existing rows untouched); `prisma generate` succeeds; labor unit tests pass
against hand-computed values; typecheck/lint/test suite green.

## Phase 2 — Entry flows (actions + forms)

After this phase, every new job-cost entry carries `costtype:`; do this before
touching reports so Phase 3 has data to pivot.

**`app/actions/expenses.ts`:** `buildExpenseEntry` gains `costType`; adds
`costtype: <value>` to the entry tags (alongside `job:`, `code:`, `vendor:`)
and writes `Bill.costType`. Edit path re-tags on `replaceEntry` (tags are
rewritten wholesale — verify the edited entry still carries the tag).

**`app/actions/labor.ts`** (new): `recordLaborCost`, `editLaborCost`,
`deleteLaborCost`, mirroring the expense action structure (`ActionResult`, zod
parse, `ActionError`, revalidate paths). Posting:

```
Dr  expenses:jobs:<job>:<code>     burdenedAmount
Cr  liabilities:accrued payroll    burdenedAmount
```

Tags: `job:`, `code:`, `costtype:labor`, `employee:<slug>` (slug via the same
lowercase/trim convention as `vendorAccountSlug`). Kind `"labor"`. Description/
memo: `"<Employee> — <hours>h <code>"` (+ user memo). Creates/updates/deletes
the `LaborEntry` row in the same action. Commit messages follow the house
format: `labor: <job> <code> $X` / `edit labor: …` / `delete labor: …` (the
txnid trailer is added by `lib/transactions.ts` automatically).

**Employees admin:** sidebar gains "Employees" (`components/Sidebar.tsx`);
`/employees` page modeled on `/accounts` — inline create form (name, base rate,
three burden %s), table listing employees with computed burdened rate column
and active toggle. `app/actions/employees.ts`: `createEmployee`,
`updateEmployee` (rate edits), `setEmployeeActive`.

**Expense form (`…/transactions/expenses/new/ExpenseForm.tsx`):** required
cost-type selector, default empty. Selecting `labor` swaps vendor+amount for
employee picker + hours, shows the live inline delta — `Gross: $1,200.00 ·
Burdened: $1,542.00 (+28.5%)` — computed client-side from the employee's rates
(pass employees to the form as **pre-formatted plain objects**; Decimal
instances cannot cross the RSC boundary — this bug has recurred four times,
map to strings/numbers at the page level). Submit routes to `recordLaborCost`
vs `recordExpense` by selected type.

**Edit/delete parity (F11 retrofit):** labor rows in the Transactions tab get
the same inline edit/delete actions; edit route
`…/transactions/labor/edit/[txnid]` prefills employee, hours, date, memo from
`LaborEntry`. Reuse the confirm-in-place pattern (no `window.confirm`).

**Filters (F14 retrofit):** Transactions tab adds a cost-type filter,
implemented as `tag:costtype=X` via `getJobTransactionsGrouped`'s existing
`extraQueryTerms`.

**Activity (F13 retrofit):** add `labor` to the `KIND_LABEL`/`KIND_TONE` maps
in `app/activity/page.tsx` (tone: negative, like other cost kinds).

*Accept (browser-verified against the running app):* recording a labor entry
for a test employee posts the hand-computed burdened amount (`hledger print`
shows the entry; `hledger check` passes); the inline delta matches; a non-labor
expense now requires a cost type and its journal entry carries `costtype:`;
labor edit changes hours and the journal amount follows; labor delete removes
entry + `LaborEntry` row; Activity shows a humanized "Recorded labor …" line.
Integration tests (`test/v3-labor.test.ts`, hermetic `mkdtemp` + `git init`
fixture pattern, `vi.mock("next/cache")`): record/edit/delete labor round-trip
reconciled against real hledger output; expense-with-costtype tag presence.

## Phase 3 — Reports & dashboard

**Cost pivot (job level):** the job Cost Codes tab's breakdown gains a by-type
dimension. Extend `lib/queries.ts` with a helper that runs one
`hledger balance` per cost type (`["tag:job=<code>", "tag:costtype=<t>"]`) —
or a single register parse grouped in JS if the per-type calls are noticeably
slow — feeding `lib/wip.ts` pure pivot math (`CostTypePivotRow`: costCode ×
{labor, material, subcontract, equipment, other, untyped, total}). Render as a
second table under the editable grid: rows = cost codes, columns = types,
right-aligned mono, `untyped` column only shown when nonzero (pre-backfill
data). Company-wide variant at `/reports/cost-types` with per-job rows, CSV
route matching the existing report/CSV pattern.

**Dashboard (F19):** "Labor as % of revenue" — company-wide
`tag:costtype=labor` expense total ÷ total income, shown as a StatCard with a
monthly AreaChart trend (reuse `getCashTrend`'s month-sampling approach;
remember the exclusive `date:-DATE` boundary — add one day).

**WIP/profitability:** no formula changes — burdened labor flows into costs
via the journal automatically. Verify the reconciliation tests still pass
untouched; that's the proof the dimension is orthogonal.

*Accept:* pivot row+column totals reconcile with `hledger balance` per tag
(reconciliation test, same pattern as `test/phase-b-aging.test.ts`); dashboard
labor-% matches hand-computation on seed data; `npm run build` all-dynamic.

## Phase 4 — Backfill migration & seed

**`scripts/backfill-cost-types.ts`** (pattern: `scripts/
migrate-retainage-receivable.ts` — idempotent, txnid-based `replaceEntry`,
single commit `migration: cost type backfill`):

- Selects journal entries with a `job:` tag and no `costtype:` tag, kind
  `expense`.
- Infers type from an explicit mapping table at the top of the script
  (vendor-slug → type; falls back to cost-code prefix → type; final fallback
  `other`) — the mapping is data the operator edits before running, not a
  prompt loop.
- Rewrites tags via `replaceEntry`, sets `Bill.costType` in the same pass.
- Idempotent: entries already tagged are skipped; safe to re-run.
- Does **not** retro-burden historical labor (there are no historical labor
  entries — labor was never enterable before v3; state this in the script
  header so nobody "fixes" it later).

**`scripts/seed-demo.ts`:** add 2–3 employees with distinct burden profiles;
give every job expense a cost type; add labor entries on the two active jobs
(so the pivot, filter, and dashboard labor-% render with real density). Note:
re-running the seed wipes DB + journal repo — **ask the user before running**,
as established.

**Docs:** update `docs/v3-spec.md`'s deferred list (payroll payment flow, per
Design Decision 4) if the user wants the spec kept current.

*Accept:* backfill on a copy of the current dev journal leaves zero untyped
job-cost entries and `hledger check` passes; re-run is a no-op; fresh
`seed:demo` produces a dashboard with labor-%, a populated pivot, and no
`untyped` column; full verification ritual green (tsc, eslint, all tests,
build, browser walkthrough of: expense form both modes, employees page,
transactions filter, pivot report, Activity).

---

## Standing gotchas (all hit previously in this codebase — re-read before starting)

- Prisma 7: `prisma generate` is manual after every migration; SQLite has no
  enums; datasource URL lives in `prisma.config.ts`.
- hledger: `type:` is a reserved query prefix — always `tag:name=value`
  queries; `date:-DATE` end boundary is exclusive.
- RSC boundary: no Decimal instances, no functions as props to client
  components — pre-format to strings at the page level.
- `router.refresh()` re-renders server data but does not remount client
  components — reset local state via `key`, never `useEffect`+`setState` (the
  `react-hooks/set-state-in-effect` rule blocks it).
- Every new page: `export const dynamic = "force-dynamic"`.
- Server-action tests: `vi.mock("next/cache", () => ({ revalidatePath:
  vi.fn() }))` + hermetic `mkdtemp`/`git init` journal fixtures with full
  afterEach cleanup.

Suggested prompt per phase: *"Implement Phase N of
docs/v3-build-instructions.md. Verify against the acceptance criteria and show
me the evidence."*
