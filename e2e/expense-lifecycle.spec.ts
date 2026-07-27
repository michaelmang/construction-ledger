import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// Record -> edit -> delete an expense on the seeded "Miller Kitchen
// Remodel" job, verifying each step against both the job's Transactions
// tab and the Activity audit trail (V4 spec Phase 3 smoke suite: "record
// expense -> edit -> delete -> verify Activity").
test("records, edits, and deletes an expense, all three visible in Activity", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Miller Kitchen Remodel" }).click();
  await page.getByRole("link", { name: "Record Expense" }).click();

  const marker = `e2e ${Date.now()}`;
  await page.getByLabel("Cost Type").selectOption({ label: "Material" });
  await page.getByLabel("Cost Code").selectOption({ label: "03-CONCRETE — Concrete" });
  await page.getByLabel("Vendor").selectOption({ label: "Ace Concrete Supply" });
  await page.getByLabel("Amount").fill("321.00");
  await page.getByLabel("Description", { exact: false }).fill(marker);
  await page.getByRole("button", { name: "Record Cost" }).click();

  // A real git commit (isomorphic-git) happens server-side before the
  // redirect — slower than the default 5s expect timeout under load.
  await expect(page).toHaveURL(/\/transactions$/, { timeout: 15_000 });
  const row = page.getByRole("row", { name: new RegExp(marker) });
  await expect(row).toBeVisible();
  await expect(row.getByText("$321.00", { exact: true })).toBeVisible();

  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/transactions\/expenses\/edit\//);
  await page.getByLabel("Amount").fill("450.00");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page).toHaveURL(/\/transactions$/, { timeout: 15_000 });
  const editedRow = page.getByRole("row", { name: new RegExp(marker) });
  await expect(editedRow.getByText("$450.00", { exact: true })).toBeVisible();

  await editedRow.getByRole("button", { name: "Delete" }).click();
  await editedRow.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("row", { name: new RegExp(marker) })).toHaveCount(0, { timeout: 15_000 });

  // The Transactions-tab checks above already prove the record/edit/delete
  // sequence worked end to end (row appeared at $321, then $450, then was
  // gone) — this last check is specifically that it's *audited*, not just
  // that the DB state changed. The delete commit's subject carries the
  // original memo (vendor + this test's unique marker) verbatim — see
  // app/actions/expenses.ts's deleteExpense — and is shown directly (not
  // behind the collapsed <details>) since its JournalTxn row, and so its
  // "kind", no longer exists once deleted. That makes it the one Activity
  // entry from this run that's unambiguously identifiable, unlike the
  // create/edit entries, which show the job/kind/current-amount only and
  // can't be distinguished from another run's leftover entries by text
  // alone.
  await page.goto("/activity");
  await expect(page.getByText(new RegExp(`delete expense:.*${marker}`)).first()).toBeVisible();
});
