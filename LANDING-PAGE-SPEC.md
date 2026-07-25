# Landing Page — Spec & Build Instructions

A public marketing landing page for Construction Ledger, modeled on the
castmark.pro landing page's structure and visual rhythm, translated to this
app's audience (construction company owners/CFOs) and existing design
tokens. For now every CTA simply clicks through into the app — no signup,
no auth, no email capture.

Reference: `~/Downloads/screencapture-castmark-pro-2026-07-24-17_28_53.png`
(sticky nav → hero with accent word → framed product mock → problem cards →
3-step how-it-works → alternating feature sections → value banner → pricing
→ FAQ → final CTA → footer).

---

## 1. Routing & file structure (the only structural change)

The dashboard currently owns `/`, and the root layout unconditionally
renders the sidebar and forces `dynamic = "force-dynamic"`. The landing
page must live at `/`, have no sidebar, and be fully static. Use route
groups:

```
app/
  layout.tsx              ← slimmed root: html/body/fonts/global metadata ONLY
  (marketing)/
    layout.tsx            ← full-bleed wrapper, no sidebar, no force-dynamic
    page.tsx              ← the landing page (this spec)
  (app)/
    layout.tsx            ← receives Sidebar + <main> container + `dynamic = "force-dynamic"`
                            (moved out of the root layout)
    dashboard/page.tsx    ← moved from app/page.tsx (with its loading.tsx)
    jobs/ vendors/ reports/ cost-codes/ overhead/ employees/ activity/
    accounts/             ← all existing app routes move into (app)/ unchanged
```

Required link updates (grep-verified list, current as of this spec):

| File | Change |
|---|---|
| `components/Sidebar.tsx` | `{ href: "/", label: "Dashboard" }` → `/dashboard`; wordmark link → `/dashboard` (stays inside the app) |
| `app/page.tsx` (→ `(app)/dashboard/page.tsx`) | `DateRangeControl basePath="/"` → `basePath="/dashboard"` |
| `app/error.tsx` | "Back to Dashboard" `href="/"` → `/dashboard` |
| `app/not-found.tsx` | `href="/"` → `/dashboard` |

Notes:
- `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, `robots.ts`,
  `error.tsx`, `not-found.tsx` stay at the app root — they apply site-wide.
- Keep `robots` noindex for now (app is testers-only behind a shared link);
  flip to indexable later in one place (`app/layout.tsx` metadata) when the
  product is public.
- The landing page makes **zero** Prisma/hledger calls, so once
  `force-dynamic` moves into `(app)/layout.tsx` it becomes statically
  prerendered — instant paint, no cold-start penalty on the front door.
- `app/loading.tsx` (root skeleton) moves to `(app)/loading.tsx`; the
  landing needs no loading state (static).
- Existing tests import from `lib/` and `app/actions/` only — the route
  moves don't touch them. `npm test` must stay green with no edits.

---

## 2. Visual language

Everything reuses `app/globals.css` tokens — the landing must feel like the
app it opens into, exactly like the reference (Castmark's landing is
visually continuous with its product mock).

- Background `--color-bg` (#0b0b09); cards `--color-surface` on
  `--color-border`; inner elements `--color-surface-2`.
- Accent `--color-accent` (#e8b64c) is used exactly like the reference:
  eyebrow labels, one highlighted word per big headline, primary CTA fill,
  numbered step circles, checkmarks.
- Type: Geist Sans for prose/headlines, Geist Mono for money, code-like
  strings, and commit messages (`tabular-nums` on all figures).
- Eyebrow pattern (used before every section headline): 11px, uppercase,
  `tracking-widest`, accent color — identical to the app's existing card
  labels.
- Buttons reuse `primaryButtonClass` / `secondaryButtonClass` from
  `components/form.tsx`.
- Max content width `max-w-5xl` centered; sections separated by generous
  vertical space (`py-24` desktop / `py-16` mobile). Full-bleed dark bands
  (hero, value banner, final CTA) alternate with plain-bg sections, as in
  the reference.
- Motion: none required. If any is added (fade-up on scroll), gate it
  behind `prefers-reduced-motion` and keep it CSS-only. No animation
  library.

---

## 3. Page sections, top to bottom

### 3.1 Sticky top nav

Mirrors reference: slim bar, `bg-bg/80` with backdrop blur, bottom border.

- Left: "Construction Ledger" wordmark (text, same treatment as sidebar).
- Center-right: anchor links — How it works · Features · FAQ
  (plain `<a href="#...">` to section ids; omit Pricing until §3.8 ships).
- Right: primary CTA **"Open the app"** → `/dashboard`.
  (Reference has "Sign in" + "Start free trial"; we have no auth, so one
  button only. When auth lands, "Sign in" slots in beside it.)
- Mobile: wordmark + CTA only; hide anchor links (no hamburger — nothing
  behind it worth the JS).

### 3.2 Hero

- Eyebrow: none (reference goes straight to headline).
- Headline, two lines, ~56px desktop / 36px mobile, tight leading:
  - Line 1: `Every job costed.`
  - Line 2: `Every entry auditable, ` + accent span `forever.`
- Subcopy (max-w-xl, `text-text-2`):
  > Construction Ledger is job-centric accounting for builders: WIP
  > schedules, retainage, labor burden, and cash — computed from a
  > double-entry ledger where every write is a git commit.
- CTA row: primary **"Open the dashboard →"** (`/dashboard`) + secondary
  **"See how it works"** (`#how-it-works`).
- Microcopy under CTAs (`text-xs text-text-3`):
  `Loaded with demo data · no signup required`

### 3.3 Hero product mock

The reference's centerpiece: a browser-chrome-framed product shot. Build it
as a **stylized JSX recreation**, not a screenshot — crisper on retina,
stays in sync with the design tokens, no binary asset churn.

- Outer frame: rounded-xl surface card, subtle shadow, top bar with three
  window dots + a centered URL pill reading `construction-ledger` in mono.
- Inside, three stacked zones copying the real dashboard's anatomy:
  1. **Stat row** (3 tiles, StatCard styling):
     `Cash Position $92,514` (positive tone) · `AR Outstanding $15,500` ·
     `Active Jobs 3`
  2. **Chart strip**: label `Cash, last 8 weeks` + a static gold SVG area
     chart (hardcoded path; do NOT import the interactive `AreaChart` —
     no client JS in the hero).
  3. **Three table rows** (job rows with status pills, mirroring the
     reference's link rows):
     - `Smith Residence Addition` · mono `J2026-014` · Pill "Active" · `$180,000.00`
     - `Miller Kitchen Remodel` · mono `J2026-021` · Pill "Active" · `$95,000.00`
     - `Turner Garage Build` · mono `J2025-098` · neutral Pill "Complete" · `$45,000.00`
- Slight scale/perspective is unnecessary; flat and centered like the
  reference. Width ~`max-w-3xl`.

### 3.4 Problem section — "THE OLD WAY"

- Eyebrow: `THE OLD WAY` · Headline: `Spreadsheet job costing rots.`
- Three equal cards (surface, border, icon-free — bold 15px title + 13px
  `text-text-2` body), matching the reference's three problem cards:
  1. **WIP built by hand** — Every month someone rebuilds the
     earned-revenue schedule in Excel. One stale formula and you're
     overbilled on paper, underpaid in cash.
  2. **Retainage falls through the cracks** — Money clients owe you ages
     silently. Nobody notices the 60-day-old 5% until the job closes.
  3. **No idea which jobs made money** — Labor burden and overhead never
     land on jobs, so margins are a feeling, not a number.

### 3.5 How it works — 3 numbered steps  (`id="how-it-works"`)

- Eyebrow: `HOW IT WORKS` · Headline: `Set it up once. Read the truth daily.`
- Three columns (stack on mobile), each: accent-outlined number circle,
  title, 2-sentence body, and a small mono mock beneath (reference does
  exactly this):
  1. **Create jobs and budgets** — Contract value, retainage %, cost codes
     with budgeted amounts. Mock: mono block `J2026-014 · $180,000.00 ·
     retainage 10%`.
  2. **Record work as it happens** — Expenses, labor with real burden,
     progress billings. Every entry is double-entry and validated before
     it lands. Mock: mono block styled like a commit message:
     `expense: J2026-014 03-CONCRETE $4,200.00`.
  3. **Edits never overwrite history** — Change an entry and the ledger
     records a new commit; the old state stays in the audit trail. Mock
     (mirrors the reference's before/after URL-swap block): strikethrough
     mono `$999.00` → accent mono `$1,050.00`, captioned
     `edit expense: … · nothing is ever erased`.

### 3.6 Feature sections — three alternating two-column blocks

Each: text column (eyebrow, headline, body, 3–4 accent-check bullet list)
opposite a mock column (surface card). Alternate text/mock sides.

**A — eyebrow `JOB COSTING`, headline `WIP without the spreadsheet.`**
> Percent complete from actual costs against estimates. Earned revenue and
> over/under billing computed per job, live — the schedule your bank asks
> for, without the monthly Excel ritual.
- Bullets: % complete from cost-to-complete estimates · Earned revenue vs
  billed to date · Overbilled / underbilled flags per job · Company-wide
  WIP rollup.
- Mock: 2 job rows with progress bars + an "Underbilled" warn Pill and an
  "Overbilled" negative Pill (copy the dashboard's Active Jobs table
  styling).

**B — eyebrow `AUDIT TRAIL`, headline `Books you can prove.`**
(The differentiator — give it the strongest mock, like the reference's
analytics block.)
> Every accounting entry is a commit in the ledger's own git history.
> Nothing can be silently altered — every record, edit, and delete leaves
> a permanent, timestamped trace.
- Bullets: One commit per entry, edit, and delete · Full history browsable
  in-app · Plain-text ledger you can read without us · Verified
  double-entry on every write.
- Mock: 4 activity-feed rows (kind Pill + description + mono amount +
  date), copied from the real `/activity` styling, e.g. `Expense ·
  Recorded expense on Smith Residence Addition (J2026-014) · $4,200.00`.

**C — eyebrow `CASH & RETAINAGE`, headline `Nothing ages silently.`**
> AR and AP aging, retainage held and receivable, and a dashboard that
> flags what needs chasing — before it becomes a write-off.
- Bullets: Retainage receivable & payable per job · AR/AP aging buckets ·
  Over-budget cost code alerts · Cash trend at a glance.
- Mock: 2 alert rows exactly like the dashboard's (negative-soft "Over
  Budget" row + warn-soft "Retainage outstanding 74 days" row).

### 3.7 Value banner (full-bleed, like the reference's dark inset band)

Inset rounded band (`bg-surface`, generous padding), centered:
- Headline: `Your books become an ` + accent `asset` + `, not a liability.`
- Two mini-columns beneath (title + 2-line body), mirroring reference:
  - **Walk into the bank ready** — WIP schedule, aging, and margins are
    always current — not reconstructed the week before a loan review.
  - **Hand auditors a git log** — Every number traces to a commit. Due
    diligence becomes a checkout, not an excavation.
- CTA: **"Open the dashboard →"**

### 3.8 Pricing — OMITTED for now

The reference has a single-plan pricing card; we have no offer yet
(pricing analysis exists but is undecided). Skip the section entirely —
do not ship a placeholder. When pricing lands, insert here as a single
plan card (accent price, feature checklist, CTA) using the same card
grammar as §3.4, and add "Pricing" to the nav anchors.

### 3.9 FAQ  (`id="faq"`)

- Eyebrow: `FAQ` · Headline: `A few honest questions first.`
- 5 items, native `<details>/<summary>` elements (zero JS, keyboard
  accessible for free), surface-card styling with a rotate-on-open chevron
  via CSS:
  1. **Where does my data live?** — In a Postgres database and a
     plain-text ledger file in a private git repository. Both are yours;
     the ledger is readable with any text editor even if you stop using
     the app.
  2. **What's hledger and why should I care?** — A 15-year-old open-source
     double-entry accounting engine. It validates every transaction
     balances before anything is saved. You never see it — you just get
     books that always add up.
  3. **Does it replace QuickBooks?** — It replaces the job-costing
     spreadsheet next to QuickBooks first. It keeps real double-entry
     books, but talk to your accountant before switching systems of
     record.
  4. **What happens when I edit or delete an entry?** — A new commit
     records the change. The prior state stays in history permanently —
     the audit trail is append-only by construction.
  5. **Can my whole team use it?** — Multi-user access and sign-in are the
     next milestone. Today it's single-company, shared-link access for a
     small trusted group.

### 3.10 Final CTA (full-bleed band)

- Headline, centered, two lines:
  `Your next job deserves books` / `that ` + accent `never lie.`
- Primary CTA **"Open the dashboard →"** + the same microcopy as the hero.

### 3.11 Footer

Three-zone layout like the reference:
- Left: wordmark + 2-line blurb ("Job-centric accounting for construction.
  Built on a ledger that never forgets.")
- Right, two link columns:
  - **Product**: How it works · Features · FAQ (anchors)
  - **App**: Dashboard (`/dashboard`) · Reports (`/reports`) · Activity
    (`/activity`)
- Bottom rule + `© 2026 Construction Ledger` in `text-text-3`.

---

## 4. Implementation notes

- **One file is fine.** The whole page can be a single server component
  (`(marketing)/page.tsx`) with small local helper components (Section,
  Eyebrow, MockFrame, CheckItem). Only promote to shared `components/` if
  something is reused by the app itself — don't pre-abstract.
- **Zero client JS is the target.** No `"use client"` anywhere on the
  page: static SVG chart, CSS-only chevrons, native details/summary,
  anchor scrolls. `scroll-behavior: smooth` on `html` in globals (respect
  `prefers-reduced-motion: reduce` → auto).
- **Reuse, don't fork**: `Pill`, `primaryButtonClass`,
  `secondaryButtonClass`, and the table row styling from
  `components/table.ts` where practical. Mock content is hardcoded JSX —
  never live data.
- **Metadata**: the landing inherits the existing root metadata (title,
  OG image, noindex). Optionally set a page-level `description` matching
  the hero subcopy. No other changes.
- **Accessibility**: one `<h1>` (hero), sections use `<h2>`; all text on
  bg/surface meets contrast (existing tokens already do); focus-visible
  rings on nav links and CTAs; `aria-hidden` on the decorative chart SVG
  and window dots.

## 5. Acceptance checklist

- [ ] `/` renders the landing page, statically (`○` in build output).
- [ ] `/dashboard` serves the existing dashboard, identical behavior,
      sidebar intact; all sidebar/tab/date-range/error/404 links point at
      `/dashboard` (no remaining `href="/"` in app chrome — grep clean).
- [ ] Landing makes no DB/hledger calls; renders with dev server stopped
      against a built output.
- [ ] Every CTA and footer/app link lands inside the app; anchor links
      scroll to their sections.
- [ ] No new dependencies; no `"use client"` on the landing; FAQ works
      keyboard-only.
- [ ] `npx tsc --noEmit`, `npx eslint .`, `npm test` (72 passing,
      untouched), `npm run build` all green.
- [ ] Mobile (390px): single column, nav shows wordmark + CTA, hero mock
      fits without horizontal scroll.
- [ ] Visual QA against the reference: section order, spacing rhythm, and
      accent usage read as the same family — hero mock is recognizably
      the real dashboard.
