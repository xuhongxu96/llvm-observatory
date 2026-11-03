import { describe, expect, it } from "vitest";
import { parseSymbolizerJson, sourcePath } from "../../src/core/symbolize.ts";

describe("sourcePath", () => {
  it("keeps the path under the tree's llvm/ directory", () => {
    expect(sourcePath("/src/thirdparty/llvm-target/llvm/lib/Analysis/ValueTracking.cpp")).toBe(
      "lib/Analysis/ValueTracking.cpp",
    );
    expect(sourcePath("/src/thirdparty/llvm-target/llvm/include/llvm/IR/PatternMatch.h")).toBe(
      "include/llvm/IR/PatternMatch.h",
    );
  });

  it("is null outside an LLVM tree", () => {
    expect(sourcePath("/src/runtime/src/runtime.cpp")).toBeNull();
    expect(sourcePath("")).toBeNull();
  });
});

describe("parseSymbolizerJson", () => {
  it("expands inlined frames, innermost first, and drops empty ones", () => {
    const json = JSON.stringify([
      {
        Address: "0x500",
        Symbol: [
          { FunctionName: "llvm::PatternMatch::match", FileName: "/t/llvm/include/llvm/IR/PatternMatch.h", Line: 49, Column: 3 },
          { FunctionName: "llvm::simplifyAddInst", FileName: "/t/llvm/lib/Analysis/InstructionSimplify.cpp", Line: 622, Column: 7 },
        ],
      },
      { Address: "0x10", Symbol: [{ FunctionName: "", FileName: "", Line: 0, Column: 0 }] },
    ]);
    const symbols = parseSymbolizerJson(json);
    expect(symbols.get(0x500)).toEqual([
      { function: "llvm::PatternMatch::match", path: "include/llvm/IR/PatternMatch.h", line: 49, column: 3 },
      { function: "llvm::simplifyAddInst", path: "lib/Analysis/InstructionSimplify.cpp", line: 622, column: 7 },
    ]);
    expect(symbols.get(0x10)).toEqual([]);
  });
});
