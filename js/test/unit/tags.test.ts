import { describe, expect, it } from "vitest";
import { callArguments, lookup, type TagsFile } from "../../src/core/tags.ts";

const FILE: TagsFile = {
  paths: ["include/llvm/IR/PatternMatch.h", "lib/Analysis/InstructionSimplify.cpp", "lib/Transforms/InstCombine/InstCombineInternal.h"],
  tags: {
    match: [
      [0, 53, "function", 1, 2, 2],
      [0, 70, "function", 1, 1, 1],
      [0, 90, "function", 1, 1, 1],
    ],
    simplifyAddInst: [
      [1, 594, "function", 1, 6, 6],
      [1, 661, "function", 1, 5, 5],
    ],
    visitAdd: [
      [2, 102, "function", 0, 1, 1],
      [1, 9999, "function", 1, 1, 1],
    ],
    BinaryOperator: [[0, 10, "type", 1, 0, 0]],
  },
};

describe("lookup", () => {
  it("picks the overloads that take the call's arguments", () => {
    expect(lookup(FILE, "match", 2)).toEqual([{ path: "include/llvm/IR/PatternMatch.h", line: 53 }]);
    expect(lookup(FILE, "match", 1).map((l) => l.line)).toEqual([70, 90]);
    expect(lookup(FILE, "simplifyAddInst", 5)).toEqual([{ path: "lib/Analysis/InstructionSimplify.cpp", line: 661 }]);
  });

  it("falls back to every overload when none fits, and to all of them for a non-call", () => {
    expect(lookup(FILE, "match", 7)).toHaveLength(3);
    expect(lookup(FILE, "simplifyAddInst", null)).toHaveLength(2);
  });

  it("prefers definitions to declarations, and finds types", () => {
    expect(lookup(FILE, "visitAdd", 1)).toEqual([{ path: "lib/Analysis/InstructionSimplify.cpp", line: 9999 }]);
    expect(lookup(FILE, "BinaryOperator", null)).toEqual([{ path: "include/llvm/IR/PatternMatch.h", line: 10 }]);
    expect(lookup(FILE, "unknown", 1)).toEqual([]);
  });
});

describe("callArguments", () => {
  const at = (text: string, name: string) => callArguments(text, text.indexOf(name) + name.length);

  it("counts top-level arguments, across lines and nested calls", () => {
    expect(at("if (match(Op1, m_Zero()))", "match")).toBe(2);
    expect(at("simplifyAddInst(I.getOperand(0), I.getOperand(1),\n    NSW, NUW, SQ)", "simplifyAddInst")).toBe(5);
    expect(at("foo()", "foo")).toBe(0);
    expect(at('f(",", \')\', g[a, b])', "f")).toBe(3);
  });

  it("skips template arguments, and is null without a call", () => {
    expect(at("m_Intrinsic<Intrinsic::fabs>(m_Value(X))", "m_Intrinsic")).toBe(1);
    expect(at("Value *V = X;", "V")).toBeNull();
  });
});
