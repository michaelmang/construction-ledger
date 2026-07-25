import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, chmod, access } from "node:fs/promises";
import path from "node:path";
import Decimal from "decimal.js";
import { money } from "./money";
import { ensureJournalReady, currentJournalSha } from "./journal-git";

const execFileAsync = promisify(execFile);

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

function mainJournalPath(): string {
  return `${journalDir()}/main.journal`;
}

// On Vercel, scripts/fetch-hledger.ts vendors a static hledger binary into
// bin/hledger/ at build time, and next.config.ts's outputFileTracingIncludes
// ships it with the deployed function — but the deployed function's own
// filesystem is read-only, and traced files are known to sometimes lose
// their exec bit in transit. Copying to /tmp (writable) and chmod'ing there
// once per container sidesteps both problems instead of hoping the bundled
// copy is directly executable in place. Cached at module scope so this only
// runs once per warm container, not once per request.
let hledgerBinaryPathPromise: Promise<string> | null = null;

async function hledgerBinaryPath(): Promise<string> {
  if (!process.env.VERCEL) return "hledger"; // local dev — PATH lookup, Homebrew install

  if (!hledgerBinaryPathPromise) {
    hledgerBinaryPathPromise = (async () => {
      const bundled = path.join(process.cwd(), "bin", "hledger", "hledger");
      const runnable = path.join("/tmp", "hledger");
      try {
        await access(runnable);
      } catch {
        await copyFile(bundled, runnable);
        await chmod(runnable, 0o755);
      }
      return runnable;
    })();
  }
  return hledgerBinaryPathPromise;
}

export class HledgerError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "HledgerError";
  }
}

// Every dashboard render fans out into ~15-20 hledger process spawns, each
// re-parsing the whole journal from scratch (V4-AUDIT-AND-SPEC.md H4).
// Cache keyed on (journal commit sha, argv): the sha changes on every
// single write (see journal-git.ts's currentJournalSha), so it's a cache
// key that's always correct with no separate invalidation path to keep in
// sync, and a whole-cache-clear on sha change bounds memory to "results
// for the currently-checked-out commit" instead of growing forever.
let cachedSha: string | null = null;
let queryCache = new Map<string, unknown>();

// Every call site shares this: same binary, same file, same JSON output flag,
// same error handling. Args are passed as an array (never shell-interpolated)
// so job codes and tags can never be used for command injection.
async function runHledgerJson(args: string[]): Promise<unknown> {
  await ensureJournalReady();
  const sha = await currentJournalSha();
  if (sha !== cachedSha) {
    cachedSha = sha;
    queryCache = new Map();
  }

  const cacheKey = JSON.stringify(args);
  if (sha !== null) {
    const cached = queryCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  try {
    const { stdout } = await execFileAsync(
      await hledgerBinaryPath(),
      ["-f", mainJournalPath(), ...args, "--output-format=json"],
      { maxBuffer: 1024 * 1024 * 32 },
    );
    const result = JSON.parse(stdout);
    if (sha !== null) queryCache.set(cacheKey, result);
    return result;
  } catch (err) {
    const e = err as { stderr?: string; message: string; code?: string };
    if (e.code === "ENOENT") {
      throw new HledgerError(
        "hledger CLI not found on PATH. Install it (e.g. `brew install hledger`).",
        "",
      );
    }
    throw new HledgerError(
      `hledger command failed: ${e.message}`,
      e.stderr ?? "",
    );
  }
}

// hledger's JSON encodes amounts as an exact mantissa/scale pair, not a
// float — use that instead of `floatingPoint` to avoid precision loss.
interface HledgerAmount {
  acommodity: string;
  aquantity: { decimalMantissa: number; decimalPlaces: number };
}

function amountToDecimal(amounts: HledgerAmount[]): Decimal {
  return amounts.reduce((sum, a) => {
    const value = new Decimal(a.aquantity.decimalMantissa).dividedBy(
      new Decimal(10).pow(a.aquantity.decimalPlaces),
    );
    return sum.plus(value);
  }, money(0));
}

// Note for every caller building a query array: hledger reserves the bare
// `type:` prefix for account-type filters (A/L/E/R/X/C/V/G/U). Our journal
// entries also carry a custom `type` tag (e.g. `type:progress-billing`, per
// product spec §3.2) — to filter on it, use `tag:type=progress-billing`,
// never `type:progress-billing` (that gets parsed as an account-type query
// and fails).

export interface BalanceLine {
  account: string;
  amount: Decimal;
}

export interface BalanceResult {
  lines: BalanceLine[];
  total: Decimal;
}

// Runs `hledger balance` scoped by an optional query (e.g. `tag:job=J2026-014`,
// account name patterns). `total` is hledger's own grand total for the query
// (not a client-side sum of `lines`, which would double-count if a query ever
// matched both a parent and its children).
export async function balance(query: string[] = []): Promise<BalanceResult> {
  const raw = (await runHledgerJson(["balance", ...query])) as [
    [string, string, number, HledgerAmount[]][],
    HledgerAmount[],
  ];
  const [lines, total] = raw;
  return {
    lines: lines.map(([account, , , amounts]) => ({
      account,
      amount: amountToDecimal(amounts),
    })),
    total: amountToDecimal(total),
  };
}

export interface RegisterEntry {
  date: string;
  description: string;
  account: string;
  amount: Decimal;
  runningTotal: Decimal;
}

export async function register(query: string[] = []): Promise<RegisterEntry[]> {
  const raw = (await runHledgerJson(["register", ...query])) as [
    string | null,
    string | null,
    string | null,
    { paccount: string; pamount: HledgerAmount[] },
    HledgerAmount[],
  ][];

  let lastDate = "";
  let lastDescription = "";
  return raw.map(([date, , description, posting, runningTotal]) => {
    if (date) lastDate = date;
    if (description) lastDescription = description;
    return {
      date: lastDate,
      description: lastDescription,
      account: posting.paccount,
      amount: amountToDecimal(posting.pamount),
      runningTotal: amountToDecimal(runningTotal),
    };
  });
}

export interface JournalTransaction {
  date: string;
  description: string;
  tags: Record<string, string>;
  postings: { account: string; amount: Decimal }[];
}

export async function print(query: string[] = []): Promise<JournalTransaction[]> {
  const raw = (await runHledgerJson(["print", ...query])) as {
    tdate: string;
    tdescription: string;
    ttags: [string, string][];
    tpostings: { paccount: string; pamount: HledgerAmount[] }[];
  }[];

  return raw.map((t) => ({
    date: t.tdate,
    description: t.tdescription,
    tags: Object.fromEntries(t.ttags),
    postings: t.tpostings.map((p) => ({
      account: p.paccount,
      amount: amountToDecimal(p.pamount),
    })),
  }));
}

// `hledger check` validates balance assertions, unbalanced transactions, etc.
// Returns null when clean, or the error text when it is not.
export async function check(): Promise<string | null> {
  try {
    await ensureJournalReady();
    await execFileAsync(await hledgerBinaryPath(), ["-f", mainJournalPath(), "check"]);
    return null;
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return e.stderr || e.message;
  }
}
