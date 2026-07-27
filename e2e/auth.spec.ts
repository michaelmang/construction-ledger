import { test, expect } from "@playwright/test";

// No storageState set for this file — every test here runs as a genuinely
// signed-out browser context (Playwright's default when test.use isn't
// called), which is exactly what proxy.ts's gate needs to be exercised
// against.
test("signed-out users are redirected to sign-in, not the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test.describe("Viewer role", () => {
  test.use({ storageState: "e2e/.auth/viewer.json" });

  test("can read the dashboard and a job's transactions, but cannot record an expense", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto("/jobs");
    await page.getByRole("link", { name: "Miller Kitchen Remodel" }).click();
    await expect(page).toHaveURL(/\/jobs\/\d+$/);

    // Direct action invocation via a real form submit — not just checking
    // that a button is hidden (Phase 1 acceptance: "verified by direct
    // action invocation, not just missing buttons"). requireWriteRole()
    // in lib/authz.ts is what actually enforces this.
    await page.getByRole("link", { name: "Record Expense" }).click();
    await expect(page).toHaveURL(/\/transactions\/expenses\/new$/);

    await page.getByLabel("Cost Type").selectOption({ label: "Material" });
    await page.getByLabel("Cost Code").selectOption({ label: "03-CONCRETE — Concrete" });
    await page.getByLabel("Vendor").selectOption({ label: "Ace Concrete Supply" });
    await page.getByLabel("Amount").fill("100.00");
    await page.getByRole("button", { name: "Record Cost" }).click();

    // Next's own route-announcer also has role="alert", so match on the
    // FormError banner's text directly rather than the role alone.
    await expect(page.getByText("Your account is read-only")).toBeVisible();
  });
});
