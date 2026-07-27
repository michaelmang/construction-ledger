import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// Create a progress billing -> record a payment applied to it (V4 spec
// Phase 3 smoke suite: "create billing -> record payment"), against the
// seeded "Miller Kitchen Remodel" job.
test("creates a progress billing and records a payment against it", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Miller Kitchen Remodel" }).click();
  await page.getByRole("link", { name: "Create Progress Billing" }).click();

  const periodLabel = `E2E Pay App ${Date.now()}`;
  await page.getByLabel("Period Label").fill(periodLabel);
  // Deliberately small, though this job's cumulative billed-to-date
  // eventually exceeds its seeded contract value regardless just from
  // repeated runs of this spec (CI reruns, local iteration) — the
  // over-billing warning screen below is a real, allowed app state
  // (billing-math.ts: "allowed but warned"), not a bug, so this test
  // handles it rather than trying to dodge it forever.
  await page.getByLabel("Amount Billed", { exact: true }).fill("50.00");
  await page.getByRole("button", { name: /Create|Record/ }).click();

  // A real git commit (isomorphic-git) happens server-side before the
  // redirect/warning screen — slower than the default 5s expect timeout
  // under load. Two possible outcomes here: the over-billing warning
  // screen (stays on /new, shows "Continue to Billings") or a plain
  // redirect straight to the billings list on success — that list page
  // has no "Progress Billings" heading anywhere (confirmed against a real
  // failure's page snapshot: the redirect had already happened and the
  // new row was already in the table, but this locator never matched
  // anything on that page), so periodLabel's own text is the real,
  // reliable signal that the no-warning path landed.
  const continueLink = page.getByRole("link", { name: "Continue to Billings" });
  const newRowLanded = page.getByText(periodLabel);
  await expect(continueLink.or(newRowLanded)).toBeVisible({ timeout: 30_000 });
  if (await continueLink.isVisible()) await continueLink.click();

  await expect(page).toHaveURL(/\/billings/, { timeout: 30_000 });
  await expect(page.getByText(periodLabel)).toBeVisible({ timeout: 30_000 });

  await page.goto("/jobs");
  await page.getByRole("link", { name: "Miller Kitchen Remodel" }).click();
  await page.getByRole("link", { name: "Record Payment" }).click();

  const applyTo = page.getByLabel("Apply To");
  const optionValue = await applyTo.locator("option", { hasText: periodLabel }).getAttribute("value");
  await applyTo.selectOption(optionValue!);
  await page.getByRole("button", { name: "Record Payment" }).click();

  await expect(page).toHaveURL(/\/transactions$/, { timeout: 30_000 });
  await expect(page.getByRole("row", { name: /Payment received/ }).first()).toBeVisible();

  await page.goto("/jobs");
  await page.getByRole("link", { name: "Miller Kitchen Remodel" }).click();
  await page.getByRole("link", { name: "Billings" }).click();
  const billingRow = page.getByRole("row", { name: new RegExp(periodLabel) });
  await expect(billingRow).toBeVisible();
  await expect(billingRow.getByText(/paid|partial/i)).toBeVisible();
});
