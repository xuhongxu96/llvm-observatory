import { describe, expect, it } from "vitest";
import { definitionAt, patternAt, type XrefFile } from "../../src/core/xref.ts";

const pattern = { name: "m_Zero", text: "m_Zero()", classes: ["is_zero"], args: [], vars: [] };
const xref: XrefFile = {
  paths: ["lib/Analysis/ValueTracking.cpp", "lib/Transforms/InstCombine/InstCombineAddSub.cpp"],
  // matchSimpleRecurrence: two overloads of four parameters.
  calls: {
    "lib/Transforms/InstCombine/InstCombineAddSub.cpp": [[2009, 9, 0, 9432]],
    "lib/Analysis/ValueTracking.cpp": [[1787, 9, 0, 9421]],
  },
  patterns: { "lib/Analysis/InstructionSimplify.cpp": { "608:53": pattern } },
};

describe("definitionAt", () => {
  it("goes where clang resolved the call", () => {
    expect(definitionAt(xref, "lib/Transforms/InstCombine/InstCombineAddSub.cpp", 2009, 9)).toEqual({ path: "lib/Analysis/ValueTracking.cpp", line: 9432 });
    expect(definitionAt(xref, "lib/Analysis/ValueTracking.cpp", 1787, 9)).toEqual({ path: "lib/Analysis/ValueTracking.cpp", line: 9421 });
  });

  it("knows only the first character of a called name", () => {
    expect(definitionAt(xref, "lib/Analysis/ValueTracking.cpp", 1787, 10)).toBeNull();
    expect(definitionAt(xref, "lib/Other.cpp", 1, 1)).toBeNull();
  });
});

describe("patternAt", () => {
  it("finds a match call's pattern by its site", () => {
    expect(patternAt(xref, { path: "lib/Analysis/InstructionSimplify.cpp", line: 608, column: 53 })).toBe(pattern);
    expect(patternAt(xref, { path: "lib/Analysis/InstructionSimplify.cpp", line: 608, column: 1 })).toBeNull();
  });
});
