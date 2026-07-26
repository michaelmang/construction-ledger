# Operational Runbook

Practical, dated procedures for the parts of this system that fail silently
if nobody's watching. See `V4-AUDIT-AND-SPEC.md` for the audit these exist
to close.

## GitHub PAT rotation (journal write access)

**What it is**: `JOURNAL_GIT_TOKEN`, a fine-grained GitHub PAT scoped to
the private `construction-ledger-journal` repo, `Contents: Read and
write` only. Every journal write (expense, payment, billing, edit,
delete) authenticates with it.

**What breaks when it expires**: every write starts failing. Reads
degrade too — `ensureJournalReady()`'s periodic fetch silently stops
refreshing (best-effort by design), so dashboards slowly go stale across
containers without any user-visible warning until someone tries to save
something and gets an error.

**Expiration**: fine-grained PATs are created with an explicit expiry
(this one: ~1 year from creation — check the exact date at
`https://github.com/settings/tokens?type=beta`). **Set a calendar
reminder 30 days before expiry** — there is no automated warning today
(Phase 3 adds one; until then this is the only alarm).

**Rotation procedure**:

1. Go to `https://github.com/settings/personal-access-tokens/new`.
2. Name it something dated and identifiable, e.g.
   `construction-ledger-journal-write-2027`.
3. Expiration: pick a date, not "No expiration."
4. Repository access → "Only select repositories" →
   `michaelmang/construction-ledger-journal`.
5. Permissions → Repository permissions → **Contents: Read and write**.
   Leave everything else at "No access."
6. Generate, copy the token.
7. In the Vercel dashboard →
   `construction-ledger` → Settings → Environment Variables → edit
   `JOURNAL_GIT_TOKEN` (Production). **Delete and re-add the variable
   rather than editing in place** — this project has hit at least one
   case where an in-place edit of an existing "Encrypted" variable saved
   as an empty string instead of the new value.
8. Redeploy (`vercel --prod` or push a commit) so the new value is picked
   up — env var changes don't apply to already-running containers.
9. Verify: record a throwaway test entry through the live app, confirm it
   appears as a real commit at
   `https://github.com/michaelmang/construction-ledger-journal/commits/main`,
   then delete the test entry the same way.
10. Revoke the old token at
    `https://github.com/settings/tokens?type=beta` once the new one is
    confirmed working.

## Verifying required environment variables

`lib/env-guard.ts`'s `assertEnv()` runs at boot (`instrumentation.ts`) and
throws if `DATABASE_URL`, `JOURNAL_DIR` (any Vercel environment), or
`JOURNAL_GIT_REMOTE`/`JOURNAL_GIT_TOKEN` (production only) are missing or
empty. If a deploy is failing immediately with one of these named errors,
the fix is always: re-check the variable in the Vercel dashboard (prefer
delete-and-re-add over in-place edit — see step 7 above) and redeploy.

## Disaster recovery: restoring Postgres metadata from a snapshot

**What's backed up**: a nightly cron
(`/api/cron/snapshot-metadata`, see `vercel.json`'s `crons` entry) dumps
every Postgres table to JSON and commits it into the journal repo under
`snapshots/` — `snapshots/latest.json` plus one dated file per day. This
is the *only* backup of job metadata, budgets, bill/billing status, and
employee rates; the hledger journal itself has no way to reconstruct any
of that.

**Restore procedure** (only ever needed if the Neon database is lost or
corrupted):

1. Clone the journal repo, or `git pull` if you already have a local
   clone, to get the latest `snapshots/latest.json`.
2. Provision/point `DATABASE_URL` at a fresh, empty Postgres database and
   run `npx prisma db push` (or `migrate deploy` against the existing
   migration) to create the schema.
3. Run:
   ```
   npx tsx scripts/restore-metadata-snapshot.ts path/to/snapshots/latest.json
   ```
   The script refuses to run against a database that already has job
   rows unless you pass `--force` — this is a from-empty restore tool,
   not a merge tool.
4. Verify: open the app, confirm jobs/vendors/bills look right, and check
   a report page that joins across tables (e.g. AP aging) to confirm
   foreign keys came through intact.

The journal (git history of the actual money-movement entries) is
unaffected by any of this — it's already durable in its own right.

## Monitoring the cron snapshot

`CRON_SECRET` must be set in Vercel (Production) for
`/api/cron/snapshot-metadata` to accept Vercel's cron-triggered requests
— without it the route always returns 500 (fails closed, not open). If a
week goes by with no new `snapshots/YYYY-MM-DD.json` commits in the
journal repo, check the Vercel project's Cron Jobs tab for recent
invocation failures.

## Auth (V4 spec Phase 1): setup and the first admin

**Required env vars in Vercel (Production)**:

- `AUTH_SECRET` — generate with `openssl rand -base64 32`. Never reuse the
  value from local `.env`; generate a separate one for production.
- `RESEND_API_KEY` — a [Resend](https://resend.com) API key. Magic-link
  emails go out through Resend's API, not SMTP.
- `AUTH_EMAIL_FROM` — the sender address, e.g. `login@yourdomain.com`.
  Must be on a domain verified with Resend. Optional: defaults to Resend's
  shared `onboarding@resend.dev` sender, which works with no domain setup
  but Resend restricts its deliverability to the account owner's own
  verified address — fine for the very first test, not for real testers.

Without `RESEND_API_KEY`/`AUTH_EMAIL_FROM` set correctly, sign-in for an
already-allowlisted email fails with `?error=Configuration` on `/sign-in`
— the allowlist check itself still runs first and correctly rejects
non-invited emails either way, since that check happens before Resend is
ever called (see `auth.ts`).

**Bootstrapping the first admin** (chicken-and-egg: the `/users` page that
invites people requires being signed in as an admin, and on a fresh
deploy nobody is one yet):

```
npx tsx scripts/bootstrap-admin.ts you@company.com
```

Run this once, locally, with `DATABASE_URL` pointed at the target
database (production: `vercel env pull` a temp env file first, same
pattern as any other prod-database script in this project). After that,
sign in as that email and invite everyone else from `/users`.

**Revoking access**: the `/users` page's "Revoke" removes the person from
the allowlist *and* immediately invalidates any session they currently
have (deleting their `User` row cascades to `Account`/`Session`) — not
just blocking their next sign-in attempt. Can't be used on your own
account or the last remaining admin (both are blocked in
`app/actions/users.ts` on purpose).
