import { describe, expect, it } from "vitest";
import { current, goTo, levelsOf, placeCrumb, push, replace, scopeOf, setLevel, start } from "../../src/web/model/navigation.ts";

const here = placeCrumb("lib/Transforms/InstCombine/InstCombineAddSub.cpp", 1592);
const callee = { path: "lib/Analysis/InstructionSimplify.cpp", line: 661, label: "simplifyAddInst" };
const matcher = placeCrumb("include/llvm/IR/PatternMatch.h", 53);

describe("navigation", () => {
  it("starts at the most specific coverage of its context", () => {
    expect(levelsOf({ iteration: 1, visit: 3 })).toEqual(["visit", "iteration", "run"]);
    expect(levelsOf({ iteration: 1 })).toEqual(["iteration", "run"]);
    expect(start({ iteration: 1, visit: 3 }, here).level).toBe("visit");
    expect(start({}, here).level).toBe("run");
  });

  it("keeps the coverage level along jumps", () => {
    let nav = start({ iteration: 1, visit: 3 }, here);
    nav = push(nav, callee);
    expect(scopeOf(nav)).toEqual({ iteration: 1, visit: 3 });
    nav = setLevel(nav, "run");
    nav = push(nav, matcher);
    expect(scopeOf(nav)).toEqual({});
    expect(setLevel(start({ iteration: 2 }, here), "visit").level).toBe("iteration"); // not available
  });

  it("goes back along the crumbs, and a new jump drops the ones after", () => {
    let nav = push(push(start({ iteration: 1 }, here), callee), matcher);
    expect(nav.crumbs.map((c) => c.label)).toEqual(["InstCombineAddSub.cpp:1592", "simplifyAddInst", "PatternMatch.h:53"]);
    nav = goTo(nav, 0);
    expect(current(nav)).toBe(here);
    expect(nav.crumbs).toHaveLength(3); // still there, ahead
    nav = push(nav, matcher);
    expect(nav.crumbs.map((c) => c.label)).toEqual(["InstCombineAddSub.cpp:1592", "PatternMatch.h:53"]);
    expect(current(replace(nav, callee))).toBe(callee);
  });

  it("names the list of sources", () => {
    expect(placeCrumb(null, null).label).toBe("evaluated sources");
  });
});
