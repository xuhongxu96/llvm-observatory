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

  // The rule opens its source in a read-only editor, at the rule's line, with the
  // iteration's MC/DC badges.
  await page.getByRole("button", { name: "InstCombinerImpl::visitAdd" }).first().click();
  // ... with the conditions of the visit that made the value.
  const visitTab = page.getByRole("tab", { name: "visit 1" });
  await expect(visitTab).toHaveAttribute("aria-selected", "true");
  await expect(visitTab).toHaveAttribute("title", /visiting %a = add i32 %x, 0/);
  const source = page.locator(".source-editor");
  await expect(source.locator(".view-lines")).toContainText("if (Value *V = simplifyAddInst(");
  await expect(source.locator(".source-line-current")).toHaveCount(1);
  // ... centered in the editor, not at its top.
  const position = await source.evaluate((editor) => {
    const box = editor.getBoundingClientRect();
    const current = editor.querySelector(".source-line-current")!.getBoundingClientRect();
    return (current.top + current.height / 2 - box.top) / box.height;
  });
  expect(position).toBeGreaterThan(0.35);
  expect(position).toBeLessThan(0.65);
  await expect(page.locator(".source-status")).toContainText("evaluated in visit 1", { timeout: 60_000 });
  await expect(source.locator(".badge").first()).toBeVisible();
  // Highlighted as C++ (tree-sitter semantic tokens): a method call in the theme's function color.
  await expect(source.locator(".view-line span", { hasText: /^getOperand$/ }).first()).toHaveCSS("color", "rgb(121, 94, 38)", {
    timeout: 30_000,
  });
  // A line number opens the line on GitHub, at the observed commit.
  await page.context().route("https://github.com/**", (route) => route.fulfill({ body: "github" }));
  const [github] = await Promise.all([
    page.waitForEvent("popup"),
    source.locator(".line-numbers", { hasText: /^1592$/ }).click(),
  ]);
  expect(github.url()).toMatch(
    /^https:\/\/github\.com\/llvm\/llvm-project\/blob\/[0-9a-f]{40}\/llvm\/lib\/Transforms\/InstCombine\/InstCombineAddSub\.cpp#L1592$/,
  );
  await github.close();

  // Ctrl/⌘+click on a call follows it to its definition (the overload with as many
  // parameters), in the same visit; back returns.
  const crumb = page.locator(".breadcrumb [aria-current=location]");
  await source.locator(".view-line span", { hasText: /^simplifyAddInst$/ }).first().click({ modifiers: ["ControlOrMeta"] });
  await expect(crumb).toHaveText("simplifyAddInst");
  await expect(crumb).toHaveAttribute("title", "lib/Analysis/InstructionSimplify.cpp:661");
  await expect(source.locator(".view-lines")).toContainText("Value *llvm::simplifyAddInst(");
  await expect(visitTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".source-status")).toContainText("evaluated in visit 1", { timeout: 60_000 });
  // On to the implementation, whose match call ran in the visit: its hover shows the
  // matchers as they ran.
  await source.locator(".view-line span", { hasText: /^simplifyAddInst$/ }).last().click({ modifiers: ["ControlOrMeta"] });
  await expect(crumb).toHaveAttribute("title", /^lib\/Analysis\/InstructionSimplify\.cpp:5\d\d$/);
  await source.locator(".view-line", { hasText: "X + poison -> poison" }).click();
  await page.keyboard.press("PageDown"); // down to the call, at line 608
  const call = source.locator(".source-annotation").first();
  await expect(call).toHaveText("match");
  await call.hover();
  await expect(page.locator(".monaco-hover:not(.hidden)")).toContainText("is_zero  i32 0  ✓");
  await page.getByRole("button", { name: "back" }).click();
  await page.getByRole("button", { name: "back" }).click();
  await expect(crumb).toHaveText("InstCombineAddSub.cpp:1592");
  await expect(page.locator(".breadcrumb .ahead")).toHaveText(["simplifyAddInst", "simplifyAddInst"]);
  // The whole run's conditions, kept along further jumps.
  await page.getByRole("tab", { name: "whole run" }).click();
  await expect(page.locator(".source-status")).toContainText("evaluated in the run", { timeout: 60_000 });

  // Long source lines scroll inside the source pane; the page never gets wider.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // A frame in a source the build does not ship says so (the server must not answer
  // with the app's own page instead).
  await page.locator("details.trace-frames summary").first().click();
  await page.locator(".trace-frames").first().getByRole("button", { name: /^Instruction\.def:/ }).click();
  await expect(page.getByText("include/llvm/IR/Instruction.def is not in this build's sources")).toBeVisible();

  // The trace as JSON: shown formatted, and saved as a file.
  await page.getByRole("tab", { name: "json" }).click();
  const jsonPane = page.locator(".pane", { hasText: "Trace" });
  await expect(jsonPane.locator(".view-lines")).toContainText('"iterations": [');
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "download" }).click()]);
  expect(download.suggestedFilename()).toBe("trace.json");
  const saved = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(saved.iterations[0].pass).toBe("instcombine");
  await page.getByRole("tab", { name: "structured" }).click();

  // From a visit's conditions to the whole iteration's, back at the rule.
  await page.getByRole("button", { name: "InstCombinerImpl::visitAdd" }).first().click();
  await page.getByRole("tab", { name: "iteration 1" }).click();
  await expect(page.locator(".source-status")).toContainText("evaluated in iteration 1", { timeout: 60_000 });

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
