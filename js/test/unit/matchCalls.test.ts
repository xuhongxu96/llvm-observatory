import { describe, expect, it } from "vitest";
import type { MatchCall, MatcherRun } from "../../src/core/types.ts";
import type { Pattern } from "../../src/core/xref.ts";
import { callHover, callSites, nameRuns, treeLines } from "../../src/web/model/matchCalls.ts";

const run = (name: string, value: string | undefined, result: boolean | undefined, matchers: MatcherRun[] = [], bound: MatcherRun["bound"] = []): MatcherRun => ({
  name,
  line: 1,
  value,
  result,
  bound,
  matchers,
});

const add = run("BinaryOp_match", "i32 %a", true, [
  run("match_bind", "i32 %x", true, [], [{ name: "VR", value: "i32 %x" }]),
  run("cstval_pred_ty", "i32 0", true),
]);
const site = { path: "lib/Analysis/InstructionSimplify.cpp", line: 608, column: 7 };
const call = (matchers: MatcherRun[], visit = 1): MatchCall => ({ visit, site, matchers });

describe("callSites", () => {
  it("groups a source's calls by site", () => {
    const other = { ...call([]), site: { ...site, path: "lib/Other.cpp" } };
    expect(callSites([call([add]), call([add]), other], site.path)).toEqual([{ site, runs: [call([add]), call([add])] }]);
  });
});

// m_Add(m_Value(X), m_Zero()), as scripts/xref.py writes it.
const leaf = (name: string, text: string, classes: string[], vars: string[] = []): Pattern => ({ name, text, classes, args: [], vars });
const pattern: Pattern = {
  name: "m_Add",
  text: "m_Add(m_Value(X), m_Zero())",
  classes: ["BinaryOp_match"],
  args: [leaf("m_Value", "m_Value(X)", ["match_bind"], ["X"]), leaf("m_Zero", "m_Zero()", ["cstval_pred_ty"])],
  vars: [],
};

describe("treeLines", () => {
  it("draws the matchers as a tree, with values, results and bindings, by class without a pattern", () => {
    expect(treeLines(nameRuns([add], null))).toEqual([
      "BinaryOp_match  i32 %a  ✓",
      "├ match_bind  i32 %x  ✓  VR = i32 %x",
      "└ cstval_pred_ty  i32 0  ✓",
    ]);
  });

  it("gives a single child a branch", () => {
    const one = run("OneUse_match", "i32 %a", false, [run("BinaryOp_match", "i32 %a", false)]);
    expect(treeLines(nameRuns([one], null))).toEqual(["OneUse_match  i32 %a  ✗", "└ BinaryOp_match  i32 %a  ✗"]);
  });
});

describe("nameRuns", () => {
  it("names the matchers as the pattern writes them, and what they bind by its variables", () => {
    expect(treeLines(nameRuns([add], pattern))).toEqual([
      "m_Add(…)  i32 %a  ✓",
      "├ m_Value(X)  i32 %x  ✓  X = i32 %x",
      "└ m_Zero()  i32 0  ✓",
    ]);
  });

  it("folds a match method that forwards to another of its matcher", () => {
    const forwarding = run("BinaryOp_match", "i32 %a", true, [add]);
    expect(treeLines(nameRuns([forwarding], pattern))[0]).toBe("m_Add(…)  i32 %a  ✓");
    expect(nameRuns([forwarding], pattern)[0].matchers).toHaveLength(2);
  });

  it("takes the sub-patterns in turn when several fit (a commutative matcher)", () => {
    const either: Pattern = { ...pattern, args: [leaf("m_Specific", "m_Specific(A)", ["specificval_ty"]), leaf("m_Specific", "m_Specific(B)", ["specificval_ty"])] };
    const tries = ["i32 %x", "i32 %y", "i32 %y", "i32 %x"].map((v) => run("specificval_ty", v, false));
    const labels = nameRuns([run("BinaryOp_match", "i32 %a", false, tries)], either)[0].matchers.map((m) => m.label);
    expect(labels).toEqual(["m_Specific(A)", "m_Specific(B)", "m_Specific(A)", "m_Specific(B)"]);
  });

  it("keeps the class of a run the pattern does not write (a matcher's inner working)", () => {
    const inner = run("BinaryOp_match", "i32 %a", true, [run("cstval_pred_ty", "i32 0", true)]);
    const [named] = nameRuns([run("OneUse_match", "i32 %a", true, [inner])], { ...pattern, name: "m_OneUse", classes: ["OneUse_match"], args: [] });
    expect(named.matchers[0].label).toBe("BinaryOp_match");
  });
});

describe("callHover", () => {
  it("shows each run's outcome and tree", () => {
    const md = callHover({ site, runs: [call([add]), call([run("cstval_pred_ty", "i32 %y", false)])] }, "visit 1", null);
    expect(md).toContain("**match** ran 2 times in visit 1");
    expect(md).toContain("run 1: **matched**\n```\nBinaryOp_match  i32 %a  ✓");
    expect(md).toContain("run 2: **did not match**\n```\ncstval_pred_ty  i32 %y  ✗\n```");
  });
});
