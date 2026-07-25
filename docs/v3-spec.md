# Construction Ledger — v2 Audit & Spec

Audit of the v1 app (all five BUILD-INSTRUCTIONS phases complete, committed, pushed)
against the goal: **a QuickBooks alternative a construction-company CFO would
actually be happy to run job costing in**, plus a full visual redesign toward the
reference aesthetic (dark, premium, gold-accented — see §4).

This is a spec, not code. Implement phase by phase (§5); each phase has acceptance
criteria. Facts below were verified against the code, not assumed.

---

## 1. What v1 gets right (keep, don't rework)

- The engine split: hledger journal as money source-of-truth, Prisma/SQLite for
  metadata, txnid-tagged entries with in-place edit/delete, git auto-commit audit
  trail, in-process write serialization. All tested (44 tests). Leave it alone.
- Pure-function report math (`lib/wip.ts`) with hand-computed test fixtures.
- The "hledger never leaks into the UI" rule — humanized accounts everywhere.
- Server-action boundary with zod validation; `ActionResult` with warnings.

## 2. Audit findings — correctness & domain modeling

### F1 (critical): Retainage on client billings is booked on the wrong side

Current progress-billing entry (`app/actions/billings.ts`):

```
Dr  assets:accounts receivable:<job>        amountBilled       (full 20,000)
Cr  liabilities:retainage payable:<job>     retainage           (2,000)
Cr  income:jobs:<job>                       net                (18,000)
```

Two problems, both inherited from the original build-spec's §3.2 example:

1. **Direction.** Retainage a *client* withholds from *our* pay app is money owed
   TO us — an asset (`assets:retainage receivable:<job>`), not a liability.
   `liabilities:retainage payable` should be reserved for retainage *we* withhold
   from *subcontractor* invoices. The code even defines `retainageReceivable()` in
   `lib/accounts.ts` and the retainage report queries it — but nothing ever posts
   to it, so that column is permanently zero while the payable column shows what
   is actually receivable.
2. **AR overstatement.** AR is debited the full billed amount, but the client only
   owes the net. In the v1 walkthrough: billed 20,000, client paid 15,000 → AR
   shows 5,000, but the client actually owes 3,000 (18,000 net − 15,000). Phantom
   AR compounds with every billing. Income is also understated (percentage-of-
   completion treats withheld retainage as earned).

**Correct entry:**

```
Dr  assets:accounts receivable:<job>        net (amountBilled − retainage)
Dr  assets:retainage receivable:<job>       retainage
Cr  income:jobs:<job>                       amountBilled (full)
```

**Sub-side retainage** becomes an optional split on the expense form (see F6):
withholding from a sub credits `liabilities:retainage payable:<job>` for the
withheld portion and AP for the rest.

**Migration:** journal data is still one seed entry plus whatever the user has
entered. Write a one-off script that rewrites existing `type:progress-billing`
entries by txnid (the engine's `replaceEntry` already does this safely), commit as
`migration: retainage receivable rework`. Update `test/reports.test.ts` fixture
and the retainage-aging report (payable/receivable columns swap meaning: aging now
tracks *receivable* per billing; payable aggregates sub withholdings).

### F2 (critical): AP is a roach motel — bills go in, nothing ever comes out

`recordExpense` credits `liabilities:accounts payable:<vendor>`; **no code path
ever debits AP.** There is no "pay a vendor bill" flow, so AP balances grow
forever and the cash position is permanently wrong after the first real payment.
A CFO cannot run a business where paying subs isn't representable. See F6.

### F3 (high): The WIP schedule's most important input has no UI

`JobBudget.revisedEstimate` (the CFO's cost-to-complete revision) drives
"estimated total cost" → % complete → earned revenue → over/under billing. It
exists in the schema and the math, and there is **no way to enter it** in the app.
The WIP report silently degrades to original budgets. See F7.

### F4 (medium): Dead field `pctCompleteEstimate`

Stored on every billing, validated, never read by any calculation or screen.
Decision (per original spec §9, cost-basis stays the method): keep the field,
surface it as an informational "CFO % est." column beside cost-basis % on the WIP
report so divergence is visible. If that's not wanted, drop the field instead —
either way, stop silently collecting unused data.

### F5 (medium): Cash position is fiction until opening balances exist

The dashboard's headline number is derived solely from journal entries, which
start from zero. No opening-balance flow, no non-job (overhead) expenses, and the
cash account is hardcoded to `assets:checking`. Result: "Cash Position −$4,200"
for a company with money in the bank. See F8/F9.

### F17 (critical): No cost-type dimension — the exact gap that makes QuickBooks unusable for job costing

Every cost is tagged by `job:` and `code:` (cost code — concrete, framing,
electrical…) and nothing else. There is no way to slice costs by **what kind**
of cost they were: labor, material, subcontract, or equipment. This is not a
UI gap, it's a schema gap — `code:` conflates two independent dimensions
(scope of work vs. type of cost) into one tag, so no report can answer:

- "What % of total cost across all jobs is labor vs. subs vs. materials?"
- "Is Concrete over budget because of material price increases, or because we
  self-performed work we bid as sub work?"
- "Which jobs are subcontract-heavy vs. labor-heavy?" (a real signal of margin
  risk, since self-performed labor usually carries different risk/margin than
  subbed-out scope)

This is the specific, named weakness of QuickBooks and most small-business
accounting tools for construction: cost code (or "class") exists, cost *type*
does not, so users fork sub-accounts (`Concrete - Labor`, `Concrete - Material`)
as a workaround, which breaks any cross-job or cross-code rollup. Replicating
that workaround here would mean this app has the same weakness it's meant to
fix. See F19 for the model.

### F18 (critical): Labor cost is gross wages, not true (burdened) cost — job profitability is systematically overstated

`recordExpense` has no concept of an employee, a labor rate, or a burden
multiplier. A labor cost entered against a job is whatever dollar amount was
typed in — in practice, gross wages or a rough hourly estimate. This
understates the actual cost of labor to the business, often substantially,
because it omits:

- Employer payroll taxes (FICA, FUTA, SUTA)
- Workers' comp insurance (rate varies by trade/class code — framing and
  roofing carry materially higher rates than office/admin)
- Benefits (health insurance, 401(k) match, PTO accrual)

Every downstream number that depends on job cost — WIP's "costs to date" and
"estimated total cost" (§5.1), job profitability (§5.2), cost code breakdown
(§5.4) — inherits this understatement. A job that looks like it's running at a
healthy margin on gross-wage numbers can be marginal or losing money once
burden is applied. This is the second named gap: most tools that do have some
notion of labor cost still require a manual, error-prone workaround (a fixed
"burden %" fudge factor applied inconsistently, or none at all) rather than
computing it from actual rate components per employee. See F19 for the model.

## 3. Audit findings — missing CFO workflows & UX

- **F6 — Vendors & AP.** Vendors are free-text (typos silently fork AP accounts:
  "Ace Concrete" ≠ "ace concrete supply"). Need: a `Vendor` model + directory
  page, vendor picker (with inline-create) on the expense form, **pay-bill flow**
  (Dr AP / Cr cash, optionally against specific open bills), optional sub
  retainage withholding per expense (F1), and an **AP aging report**.
- **F7 — Cost-to-complete editor.** Editable grid on the job's Cost Codes tab:
  budget | actual | revised estimate-at-completion | remaining. Saving updates
  `revisedEstimate` and the WIP recomputes. This is the CFO's weekly ritual —
  make it the best screen in the app.
- **F8 — Opening balances & accounts.** Small "Accounts" settings page: define
  cash accounts (checking, savings), enter opening balances (posted as an
  `equity:opening balances` journal entry), pick default cash account. Payment
  and pay-bill forms get an account selector.
- **F9 — Overhead (non-job) expenses.** `expenses:overhead:<category>` entries
  with a category picker (office, insurance, fuel…). Without this it can't
  replace QuickBooks; with it the cash position and a simple P&L become real.
- **F10 — Payments applied to billings → AR aging.** Link payments to specific
  progress billings (`PaymentApplication` join or nullable `billingId`), show
  paid/unpaid status per pay app, add an **AR aging report** (current/30/60/90).
- **F11 — Edit & delete in the UI.** The engine and server actions
  (`editExpense`, `deleteExpense`, `editPayment`, `deleteProgressBilling`, …)
  exist; **no component calls them.** Add row actions on Transactions/Billings
  (edit prefills the same form; delete confirms with the entry summary).
- **F12 — Job lifecycle.** Buttons to mark complete / archive / reactivate
  (status field exists; only "active" is reachable today). Completed jobs drop
  off the dashboard but stay in reports.
- **F13 — Audit trail page.** The git history + `hledger print` audit view is
  v1's differentiator vs QuickBooks and it's invisible. Read-only "Activity"
  page: reverse-chron list from the data repo's `git log` (message, timestamp)
  with expandable humanized entry detail. No raw journal syntax.
- **F14 — Transaction filters.** Description-only today. Add date range, type
  (expense/payment/billing), cost code, vendor.
- **F15 — Dashboard depth.** Add: total over/under billing across jobs, AR/AP
  totals, retainage held, cash trend chart (§4), over-budget cost-code alerts
  ("Concrete on J2026-014 is 112% of estimate").
- **F16 — Seed/demo script.** `npm run seed:demo` generating a realistic
  3-job dataset so the redesigned UI can be evaluated with real-looking density.
- **F19 — Cost type & labor burden (model for F17/F18).**
  - **Schema:** add `CostType` enum (`labor`, `material`, `subcontract`,
    `equipment`, `other`) as a **required** field on every job cost entry,
    independent of `CostCode`. Add an `Employee` model: name, base hourly rate,
    payroll tax rate, workers' comp rate (per employee or per trade/class),
    benefits cost (flat $/hr or %), with a computed `burdenedRate` (base rate ×
    (1 + tax% + comp% + benefits%), or base + flat additions — pick one
    convention and document it in `lib/labor.ts`).
  - **Journal tagging:** every job cost entry gains a `type:` tag alongside
    `job:` and `code:` (e.g. `type:labor`). Labor entries additionally post the
    **burdened** amount, not gross wages — the journal is the source of truth
    for true cost, per the app's own principle that hledger reflects reality.
  - **Expense form:** cost type becomes a required selector. Selecting "labor"
    swaps the amount field for an employee picker + hours, computes the
    burdened cost automatically, and shows a small gross-vs-burdened delta
    inline (e.g. "Gross: $1,200 · Burdened: $1,542 (+28.5%)") so the CFO sees
    the workaround other tools hide, not just a final number.
  - **Reports:** cost code breakdown (§5.4) becomes a two-dimensional
    pivot — cost code × cost type — so both "is Concrete over budget" and "is
    labor over budget company-wide" are answerable from the same data. Add a
    company-wide "labor as % of revenue" trend to the dashboard (§4.4) as a
    margin-risk signal.
  - **Migration:** existing expense entries have no `type:` tag. Write a
    one-off script (same pattern as F1's migration) that prompts for or
    infers a cost type per existing entry, rewrites by txnid, and commits as
    `migration: cost type backfill`. Do this **before** Phase B workflows that
    build on top of cost codes, since every entry created after F19 lands
    needs the dimension present from day one — retrofitting later means a
    second migration on top of real user data.

Deferred (unchanged from v1 decisions): auth, multi-entity, payroll, bank feeds,
AIA pay-app PDFs, per-cost-code schedule-of-values billing, CSV bank import
(worth revisiting after F6–F10 land).

---

## 4. Aesthetic redesign — "Castmark" vibes

Reference: dark near-black surfaces, warm gold accent, big confident numerals,
status pills, thin borders, generous spacing, mono for identifiers. Translate the
*landing page* language into a *data-dense product UI*. Dark-only; delete the
light theme.

### 4.1 Design tokens (define once in `app/globals.css` via Tailwind `@theme`)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0B0B09` | page background |
| `--color-surface` | `#141311` | cards, tables, sidebar |
| `--color-surface-2` | `#1C1A16` | nested/hover surfaces, inputs |
| `--color-border` | `rgba(255,255,255,0.08)` | all 1px borders |
| `--color-text` | `#F4F2ED` | headings, primary values |
| `--color-text-2` | `#A8A29A` | body, labels |
| `--color-text-3` | `#6E6961` | micro-labels, hints |
| `--color-accent` | `#E8B64C` | primary buttons, active nav, chart line, eyebrows |
| `--color-accent-soft` | `rgba(232,182,76,0.12)` | accent pill/tint backgrounds |
| `--color-positive` | `#4CAF6E` (+ 12% tint bg) | active status, positive margin |
| `--color-negative` | `#E4574B` (+ 12% tint bg) | overdue, over budget, rejected |
| `--color-warn` | `#E8B64C` tint | pending, underbilled flags |

Radii: cards `rounded-xl` (12px), pills `rounded-full`, inputs `rounded-lg`.
Type: keep Geist Sans; **Geist Mono + `tabular-nums` for every number, job code,
and cost code**. Micro-labels: 11px, uppercase, `tracking-widest`, `--color-text-3`.
Section eyebrows: same treatment in `--color-accent` (e.g. "WORK IN PROGRESS").

### 4.2 Layout

Replace the top nav with a **fixed left sidebar** (~230px, `--color-surface`,
right border): logo wordmark, then Dashboard, Jobs, Vendors (F6), Reports,
Cost Codes, Activity (F13), Accounts (F8). Active item: accent text + soft-accent
background + 2px accent left rule. Content area: `--color-bg`, max-w-6xl, roomier
vertical rhythm than v1 (section gaps ~40px). Page header pattern: eyebrow label,
H1, right-aligned primary action.

### 4.3 Core components (hand-rolled, no component library — keep v1's ethos)

- **StatCard**: micro-label, large mono value (28–32px), optional sub-line
  (delta or context) in text-3. Dashboard hero row uses 4 of these.
- **Pill**: tinted translucent status badge — `Active` (positive), `Pending`
  (warn), `Complete` (neutral), `Archived`/`Rejected` (negative), `Overbilled`/
  `Underbilled` on jobs. Never color-only: keep the text.
- **Table**: surface card, text-3 uppercase 11px header row, hairline row
  dividers, row hover `--color-surface-2`, numeric columns right-aligned mono.
- **Buttons**: primary = accent bg, **black text**, medium weight, subtle
  hover-brighten; secondary = transparent, 1px border, text-2; destructive =
  negative-tint outline.
- **Inputs/selects**: `--color-surface-2` bg, 1px border, accent border+ring on
  focus, text-3 placeholders. Field labels stay small/medium weight.
- **AreaChart (SVG, hand-rolled ~80 lines)**: accent 1.5px line, vertical
  gradient fill accent→transparent, no axes clutter — just min/max labels and a
  hover tooltip. Used for cash-over-time (dashboard, from cumulative hledger
  register on cash accounts) and costs-per-month (job overview).
- **EmptyState**: centered micro-label + one-line prompt + primary action.

### 4.4 Screen-by-screen

- **Dashboard**: hero StatCard row (Cash, AR outstanding, AP open, Retainage
  held) → cash trend AreaChart card → Active Jobs table (job, % complete with a
  thin accent progress bar, billed, earned, over/under Pill) → Alerts list
  (over-budget cost codes, retainage 60+, unpaid pay apps 30+).
- **Job detail**: header gains margin summary (projected margin StatCard inline)
  and a status Pill + lifecycle menu (F12). Tabs: accent underline for active.
  Overview keeps the 9 stats as redesigned StatCards + costs-by-month chart.
  Cost Codes tab becomes the F7 editable grid with per-row utilization bars
  (accent → negative when >100%).
- **Wizard**: dark stepper with accent step numbers (the reference's numbered
  "how it works" circles), one card per step, review summary before submit.
- **Forms**: two-column card layout on wide screens; billing form's retainage
  preview panel becomes a soft-accent tinted summary box.
- **Reports**: each report page gets an eyebrow, a one-line description, summary
  StatCards above the table, and the CSV button as secondary. WIP gains the
  "CFO % est." column (F4).
- **Vendors / Accounts / Activity**: new pages, same table/card patterns.

Accessibility: body text ≥ 4.5:1 on surfaces (the token values above pass);
status never conveyed by color alone; focus rings visible (accent).

---

## 5. Implementation phases

**Phase A — Accounting correctness (do first, before more real data lands)**
F1 retainage rework + migration script, F2/F6 vendor model + pay-bill flow +
expense vendor picker, F8 accounts & opening balances, F9 overhead expenses.
*Accept:* corrected billing entry verified by an updated reports fixture test;
paying a bill reduces AP and cash correctly under `hledger check`; retainage
report shows receivable aging per billing and payable total from sub
withholdings; dashboard cash matches bank reality after opening balances.

**Phase A.5 — Cost type & labor burden (do immediately after Phase A, before Phase B)**
F17/F18/F19 in full: `CostType` enum + `Employee`/burden model, `type:` journal
tag on every cost entry, expense form cost-type selector with burdened labor
entry, migration/backfill of existing entries. Sequenced here — after Phase A's
schema/migration work is fresh, before Phase B builds cost-to-complete (F7) and
cost code breakdown UI on top of cost codes — so those screens are built against
the two-dimensional (code × type) model once, not retrofitted afterward.
*Accept:* every new expense requires a cost type; a labor entry against a test
employee posts the burdened amount to the journal (verified against a
hand-computed fixture in `lib/labor.ts` tests); cost code breakdown report
pivots correctly by type; migration script backfills existing entries and
`hledger check` still passes; dashboard shows labor-as-%-of-revenue.

**Phase B — CFO workflows**
F7 cost-to-complete editor, F10 payment application + AR aging, F6 AP aging,
F11 edit/delete UI, F12 lifecycle, F14 filters, F4 decision.
*Accept:* editing a revised estimate visibly moves WIP % complete; AR/AP aging
totals reconcile with hledger balances (test); an expense can be corrected and
deleted entirely from the UI with git commits recorded.

**Phase C — Redesign**
§4 in full: tokens → sidebar layout → components → screens, plus F13 Activity,
F15 dashboard depth, F16 demo seed. Redesign lands after Phase A/A.5/B so new
screens (Vendors, Accounts, aging reports, cost-type pivots) are built dark-first
once, not twice.
*Accept:* no light-theme remnants; every number/code in mono tabular; a full
browser walkthrough on demo data matches §4.4 per screen; existing 44+ tests
still green; `npm run build` all-dynamic as in v1.

Suggested prompt per phase: *"Implement Phase N of V2-SPEC.md. Verify against the
acceptance criteria and show me the evidence."*
