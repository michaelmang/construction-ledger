import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Decimal from "decimal.js";
import { toJournalAmount } from "./money";
import { ensureJournalReady } from "./journal-git";

export interface Posting {
  account: string;
  amount: Decimal; // signed; must sum to zero across an entry
}

export interface EntryInput {
  date: string; // YYYY-MM-DD
  description: string;
  tags: Record<string, string>;
  postings: Posting[];
}

export class JournalValidationError extends Error {}

// Journal writes are read-modify-write against plain files (not a database
// transaction), so two concurrent requests could interleave and corrupt the
// block structure. Serialize all mutations through this in-process queue.
// Sufficient for a single-user/single-process app (product spec §7/Phase 5);
// a multi-instance deployment would need a real file lock instead.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

function mainJournalPath(): string {
  return path.join(journalDir(), "main.journal");
}

function yearJournalPath(year: number): string {
  return path.join(journalDir(), `${year}.journal`);
}

function yearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year) || date.length !== 10) {
    throw new JournalValidationError(`Invalid entry date: ${date}`);
  }
  return year;
}

function validateBalanced(postings: Posting[]): void {
  if (postings.length < 2) {
    throw new JournalValidationError("An entry needs at least two postings");
  }
  const sum = postings.reduce((s, p) => s.plus(p.amount), new Decimal(0));
  if (!sum.isZero()) {
    throw new JournalValidationError(
      `Entry postings do not balance (sum = ${sum.toFixed(2)})`,
    );
  }
}

function formatTags(tags: Record<string, string>): string {
  const parts = Object.entries(tags).map(([k, v]) => `${k}:${v}`);
  return `    ; ${parts.join(", ")}`;
}

function formatPostings(postings: Posting[]): string {
  const accountWidth = Math.max(...postings.map((p) => p.account.length)) + 4;
  return postings
    .map((p) => {
      const account = p.account.padEnd(accountWidth);
      const amount = toJournalAmount(p.amount);
      return `    ${account}${amount} USD`;
    })
    .join("\n");
}

export function formatEntry(entry: EntryInput): string {
  validateBalanced(entry.postings);
  const lines = [
    `${entry.date} ${entry.description}`,
    formatTags(entry.tags),
    formatPostings(entry.postings),
  ];
  return lines.join("\n");
}

async function ensureJournalFiles(year: number): Promise<void> {
  await mkdir(journalDir(), { recursive: true });

  const mainPath = mainJournalPath();
  let mainContent = "";
  try {
    mainContent = await readFile(mainPath, "utf8");
  } catch {
    // main.journal doesn't exist yet — will be created below
  }

  const includeLine = `include ${year}.journal`;
  if (!mainContent.includes(includeLine)) {
    const updated =
      mainContent.length > 0 && !mainContent.endsWith("\n")
        ? `${mainContent}\n${includeLine}\n`
        : `${mainContent}${includeLine}\n`;
    await writeFile(mainPath, updated, "utf8");
  }

  const yearPath = yearJournalPath(year);
  try {
    await readFile(yearPath, "utf8");
  } catch {
    await writeFile(yearPath, "", "utf8");
  }
}

// Every domain transaction maps to exactly one journal entry with a stable
// txnid tag, so edits/deletes can find and replace the right entry instead of
// appending corrections (product spec §4.6).
export function writeEntry(
  input: Omit<EntryInput, "tags"> & { tags?: Record<string, string> },
): Promise<{ txnid: string }> {
  return serialized(async () => {
    await ensureJournalReady();
    const txnid = input.tags?.txnid ?? randomUUID();
    const tags = { ...input.tags, txnid };
    const entry: EntryInput = { ...input, tags };

    const text = formatEntry(entry);
    const year = yearOf(entry.date);
    await ensureJournalFiles(year);

    const yearPath = yearJournalPath(year);
    const existing = await readFile(yearPath, "utf8");
    const separator = existing.length === 0 ? "" : existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    await writeFile(yearPath, `${existing}${separator}${text}\n\n`, "utf8");

    return { txnid };
  });
}

interface FoundEntry {
  file: string;
  blocks: string[];
  index: number;
}

async function findEntryBlock(txnid: string): Promise<FoundEntry | null> {
  const mainPath = mainJournalPath();
  let mainContent: string;
  try {
    mainContent = await readFile(mainPath, "utf8");
  } catch {
    return null;
  }

  const includedFiles = [...mainContent.matchAll(/^include (.+)$/gm)].map(
    (m) => path.join(journalDir(), m[1].trim()),
  );

  for (const file of includedFiles) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const blocks = content.split(/\n\n+/).filter((b) => b.trim().length > 0);
    const index = blocks.findIndex((b) => b.includes(`txnid:${txnid}`));
    if (index !== -1) {
      return { file, blocks, index };
    }
  }
  return null;
}

export function replaceEntry(
  txnid: string,
  input: Omit<EntryInput, "tags"> & { tags?: Record<string, string> },
): Promise<void> {
  return serialized(async () => {
    await ensureJournalReady();
    const found = await findEntryBlock(txnid);
    if (!found) {
      throw new JournalValidationError(`No journal entry found with txnid ${txnid}`);
    }
    const tags = { ...input.tags, txnid };
    const newText = formatEntry({ ...input, tags });
    found.blocks[found.index] = newText;
    await writeFile(found.file, `${found.blocks.join("\n\n")}\n`, "utf8");
  });
}

export function deleteEntry(txnid: string): Promise<void> {
  return serialized(async () => {
    await ensureJournalReady();
    const found = await findEntryBlock(txnid);
    if (!found) {
      throw new JournalValidationError(`No journal entry found with txnid ${txnid}`);
    }
    found.blocks.splice(found.index, 1);
    const content = found.blocks.length > 0 ? `${found.blocks.join("\n\n")}\n` : "";
    await writeFile(found.file, content, "utf8");
  });
}
