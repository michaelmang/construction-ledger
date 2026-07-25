# Construction-First Accounting Tool — Build Spec

## 1. Product summary

A minimal, job-centric accounting tool for a construction business owner/CFO who is
comfortable using software but does not want to hand-edit plain-text ledger files or
learn hledger's query syntax. hledger is the accounting engine underneath (double-entry
correctness, balances, audit trail via git-friendly text files). Everything the user
touches is a web UI built around **Job** as the primary object, with **Cost Code**,
**Retainage**, and **WIP** as first-class concepts — not bolted-on reports.

Guiding rule for every screen: the user should never need to know hledger exists.

---

## 2. Architecture

```
┌───────────────────────────┐
│  Next.js App (React + TS)  │  Job-centric screens, forms, reports
│  Tailwind for styling      │
└──────────────┬──────────────┘
               │ calls (same repo)
┌──────────────▼──────────────┐
│  Next.js API routes / server  │  Translation layer:
│  actions (TypeScript)         │  - validates domain input (job, cost code, amounts)
│                                │  - generates hledger journal entries
│                                │  - shells out to hledger CLI for balances/registers
│                                │  - computes WIP, retainage, job profitability
│                                │  - reads/writes jobs/cost-codes metadata via Prisma
└──────────────┬──────────────┘
               │ Prisma ORM          │ writes/reads (child_process)
┌──────────────▼──────────────┐  ┌──────────────────────────┐
│  SQLite (via Prisma)          │  │  hledger journal file(s)  │
│  jobs, cost codes, budgets,   │  │  Plain text, git-committed │
│  change orders, billings      │  │  for audit history         │
└───────────────────────────────┘  └──────────────────────────┘
```

Single Next.js application, no separate API server: the UI (React/TypeScript,
Tailwind) and the translation layer (API routes or server actions, also
TypeScript) live in one codebase. Prisma is the ORM for the metadata database;
hledger stays a separate plain-text journal invoked via child process, since it
is not something an ORM should manage.

**Why a metadata DB alongside the journal:** hledger has no native concept of "Job" or
"Cost Code" as structured entities with attributes (client name, contract value,
start date, status, retainage %). Model these in a small SQLite database, and use
hledger **tags** to link each transaction back to its job/cost code. The journal stays
the source of truth for money movement; SQLite is the source of truth for job metadata.

---

## 3. Data model

### 3.1 Prisma schema (SQLite datasource)

```prisma
// schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Job {
  id             Int              @id @default(autoincrement())
  code           String           @unique   // short slug used in hledger tags, e.g. "J2026-014"
  name           String                     // "Smith Residence Addition"
  clientName     String?
  contractValue  Decimal?
  retainagePct   Decimal          @default(0.10)
  status         String           @default("active") // active | complete | archived
  startDate      DateTime?
  targetEndDate  DateTime?
  notes          String?
  budgets        JobBudget[]
  changeOrders   ChangeOrder[]
  billings       ProgressBilling[]
}

model CostCode {
  id           Int         @id @default(autoincrement())
  code         String      @unique  // e.g. "03-CONCRETE", "06-CARPENTRY"
  name         String
  csiDivision  String?
  budgets      JobBudget[]
}

model JobBudget {
  jobId           Int
  costCodeId      Int
  budgetedAmount  Decimal
  job             Job      @relation(fields: [jobId], references: [id])
  costCode        CostCode @relation(fields: [costCodeId], references: [id])

  @@id([jobId, costCodeId])
}

model ChangeOrder {
  id            Int       @id @default(autoincrement())
  jobId         Int
  coNumber      String?
  description   String?
  amount        Decimal            // can be negative
  approvedDate  DateTime?
  status        String    @default("pending") // pending | approved | rejected
  job           Job       @relation(fields: [jobId], references: [id])
}

model ProgressBilling {
  id                   Int       @id @default(autoincrement())
  jobId                Int
  billingDate          DateTime?
  periodLabel          String?            // "Pay App #4"
  amountBilled         Decimal
  retainageWithheld    Decimal
  pctCompleteEstimate  Decimal?           // CFO's own estimate for WIP calc
  job                  Job       @relation(fields: [jobId], references: [id])
}
```

Note: SQLite has no native `Decimal` type, so Prisma stores these as strings under
the hood; parse to a decimal library (e.g. `decimal.js`) in application code rather
than using native JS `number` for money math.

### 3.2 hledger journal conventions

Every job-related transaction carries a `job:` tag and `code:` (cost code) tag so the
translation layer can filter/aggregate with hledger's tag queries.

```
2026-07-24 Ace Concrete Supply - footings pour
    ; job:J2026-014, code:03-CONCRETE
    expenses:jobs:J2026-014:concrete       4,200.00 USD
    liabilities:accounts payable:ace concrete

2026-07-24 Progress billing - Smith Residence Pay App #4
    ; job:J2026-014, type:progress-billing
    assets:accounts receivable:smith res    18,000.00 USD
    liabilities:retainage payable:J2026-014  -1,800.00 USD
    income:jobs:J2026-014                  -16,200.00 USD
```

Account naming convention (keeps hledger's own `balance`/`register` reports usable
as a fallback even without the UI):

```
assets:accounts receivable:<job>
assets:retainage receivable:<job>
liabilities:accounts payable:<vendor>
liabilities:retainage payable:<job>
income:jobs:<job>
expenses:jobs:<job>:<cost code>
```

---

## 4. Translation layer responsibilities

This is the part that makes hledger disappear for the user. Concretely, the API
server must:

1. **Never expose raw journal syntax to the UI.** All writes happen through
   structured endpoints (e.g., `POST /jobs/:id/expenses`) that generate the journal
   entry internally.
2. **Validate before writing.** Confirm job exists, cost code exists (or offer to
   create it), amounts balance, dates are well-formed — reject bad input before it
   touches the journal file.
3. **Shell out to hledger for reads**, parsing its JSON output rather than text
   tables:
   - `hledger balance --json` for account balances
   - `hledger register --json` scoped by `tag:job=J2026-014` for job activity
   - `hledger print --json` when the raw entries are needed for the audit view
4. **Own the WIP calculation** (see §5) — this is domain logic hledger has no concept
   of, computed by combining `progress_billings`, `job_budgets`, and actual costs
   pulled from the journal.
5. **Commit journal changes to git** after each write (or batch per session) so the
   audit trail described in the product rationale is real, not aspirational.
6. **Idempotent writes** — every domain transaction (an expense, a bill, a payment)
   maps to exactly one journal entry with a stable ID (e.g., a UUID in a `txnid:` tag)
   so edits/deletes can find and replace the right entry instead of appending
   corrections.

---

## 5. Core reports (the actual product)

### 5.1 WIP (work-in-progress) schedule
For each active job, compute:
- **Contract value** (+ approved change orders) = revised contract value
- **Costs to date** = sum of `expenses:jobs:<job>:*` from hledger
- **Estimated total cost** = costs to date + CFO's remaining-cost estimate (manual input
  per cost code, stored in `job_budgets` as "revised estimate" if it diverges from
  original budget)
- **% complete (cost basis)** = costs to date / estimated total cost
- **Earned revenue** = % complete × revised contract value
- **Billed to date** = sum of `progress_billings.amount_billed`
- **Over/under billing** = billed to date − earned revenue (this is the number CFOs
  actually watch)

### 5.2 Job profitability
Per job: revised contract value − estimated total cost = projected margin, plus
actual margin to date (earned revenue − costs to date).

### 5.3 Retainage aging
Sum of `liabilities:retainage payable:*` and `assets:retainage receivable:*` per job,
with days-outstanding since each progress billing, so the CFO can see what's owed to
subs and what's owed to them.

### 5.4 Cost code breakdown (per job)
Budget vs. actual vs. remaining, by cost code — the "did concrete blow the budget"
view.

### 5.5 Cash position (whole-business)
Standard hledger `balance` output for `assets:*` and `liabilities:*`, presented as a
simple dashboard tile — this one can genuinely just be a thin wrapper on
`hledger balance --json`.

---

## 6. UI screens (minimal set)

1. **Dashboard** — cash position, active jobs list with over/under-billing flag,
   anything overdue on retainage.
2. **Job list → Job detail** — tabs: Overview (WIP summary), Cost Codes (budget vs
   actual), Transactions (chronological, filterable), Billings, Change Orders.
3. **New transaction form(s)** — "Record an expense," "Record a payment received,"
   "Create progress billing" — each a short form, not a debit/credit entry screen.
   The translation layer maps these to correct journal entries under the hood.
4. **Job setup wizard** — create job, set contract value, retainage %, initial cost
   code budgets. This is the "construction-first" onboarding moment — make it good.
5. **Reports** — WIP schedule, job profitability, retainage aging as simple tables/
   exportable views (CSV export is easy since hledger already does CSV natively).

Explicitly **not** in v1: multi-entity support, payroll, bank feed integration,
AIA-formatted PDF pay applications (approximate the data, skip the exact form).

---

## 7. Tech stack

- **Framework:** Next.js (App Router), TypeScript throughout — UI and translation
  layer live in one codebase. Use API routes or server actions for the endpoints
  described in §4; no separate backend service.
- **UI:** React function components, Tailwind for styling. No component library
  required for v1 — forms and tables are simple enough to hand-build with Tailwind
  utility classes; add one later only if the UI grows past what's comfortable to
  hand-roll.
- **ORM/metadata DB:** Prisma, targeting SQLite (see §3.1 for schema). Prisma
  migrations (`prisma migrate dev`) manage schema evolution; Prisma Client is the
  only thing app code uses to touch the metadata DB — no raw SQL.
- **hledger invocation:** shell out via Node's `child_process`, always with `--json`
  or `--output-format=json` where supported; never parse hledger's plain-text tables.
  Keep this in a dedicated module (e.g. `lib/hledger.ts`) so every call site shares
  the same error handling and JSON parsing.
- **Money math:** use `decimal.js` (or similar) everywhere amounts are read from
  Prisma or hledger JSON output — never plain JS `number` for currency.
- **Linting/formatting:** ESLint (with `@typescript-eslint`, `eslint-config-next`,
  and Tailwind's ESLint plugin for class-order linting) and Prettier (with
  `prettier-plugin-tailwindcss` so class lists auto-sort). Run both in CI and as a
  pre-commit hook.
- **Versioning the journal:** initialize the journal directory as a git repo,
  separate from the app's own repo history; the server commits after each write
  with a message like `"expense: J2026-014 concrete $4,200.00"`.

---

## 8. Build order for Claude Code (phased)

**Phase 1 — Engine plumbing**
- Scaffold Next.js app (TypeScript, App Router, Tailwind, ESLint, Prettier configured
  per §7)
- Set up hledger journal file structure and account naming convention
- Prisma schema (§3.1) + initial migration
- API routes/server actions: create job, create cost code, set budget
- API route/server action: record a generic expense → generates + writes journal entry
- Verify with `hledger balance` and `hledger print` from the CLI directly

**Phase 2 — Core transactions**
- Record payment received, record progress billing (with retainage split)
- Change order entry (metadata-only, feeds WIP calc, no journal entry needed unless
  it changes cash)
- Idempotent txnid tagging + edit/delete support

**Phase 3 — Reports**
- WIP schedule calculation + endpoint
- Job profitability + cost code breakdown
- Retainage aging
- Cash dashboard (thin hledger wrapper)

**Phase 4 — UI**
- Job list/detail, transaction forms, job setup wizard
- Reports screens
- CSV export on each report

**Phase 5 — Hardening**
- Git auto-commit on writes
- Basic auth/single-user login (or multi-user if the CFO has staff entering data)
- Input validation edge cases (negative retainage, over-billing warnings, etc.)

---

## 9. Open decisions to make before/while building

- **Single journal file vs. one per year:** one per year is easier for hledger
  performance at scale and for git history readability; the API layer can address
  "current year" by convention.
- **Multi-user access:** if only the CFO uses it, skip auth complexity in v1. If
  subs/PMs need limited entry access, plan role-based permissions from Phase 5, not
  bolted on later.
- **% complete input:** cost-basis (§5.1) is the simplest and most defensible method,
  but some construction CFOs prefer units-completed or an engineer's estimate — worth
  confirming which method your actual user trusts before locking the WIP formula.
