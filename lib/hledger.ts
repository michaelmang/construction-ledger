import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Decimal from "decimal.js";
import { money } from "./money";

const execFileAsync = promisify(execFile);

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

function mainJournalPath(): string {
  return `${journalDir()}/main.journal`;
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

// Every call site shares this: same binary, same file, same JSON output flag,
// same error handling. Args are passed as an array (never shell-interpolated)
// so job codes and tags can never be used for command injection.
async function runHledgerJson(args: string[]): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(
      "hledger",
      ["-f", mainJournalPath(), ...args, "--output-format=json"],
      { maxBuffer: 1024 * 1024 * 32 },
    );
    return JSON.parse(stdout);
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

export interface BalanceLine {
  account: string;
  amount: Decimal;
}

// Runs `hledger balance` scoped by an optional query (e.g. `tag:job=J2026-014`,
// account name patterns). Returns per-account balances only, not the grand total.
export async function balance(query: string[] = []): Promise<BalanceLine[]> {
  const raw = (await runHledgerJson(["balance", ...query])) as [
    [string, string, number, HledgerAmount[]][],
    HledgerAmount[],
  ];
  const [lines] = raw;
  return lines.map(([account, , , amounts]) => ({
    account,
    amount: amountToDecimal(amounts),
  }));
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
    await execFileAsync("hledger", ["-f", mainJournalPath(), "check"]);
    return null;
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return e.stderr || e.message;
  }
}
