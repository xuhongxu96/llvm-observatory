// The app end to end: load the driver, run the default IR, inspect a fold and its
// conditions, and make a share link that runs again.
import { expect, test } from "@playwright/test";

test("observes InstCombine and shows the conditions of an iteration", async ({ page }) => {
  await page.goto("/");
  const status = page.getByRole("status");
  await expect(status).toHaveText("ready", { timeout: 120_000 });

  await page.getByRole("button", { name: "Run" }).click();
  await expect(status).toHaveText("done", { timeout: 60_000 });
  await expect(page.getByText("Iteration 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "InstCombinerImpl::visitAdd" }).first()).toBeVisible();
  await expect(page.getByText("Optimized IR")).toBeVisible();

  // The optimized IR after each iteration, the last (final) one by default.
  const picker = page.getByLabel("IR after");
  await expect(picker.locator("option:checked")).toHaveText(/: final$/);
  await picker.selectOption({ label: "after iteration 1 (instcombine)" });
  await expect(page.locator(".pane", { hasText: "Optimized IR" }).locator(".view-lines")).toContainText("shl i32 %x, 1");

  // Scrolled, the filter bar stays flush with the trace pane's top: nothing shows above it.
  const barOffset = await page.locator(".structured-trace").evaluate((trace) => {
    trace.scrollTop = 100;
    return trace.querySelector(".trace-filter-bar")!.getBoundingClientRect().top - trace.getBoundingClientRect().top;
  });
  expect(barOffset).toBe(0);

  // The rule opens its source, with the iteration's MC/DC badges.
  await page.getByRole("button", { name: "InstCombinerImpl::visitAdd" }).first().click();
  await expect(page.locator(".source-code .row.current")).toContainText("if (Value *V = simplifyAddInst(");
  await expect(page.locator(".source-status")).toContainText("evaluated in this iteration", { timeout: 60_000 });
  await expect(page.locator(".source-code .badge").first()).toBeVisible();

  // Long source lines scroll inside the source pane; the page never gets wider.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // A frame in a source the build does not ship says so (the server must not answer
  // with the app's own page instead).
  await page.locator("details.trace-frames summary").first().click();
  await page.locator(".trace-frames").first().getByRole("button", { name: /^Instruction\.def:/ }).click();
  await expect(page.getByText("include/llvm/IR/Instruction.def is not in this build's sources")).toBeVisible();

  // The iteration's overview lists the sources it evaluated conditions in.
  await page.getByRole("button", { name: "conditions" }).first().click();
  await expect(page.getByRole("button", { name: "lib/Analysis/InstructionSimplify.cpp" })).toBeVisible({ timeout: 60_000 });
});

test("a share link carries the IR and runs it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("ready", { timeout: 120_000 });
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("button", { name: "link copied" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("irz=");

  await page.goto(link);
  await expect(page.getByRole("status")).toHaveText("done", { timeout: 120_000 });
  await expect(page.getByText("Iteration 1", { exact: true })).toBeVisible();
});
