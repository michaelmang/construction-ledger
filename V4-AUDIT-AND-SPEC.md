# V4 Audit & Spec

An audit of Construction Ledger as deployed today (post-Vercel-migration,
post-landing-page), followed by a phased V4 spec. Findings are ranked by
severity and were verified against the running code and the live Vercel
project configuration — not inferred from docs.

**State audited**: Next.js 16 App Router with `(marketing)`/`(app)` route
groups; Prisma 7 → Neon Postgres (prod) / `prisma dev` (local); bundled
hledger 1.52.1 executed from `/tmp`; journal in a private GitHub repo
synced per-container via isomorphic-git with a fine-grained PAT;
container-scoped write mutex + one push-rejection retry; 72 passing vitest
tests; no authentication.

---

## Part 1 — Findings

### What's already solid (don't churn these)

- Money is `Decimal` end-to-end with mono/tabular rendering; no float math
  anywhere in accounting paths.
- Every write is validated by hledger's balanced-entry requirement before
  it lands, and every write produces a git commit with a `txnid` trailer —
  the audit-trail design is genuinely good.
- The txnid design (UUID minted up front, idempotent retry, DB index row
  written only after push) got the hard ordering questions right.
- Test discipline: lib and server-action coverage is real (hand-computed
  fixtures, cross-implementation git checks), and the suite stayed green
  through two architecture migrations.
- Streaming UI (per-section Suspense) and a consistent token-driven design
  system.

### Critical

**C1 — No authentication; production accepts writes from anyone.**
There is no middleware, no session, no guard on any server action. Every
action (`recordExpense`, `removeTransaction`, `setJobStatus`, …) is an
unauthenticated POST endpoint on a public URL. Vercel Deployment
Protection was recommended at deploy time but the production alias
rendered without any visible gate during testing — verify its status
today, and treat auth as the headline V4 feature regardless (protection
is a stopgap that also breaks the landing page's purpose).

**C2 — Preview deployments share the production database but not the
journal remote.** Verified from `vercel env ls`: `DATABASE_URL` is scoped
to Production **and Preview and Development**, while `JOURNAL_GIT_REMOTE`
is Production-only (`JOURNAL_GIT_TOKEN` is Preview+Production). A write on
any preview deployment would therefore mutate production Postgres rows
while committing the journal entry to an ephemeral local repo that
vanishes with the container — permanent, silent DB↔journal divergence.
Nothing prevents this today except nobody having pushed a PR branch. This
is the most dangerous latent bug in the system.

**C3 — No backup exists for the Postgres metadata.** The journal is
durable (GitHub), but jobs, budgets, change orders, bills, paid amounts,
employees, and billing records exist only in Neon — on a free tier with
minimal point-in-time recovery. Losing the DB loses data that **cannot**
be reconstructed from the journal (the journal has no budgets, no bill
statuses, no employee rates).

### High

**H1 — The write pipeline is non-atomic with no reconciliation tool.**
journal write → commit/push → Prisma upsert. A crash or failure after the
push leaves an orphaned journal entry with no `JournalTxn` row (invisible
to the edit/delete UI), and other orderings leave the reverse. Nothing
detects drift between the `JournalTxn` index and the journal's `txnid`
tags — no doctor script, no admin surface, no alert.

**H2 — `hledger check` is dead code.** `check()` exists in `lib/hledger.ts`
and is called by nothing. The app's core promise — books that always add
up — is enforced entry-by-entry at write time, but whole-journal integrity
(parseability, balance assertions after a bad merge/resync) is never
verified in operation.

**H3 — GitHub is a synchronous single point of failure for writes, and
the PAT expires in ~1 year with no expiry story.** When GitHub is down,
writes fail (acceptable, documented). When the token expires, every write
starts failing with an opaque push error and nothing warned anyone. There
is no boot-time env validation, no rotation runbook, no calendar
anywhere.

**H4 — No caching around hledger; reads pay a network tax.** Every
dashboard render spawns ~15–20 hledger processes that each re-parse the
full journal, and `ensureJournalReady` fetches from GitHub on an 8-second
TTL on the read path. Fine at demo scale; the ceiling is low and arrives
as "the dashboard got slow" with no obvious cause. The fix is cheap:
results memoized on (journal HEAD sha, args).

**H5 — Transaction lifecycle coverage is incomplete.** Edit/delete is
wired only for `expense`, `payment`, and `labor`. Bill payments, overhead
expenses, and opening balances are immutable through the UI (a typo'd
bill payment requires manual surgery). Worse for the product's own pitch:
retainage has **aging but no resolution flow** — there is no way to
record releasing/collecting retainage, so every retainage line ages
forever with no way to close it.

### Medium

**M1 — Date/timezone convention is mixed.** The server runs UTC (Vercel);
date math builds local-midnight `Date` objects and slices
`toISOString()`. This is coincidentally correct for UTC-negative offsets
(US) and off-by-one for UTC-positive users; the convention is
undocumented and spread across `lib/date-range.ts`, `lib/reports.ts`, and
form defaults.

**M2 — The app shell is desktop-only.** Fixed 230px sidebar with
`ml-[230px]` main. The landing page is responsive; the app it opens into
is unusable on a phone. Contractors and CFOs check numbers from the
field.

**M3 — Zero observability.** No error tracker, no alerting. The
empty-env-var incident during deploy was only diagnosable by manually
tailing `vercel logs` after a user saw a broken page. Push-retry
exhaustion, check failures, and token auth failures are all silent today.

**M4 — No e2e regression net.** All UI verification this whole project
has been manual browser QA. The 72 vitest tests cover lib/actions well,
but nothing catches a broken form wire-up or a route regression before a
human clicks it.

**M5 — Deletes are hard deletes.** Git history preserves the record, but
the ledger state loses it, and the Activity page is a viewer, not a tool
— there's no way to restore or revert from history in-app. Accounting
convention prefers void/reversing entries; at minimum the audit trail
should be actionable.

### Low

- `maxDuration` never set; report pages fan out many hledger calls and
  will hit default function limits before anyone tunes it deliberately.
- Form a11y: errors aren't associated via `aria-describedby`/
  `aria-invalid`; focus isn't moved to the error summary on failure.
- `JobStatusMenu` duplicates Pill tone styling in a local constant.
- `getOverBudgetAlerts` loops jobs serially, each spawning hledger calls.
- Robots is globally noindex — correct today, but the flip (landing
  indexable, app not) should be a one-line documented change when auth
  lands.
- The landing page reuses the app-wide OG card; a marketing-specific card
  would be stronger once the page is shareable.

---

## Part 2 — V4 Spec

Four phases, ordered by risk-retired-per-day. Phase 0 is hours of work
and removes the two silent data-loss risks; Phase 1 is the headline.

### Phase 0 — Safety rails (do first, ~1 day)

1. **Isolate previews from production data.** Either scope
   `DATABASE_URL`/`DATABASE_URL_UNPOOLED` (and all `PG*`/`POSTGRES_*`
   vars) to Production only, or wire Neon's branch-per-preview. Add a
   boot-time guard in `lib/db.ts`-adjacent code: if `VERCEL_ENV` is
   `preview` and the DB host equals the production host, **refuse writes**
   (throw in every action) — env-var misconfiguration should fail loud,
   not diverge silently.
2. **Boot-time env validation.** One module, imported early: in
   production, assert `JOURNAL_GIT_REMOTE`, `JOURNAL_GIT_TOKEN`,
   `JOURNAL_DIR`, `DATABASE_URL` are present and non-empty (the
   empty-string env bug from deploy week would have been a clear error
   instead of a 500). Fail the build/boot with a named message.
3. **Metadata snapshot = the DB backup.** Nightly (Vercel cron route):
   serialize every Prisma table to JSON and commit it to the journal repo
   under `snapshots/`. The entire company state — ledger and metadata —
   then lives in one private, durable, versioned repo. Include a
   documented restore script. This also future-proofs Neon-tier choices.
4. **PAT runbook.** A short `docs/runbook.md`: what breaks when the token
   expires (all writes), how to mint a replacement (scopes, repo), where
   to set it (`vercel env`), and a dated reminder ~1 month before expiry.

**Acceptance**: a PR preview deploy cannot write to prod (verified by
attempting one); deleting an env var produces a named boot error, not a
500; a snapshot commit appears in the journal repo on schedule; restore
script rebuilds a local DB from a snapshot.

### Phase 1 — Auth, roles, and an audit trail with names

1. **Auth.js v5** (email magic-link, optionally Google). Single company,
   allowlist model: an `AllowedUser` table (email, role) seeded with the
   owner; unknown emails get a "request access" dead end. (Neon Auth env
   vars were auto-provisioned by the integration and may be evaluated as
   an alternative, but Auth.js keeps the auth story portable if hosting
   ever changes.)
2. **Enforcement in two layers**: middleware gating everything in
   `(app)` (redirect to sign-in), **plus** a session assertion at the top
   of every server action — actions are public POST endpoints regardless
   of what pages link to them, so page-level gating alone is not
   security.
3. **Roles**: `admin` (settings, employees, deletes, user management),
   `bookkeeper` (record/edit), `viewer` (read-only — this is the role you
   hand the bank or the outside accountant, and it's a feature, not just
   a restriction).
4. **Identity in the audit trail**: the git commit author for each
   journal write becomes the acting user's name/email (the plumbing
   already exists — `authorIdentity()` reads env vars; make it
   per-request). The Activity page then answers *who* changed what for
   free, which is the whole point of the audit-trail differentiator.
5. **Go-public flips**: Deployment Protection off; robots → landing
   indexable, app routes noindex; landing nav gains "Sign in".

**Acceptance**: signed-out users see only the landing + sign-in; a
`viewer` can read every report but no action succeeds for them (verified
by direct action invocation, not just missing buttons); Activity shows
the acting user on new commits; e2e smoke (Phase 3 harness, pulled
forward if convenient) covers the auth gate.

### Phase 2 — Ledger durability and truth

1. **`ledger doctor`** (script + admin page): reconcile `JournalTxn` ↔
   journal `txnid` tags in both directions; report orphans; offer repair.
   Repair direction is one-way by principle: **the journal is the source
   of truth for money** — the DB index is rebuildable from it, never the
   reverse.
2. **Wire up `check()`**: run asynchronously after each successful write
   and on a daily schedule; persist last-verified state; surface a small
   "Books verified ✓" / "Needs attention" indicator on the dashboard.
   A failing check alerts (Phase 3 observability) rather than blocking
   reads.
3. **hledger result cache**: memoize `balance`/`register`/`print` results
   keyed on (journal HEAD sha, argv) per warm container; invalidate on
   write by keying on the post-commit sha. Replace the 8s read-path
   GitHub fetch with a cheap ref comparison or a 60s TTL — with the cache
   in place, freshness checks get dramatically cheaper anyway.
4. **Complete the lifecycle**: edit/delete (or explicit void) for bill
   payments, overhead expenses, and opening balances; **retainage
   release** as a first-class flow (record collection of retainage
   receivable / payment of retainage payable, closing out the aging
   line). Retainage aging without resolution is a dashboard that can only
   deliver bad news.
5. **Actionable history**: "Revert this change" on Activity entries —
   applies the inverse as a *new* commit through the existing
   `writeEntry`/`replaceEntry` machinery. History is never rewritten;
   reverts are themselves audited.

**Acceptance**: doctor detects a deliberately-planted orphan in both
directions and repairs the DB side; dashboard shows verification state;
repeat dashboard loads spawn zero hledger processes (cache hit) until a
write occurs; a retainage line can be aged, released, and disappears from
aging; a reverted expense nets to zero across reports with both commits
visible in Activity.

### Phase 3 — UX, platform, and regression safety

1. **Responsive app shell**: sidebar collapses to a drawer/bottom nav
   below `lg`; tables get horizontal-scroll containers; forms already
   stack. Target: every read flow usable on a 390px phone; write flows
   usable if unglamorous.
2. **Date convention**: date-only values are `YYYY-MM-DD` strings
   end-to-end; all boundary math goes through UTC-anchored helpers in one
   module; documented in the module header. Kill local-midnight `Date`
   construction.
3. **Observability**: Sentry (or equivalent) on server actions and the
   error boundary; alerts on push-retry exhaustion, `check()` failure,
   git auth failure (the PAT-expiry early-warning in practice), and any
   5xx burst. One Slack/email channel, not a dashboard nobody opens.
4. **Playwright smoke suite in CI**: sign in → record expense → edit →
   delete → verify Activity; create billing → record payment; viewer-role
   denial. ~6 specs, run against a local prod build with seeded data.
5. **Low-ticket sweep**: `maxDuration` set explicitly; form a11y
   (`aria-invalid`, error association, focus-to-error); dedupe
   `JobStatusMenu` styling into Pill tones; parallelize
   `getOverBudgetAlerts`; marketing OG card.

**Acceptance**: Lighthouse a11y ≥ 95 on forms; smoke suite green in CI on
every push; a forced server-action error appears in the tracker with the
acting user attached; dashboard renders correctly at 390px.

### Explicitly out of scope for V4 (V5 candidates)

- Multi-company / multi-tenant (single-company multi-user is V4's shape).
- AIA G702/G703 pay-application PDF generation — the biggest product ask
  in this industry, and worth its own spec once auth + lifecycle are
  done.
- QuickBooks/accountant export integrations beyond existing CSV.
- Pricing/billing/subscription mechanics (pricing analysis exists
  separately; nothing in-app until there's a second customer).

---

## Verification (house style, unchanged)

Every phase: `npx tsc --noEmit`, `npx eslint .`, `npm test`,
`npm run build` green; browser walkthrough of touched flows; production
smoke test after deploy-affecting phases (Phase 0's preview-isolation
check happens on a real PR preview; Phase 1's auth gate is verified with
a logged-out browser profile and direct `curl` against a server action).
