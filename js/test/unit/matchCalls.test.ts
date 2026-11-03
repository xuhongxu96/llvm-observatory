import { describe, expect, it } from "vitest";
import type { MatchCall, MatcherRun } from "../../src/core/types.ts";
import { callHover, callSites, treeLines } from "../../src/web/model/matchCalls.ts";

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

describe("treeLines", () => {
  it("draws the matchers as a tree, with values, results and bindings", () => {
    expect(treeLines([add], "")).toEqual([
      "BinaryOp_match  i32 %a  ✓",
      "├ match_bind  i32 %x  ✓  VR = i32 %x",
      "└ cstval_pred_ty  i32 0  ✓",
    ]);
  });
});

describe("callHover", () => {
  it("shows each run's outcome and tree", () => {
    const md = callHover({ site, runs: [call([add]), call([run("cstval_pred_ty", "i32 %y", false)])] }, "visit 1");
    expect(md).toContain("**match** ran 2 times in visit 1");
    expect(md).toContain("run 1: **matched**\n```\nBinaryOp_match  i32 %a  ✓");
    expect(md).toContain("run 2: **did not match**\n```\ncstval_pred_ty  i32 %y  ✗\n```");
  });
});
