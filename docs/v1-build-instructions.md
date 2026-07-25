# Construction Ledger — Build Instructions

Executable build spec for the construction-first accounting tool described in
`~/Downloads/construction-ledger-spec.md` (the "product spec"). This document turns
that spec into ordered, verifiable instructions. Run it phase by phase; each phase
ends with acceptance checks that must pass before moving on.

Guiding rule inherited from the product spec: **the user should never need to know
hledger exists.** Every screen and endpoint is job-centric; hledger is an internal
engine.

---

## 0. Environment setup (do this first)

Current state of this machine (verified 2026-07-24):

- `~/construction-ledger/` exists but is **empty**.
- `~` (the home directory) is itself a git repository. The app must be its own
  repo: run `git init` inside `~/construction-ledger`. Git treats nested repos as
  untracked by the outer repo, so this is safe — but do **not** rely on the home
  repo for the app's history.
- **hledger is not installed.** Install it before Phase 1:
  ```sh
  brew install hledger
  hledger --version   # expect >= 1.32 (JSON output support is required)
  ```

Setup steps:

1. `git init` in `~/construction-ledger`.
2. Verify Node >= 20 (`node --version`); install via nvm if missing.
3. Install hledger as above.
4. Create the journal data directory at `~/construction-ledger-data/` (sibling of
   the app repo, NOT inside it — the product spec §7 requires the journal to have
   its own git history, separate from app code). Run `git init` there too.

Acceptance: `hledger --version` works; two independent git repos exist
(`~/construction-ledger`, `~/construction-ledger-data`).

---

## 1. Decisions (resolved defaults — change here if desired)

The product spec §9 left three decisions open. Build with these defaults unless
the user says otherwise:

| Decision | Default chosen | Rationale |
|---|---|---|
| Journal file layout | **One file per year** (`2026.journal`, included from `main.journal`) | hledger performance, readable git history |
| Auth / multi-user | **None in v1** (single user, localhost) | Only the CFO uses it; auth is Phase 5 if ever |
| % complete method | **Cost basis** (costs to date ÷ estimated total cost) | Simplest, most defensible; the WIP module must keep this formula in one function so the method can be swapped later |

---

## 2. Project conventions (apply throughout, all phases)

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, Prisma → SQLite,
  `decimal.js` for all money math. No component library. Exact Prisma schema is in
  product spec §3.1 — use it verbatim.
- **Money:** never use JS `number` for currency. Every amount read from Prisma or
  hledger JSON goes through `decimal.js`. Add an ESLint rule or code-review note to
  enforce this in `lib/` modules.
- **hledger access:** one module, `lib/hledger.ts`, owns every `child_process`
  invocation. Always `--output-format=json` / `--json`; never parse text tables.
  All callers get typed results and shared error handling. Use `execFile` (not
  `exec`) with an args array — job codes and tags must never be shell-interpolated.
- **Journal writes:** one module, `lib/journal.ts`, owns entry generation,
  appending to the correct year file, and the txnid convention. Every generated
  entry carries `; txnid:<uuid>` plus `job:` / `code:` tags per product spec §3.2.
  Account naming follows §3.2 exactly.
- **Git commits to the data repo:** one module, `lib/journal-git.ts`. Commit after
  every successful write with messages like `expense: J2026-014 03-CONCRETE $4,200.00`.
- **Server boundary:** UI components never touch Prisma, hledger, or the journal.
  All mutations go through server actions (or route handlers) in `app/`, which call
  `lib/` modules. Validation (zod) happens at this boundary before anything is
  written — job exists, cost code exists, amount is positive where required, dates
  parse, postings balance.
- **Lint/format:** ESLint (`@typescript-eslint`, `eslint-config-next`, Tailwind
  plugin) + Prettier (`prettier-plugin-tailwindcss`), wired as a pre-commit hook
  (husky + lint-staged) and run in CI if CI is ever added.
- **Tests:** Vitest. Every `lib/` module gets unit tests; journal generation and
  WIP math are the highest-value targets. Integration tests may shell out to real
  hledger against a fixture journal in `test/fixtures/`.

Directory sketch:

```
construction-ledger/
  app/                    # Next.js App Router pages + server actions
  lib/
    hledger.ts            # CLI invocation + JSON parsing
    journal.ts            # entry generation, txnid, year-file routing
    journal-git.ts        # auto-commit to data repo
    wip.ts                # WIP + profitability math (pure functions)
    money.ts              # decimal.js helpers, formatting
    validation.ts         # zod schemas for all mutation inputs
  prisma/schema.prisma
  test/
.env                      # DATABASE_URL, JOURNAL_DIR=~/construction-ledger-data
```

---

## 3. Phase 1 — Engine plumbing

1. Scaffold: `npx create-next-app@latest` in `~/construction-ledger` (TypeScript,
   App Router, Tailwind, ESLint). Add Prettier + plugins, husky pre-commit hook.
2. Add Prisma with SQLite; copy the schema from product spec §3.1 verbatim; run
   `prisma migrate dev --name init`.
3. Create `lib/money.ts` (decimal.js wrappers, `formatUSD`).
4. Create `lib/hledger.ts`: `execFile`-based runner, `JOURNAL_DIR` from env,
   functions `balance(query)`, `register(query)`, `print(query)` returning typed
   parsed JSON. Handle the not-installed / non-zero-exit cases with clear errors.
5. Create `lib/journal.ts`: generate a balanced expense entry (per §3.2 example),
   route it to `<year>.journal` based on transaction date, create the year file and
   add an `include` line to `main.journal` if missing.
6. Seed the data repo: `main.journal` + `2026.journal` with a couple of opening
   entries; commit.
7. Server actions: `createJob`, `createCostCode`, `setBudget` (Prisma only);
   `recordExpense` (validates via zod → writes journal entry → returns txnid).
   Minimal throwaway page or route handlers to exercise them — real UI is Phase 4.

**Acceptance:** after calling `recordExpense` for a seeded job,
`hledger -f ~/construction-ledger-data/main.journal balance` shows the expense
under `expenses:jobs:<job>:<cost code>`, and `hledger print tag:job=<code>`
shows the entry with its `txnid:` tag. Unit tests pass for journal generation
(balanced postings, correct accounts, correct year file).

## 4. Phase 2 — Core transactions

1. `recordPayment` (client pays an AR balance): journal entry moving
   `assets:accounts receivable:<job>` → `assets:checking` (or a configurable cash
   account).
2. `createProgressBilling`: writes the `ProgressBilling` row AND the journal entry
   with the retainage split (AR + retainage payable + income, per §3.2 example).
   Retainage amount defaults to `job.retainagePct × amountBilled`, overridable.
3. `createChangeOrder` / `approveChangeOrder`: metadata only, no journal entry.
4. Edit/delete: given a txnid, `lib/journal.ts` must locate the entry in the year
   file and replace or remove it in place (regenerate the file section, not
   append a reversal). Every edit/delete also commits to the data repo.

**Acceptance:** unit tests for retainage math (including 0% and edge retainage);
integration test proving edit-by-txnid replaces exactly one entry and hledger
still parses the file; `hledger balance` reflects payment and billing correctly.

## 5. Phase 3 — Reports (server-side calculations + endpoints)

All report math lives in pure functions in `lib/wip.ts` (inputs in, numbers out —
no I/O) so it's testable without hledger. Server actions assemble inputs from
Prisma + `lib/hledger.ts` and call them.

1. **WIP schedule** per product spec §5.1. Revised contract value = contract +
   approved COs only. Costs to date from hledger by job tag. The over/under
   billing number is the headline output.
2. **Job profitability** (§5.2), **cost code breakdown** (§5.4 — budget vs actual
   vs remaining per code), **retainage aging** (§5.3 — days outstanding computed
   from each billing's date), **cash position** (§5.5 — thin wrapper on
   `hledger balance assets liabilities --json`).
3. CSV serialization helper for each report (plain string building is fine).

**Acceptance:** unit tests covering WIP math with a worked example (hand-computed
expected values in the test), including division-by-zero guard when estimated
total cost is 0; each report endpoint returns correct JSON against fixture data.

## 6. Phase 4 — UI

Build in this order (each screen usable before starting the next):

1. **Job setup wizard** — create job → contract value + retainage % → initial cost
   code budgets (with inline "create cost code" option). This is the flagship
   construction-first moment; keep it a short multi-step form, not one giant page.
2. **Job list → Job detail** with tabs: Overview (WIP summary), Cost Codes
   (budget vs actual), Transactions (chronological, filterable, sourced from
   hledger register by job tag), Billings, Change Orders.
3. **Transaction forms** — "Record an expense," "Record a payment," "Create
   progress billing" as short domain forms (no debit/credit anywhere in the UI).
   Progress billing form shows the computed retainage split before submit.
4. **Dashboard** (home page) — cash position tile, active jobs with over/under
   billing flag, retainage outstanding highlights.
5. **Reports screens** — WIP schedule, profitability, retainage aging as tables,
   each with a CSV download button wired to the Phase 3 serializers.

Explicitly out of scope (per product spec §6): multi-entity, payroll, bank feeds,
AIA-formatted PDFs.

**Acceptance:** full manual walkthrough — create a job via the wizard, record two
expenses and a progress billing via forms, see correct numbers on Job detail,
Dashboard, and WIP report, download a CSV. No raw hledger syntax or account paths
visible anywhere in the UI (job/cost-code names only).

## 7. Phase 5 — Hardening

1. Confirm git auto-commit fires on every write path (expense, payment, billing,
   edit, delete) — add an integration test that counts commits.
2. Validation edge cases: negative retainage rejected; over-billing (billed >
   revised contract) allowed but warned; expense against archived job rejected;
   duplicate job code rejected with a friendly message.
3. Concurrency guard: serialize journal writes (a simple in-process mutex/queue in
   `lib/journal.ts`) so two simultaneous submissions can't interleave file writes.
4. Auth: skipped per §1 decision. If ever needed, add single-user password login
   here — do not retrofit earlier phases.

**Acceptance:** edge-case tests pass; deliberately concurrent writes produce a
valid journal; `hledger check` on the data repo reports no errors.

---

## 8. How to run this spec

In `~/construction-ledger`, prompt Claude Code with:

> Build Phase N of BUILD-INSTRUCTIONS.md. The product spec it references is in
> ~/Downloads/construction-ledger-spec.md. Stop when the phase's acceptance
> checks pass and show me the evidence.

One phase per session keeps context tight. Commit the app repo at each phase
boundary.
