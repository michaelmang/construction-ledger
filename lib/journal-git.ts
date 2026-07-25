import fs from "node:fs";
import path from "node:path";
import http from "isomorphic-git/http/node";
import * as git from "isomorphic-git";

// v3 spec (Vercel migration): Vercel functions have no persistent disk, so
// unlike a local checkout, JOURNAL_DIR (under /tmp in production) starts
// empty on every cold container. The journal's git history lives in a
// remote (a private GitHub repo) and gets cloned/synced per container via
// isomorphic-git — a pure-JS git implementation, since the `git` binary
// isn't guaranteed present in Vercel's runtime and HTTPS+PAT auth needs a
// programmatic credential callback anyway, which shelling out to system git
// doesn't offer cleanly.
//
// One code path everywhere (prod, dev, tests, seed scripts): when
// JOURNAL_GIT_REMOTE is unset, every function below behaves exactly like
// the old shelled-out-to-git version did — commit locally, no fetch/push.
// That's the local dev and test path. Splitting prod onto isomorphic-git
// while tests stayed on real git would leave this app's single most
// safety-critical feature (the audit trail) without shared test coverage.

const DEFAULT_BRANCH = "main";
const FRESHNESS_TTL_MS = 8_000;

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

function remoteUrl(): string | undefined {
  return process.env.JOURNAL_GIT_REMOTE || undefined;
}

export function hasRemote(): boolean {
  return Boolean(remoteUrl());
}

// isomorphic-git doesn't read gitconfig at all — every commit needs
// explicit author identity. Defaults match the identity the old seed
// script set via `git config user.email`/`user.name`.
function authorIdentity(): { name: string; email: string } {
  return {
    name: process.env.JOURNAL_GIT_USER_NAME || "Construction Ledger",
    email: process.env.JOURNAL_GIT_USER_EMAIL || "ledger@construction-ledger.local",
  };
}

// GitHub accepts the PAT as the HTTPS username with an empty password —
// no need to also send it as a password field.
function gitAuth(): (() => { username: string }) | undefined {
  const token = process.env.JOURNAL_GIT_TOKEN;
  if (!token) return undefined;
  return () => ({ username: token });
}

async function hasGitDir(dir: string): Promise<boolean> {
  try {
    await fs.promises.access(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

// Cached per warm container so a clone/fastForward only happens once per
// cold start, not once per request.
let cloneReadyPromise: Promise<void> | null = null;
let lastSyncAt = 0;

async function cloneIfNeeded(dir: string, url: string): Promise<void> {
  if (!cloneReadyPromise) {
    cloneReadyPromise = (async () => {
      if (await hasGitDir(dir)) {
        lastSyncAt = Date.now();
        return;
      }
      await fs.promises.mkdir(dir, { recursive: true });
      await git.clone({
        fs,
        http,
        dir,
        url,
        ref: DEFAULT_BRANCH,
        singleBranch: true,
        onAuth: gitAuth(),
      });
      lastSyncAt = Date.now();
    })();
  }
  return cloneReadyPromise;
}

// Called before any read or write touches JOURNAL_DIR. When no remote is
// configured (local dev, tests) this is a no-op — lib/journal.ts's own
// ensureJournalFiles() already handles directory creation, as it always
// has. When a remote is configured: clone on a cold container (must run
// strictly before ensureJournalFiles() would otherwise create an empty
// main.journal there — git.clone requires an empty/absent target
// directory), then keep the working tree reasonably fresh so containers
// don't serve arbitrarily stale books to different testers.
//
// Freshness is best-effort BY DESIGN: a failed or skipped refresh (network
// blip, or this container mid-write with uncommitted local changes)
// degrades to serving whatever's on disk right now — a read must never
// block or throw because of a freshness check. The next successful write's
// resync (see resyncJournalFromRemote) is what actually reconciles
// divergence; this is just "try to stay reasonably current" for reads.
export async function ensureJournalReady(): Promise<void> {
  const url = remoteUrl();
  if (!url) return;

  const dir = journalDir();
  await cloneIfNeeded(dir, url);

  if (Date.now() - lastSyncAt < FRESHNESS_TTL_MS) return;
  lastSyncAt = Date.now(); // set before attempting — a slow/failing fetch shouldn't retry-storm every call in between
  try {
    await git.fastForward({ fs, http, dir, ref: DEFAULT_BRANCH, onAuth: gitAuth() });
  } catch {
    // best-effort — see doc comment above
  }
}

// git add -A has no direct isomorphic-git equivalent; statusMatrix + add/
// remove reimplements it. Comparing workdir directly to stage (ignoring
// HEAD) is the standard pattern for "stage everything that's changed since
// the last commit."
async function stageAllChanges(dir: string): Promise<boolean> {
  const matrix = await git.statusMatrix({ fs, dir });
  let changed = false;
  for (const [filepath, , workdirStatus, stageStatus] of matrix) {
    if (workdirStatus === stageStatus) continue;
    changed = true;
    if (workdirStatus === 0) {
      await git.remove({ fs, dir, filepath });
    } else {
      await git.add({ fs, dir, filepath });
    }
  }
  return changed;
}

// Thrown when a push is rejected (another container pushed first — this
// container's local history has diverged from the remote). Distinguished
// from other errors so lib/transactions.ts can catch specifically this and
// retry the whole triggering write, rather than surfacing a raw failure.
export class JournalPushRejectedError extends Error {}

// Commits all pending changes in the journal data repo, then pushes if a
// remote is configured. Called after every successful journal write so the
// git history is a real audit trail (product spec §4.5/§7), not
// aspirational.
export async function commitJournalChanges(message: string): Promise<void> {
  const dir = journalDir();
  const changed = await stageAllChanges(dir);
  if (!changed) return; // nothing to commit (e.g. a no-op edit)

  await git.commit({ fs, dir, message, author: authorIdentity() });

  const url = remoteUrl();
  if (!url) return; // local dev / tests — no remote, a local commit is enough

  // isomorphic-git cannot merge or resolve conflicts, and push() never
  // throws for a rejected push — it resolves with a result object, so a
  // rejection has to be checked explicitly, not caught.
  const result = await git.push({ fs, http, dir, remote: "origin", ref: DEFAULT_BRANCH, onAuth: gitAuth() });
  if (!result.ok) {
    throw new JournalPushRejectedError(result.error ?? "push rejected (remote has diverged)");
  }
  lastSyncAt = Date.now(); // our own push already brought us up to date
}

// Recovery path for a rejected push: discard the local /tmp clone entirely
// and re-clone fresh, rather than trying to reconcile in place (isomorphic-
// git has no merge/rebase conflict resolution to fall back on). Simple,
// correct, and cheap enough at this app's journal size and traffic level.
// The caller (lib/transactions.ts) is responsible for re-running the write
// that triggered this against the freshly synced content.
export async function resyncJournalFromRemote(): Promise<void> {
  const url = remoteUrl();
  if (!url) return;
  const dir = journalDir();
  await fs.promises.rm(dir, { recursive: true, force: true });
  cloneReadyPromise = null;
  await ensureJournalReady();
}

// Used only by scripts/seed-demo.ts, after a full local reset + reseed:
// force-pushes the freshly built local history to the remote, overwriting
// whatever was there. A demo-data reset is meant to produce one clean,
// reproducible history, not merge with old state — this is the one
// deliberate exception to "never force, always reconcile" elsewhere in this
// module. No-ops when no remote is configured (a local-only reset).
export async function forcePushSeededJournal(): Promise<void> {
  const url = remoteUrl();
  if (!url) return;
  const dir = journalDir();
  await git.addRemote({ fs, dir, remote: "origin", url, force: true });
  const result = await git.push({
    fs,
    http,
    dir,
    remote: "origin",
    ref: DEFAULT_BRANCH,
    force: true,
    onAuth: gitAuth(),
  });
  if (!result.ok) {
    throw new Error(`Failed to push seeded journal history: ${result.error ?? "unknown error"}`);
  }
  lastSyncAt = Date.now();
}
