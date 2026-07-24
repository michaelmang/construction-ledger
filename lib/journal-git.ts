import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function journalDir(): string {
  const dir = process.env.JOURNAL_DIR;
  if (!dir) throw new Error("JOURNAL_DIR environment variable is not set");
  return dir;
}

// Commits all pending changes in the journal data repo. Called after every
// successful journal write so the git history is a real audit trail (product
// spec §4.5 / §7), not aspirational.
export async function commitJournalChanges(message: string): Promise<void> {
  const cwd = journalDir();
  await execFileAsync("git", ["add", "-A"], { cwd });

  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  if (stdout.trim().length === 0) {
    return; // nothing to commit (e.g. a no-op edit)
  }

  await execFileAsync("git", ["commit", "-m", message], { cwd });
}
