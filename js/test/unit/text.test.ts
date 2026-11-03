import { describe, expect, it } from "vitest";
import { renderText } from "../../src/core/text.ts";
import { TRACE } from "../fixtures.ts";

describe("renderText", () => {
  it("prints records with tags and frames, skipping empty iterations", () => {
    const text = renderText(TRACE, { maxFrames: 1 });
    expect(text).toContain("=== iteration 1: instcombine ===");
    expect(text).not.toContain("iteration 2");
    expect(text).toContain("value 0x10 `i32 %x`  [visit=1] [rule=InstCombinerImpl::visitAdd]");
    expect(text).toContain("    #0 simplifyAddInst  lib/Analysis/InstructionSimplify.cpp:622");
    expect(text).toContain("    … 1 more");
    expect(text).toContain("replace 0x20 `%a = add i32 %x, 0`  ->  0x10 `i32 %x`  [visit=1] [fn=@f/entry] [rule=InstCombinerImpl::visitAdd]");
  });
});
