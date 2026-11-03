import { describe, expect, it } from "vitest";
import type { RawEvent } from "../../src/core/host.ts";
import type { Symbols } from "../../src/core/symbolize.ts";
import { buildTrace, shortName, stackAddresses } from "../../src/core/trace.ts";

const frame = (fn: string, path: string | null, line = 1) => ({ function: fn, path, line, column: 0 });

const symbols: Symbols = new Map([
  [1, [frame("llvm_obs::on_value(llvm::Value const*)", null)]],
  [2, [frame("llvm_obs::observed<llvm::Value*>(llvm::Value*&&)", "include/hooks.h"), frame("llvm::simplifyAddInst(...)", "lib/Analysis/InstructionSimplify.cpp", 622)]],
  [3, [frame("llvm::InstCombinerImpl::visitAdd(llvm::BinaryOperator&)", "lib/Transforms/InstCombine/InstCombineAddSub.cpp", 1556)]],
  [4, []],
]);

const stack = [1, 2, 3, 4].map((offset) => ({ offset, name: offset === 4 ? "main" : null }));
const value = { ptr: "0x10", ir: "i32 %x" };
const events: RawEvent[] = [
  { data: { type: "iteration_begin", iteration: 1, pass: "instcombine" }, stack: [] },
  { data: { type: "value", iteration: 1, value }, stack },
  { data: { type: "replace", iteration: 1, old: { ptr: "0x20", ir: "%a = add i32 %x, 0", opcode: "add" }, new: value }, stack },
  { data: { type: "iteration_end", iteration: 1 }, stack: [] },
  { data: { type: "iteration_begin", iteration: 2, pass: "aggressive-instcombine" }, stack: [] },
  { data: { type: "iteration_end", iteration: 2 }, stack: [] },
];

describe("buildTrace", () => {
  const trace = buildTrace(events, symbols);

  it("groups records by iteration", () => {
    expect(trace.iterations.map((it) => [it.number, it.pass, it.values.length, it.replacements.length])).toEqual([
      [1, "instcombine", 1, 1],
      [2, "aggressive-instcombine", 0, 0],
    ]);
  });

  it("drops the observatory's frames and falls back to V8 names", () => {
    const { frames } = trace.iterations[0].values[0];
    expect(frames.map((f) => f.function)).toEqual([
      "llvm::simplifyAddInst(...)",
      "llvm::InstCombinerImpl::visitAdd(llvm::BinaryOperator&)",
      "main",
    ]);
  });

  it("takes the innermost InstCombine frame as the rule", () => {
    expect(trace.iterations[0].values[0].rule?.line).toBe(1556);
    expect(trace.iterations[0].replacements[0].rule?.function).toContain("visitAdd");
  });

  it("collects every stack address", () => {
    expect(stackAddresses(events).map((a) => a.offset)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
});

describe("shortName", () => {
  it.each([
    ["llvm::Instruction* llvm::InstCombinerImpl::visitAdd(llvm::BinaryOperator&)", "InstCombinerImpl::visitAdd"],
    ["llvm::simplifyAddInst(llvm::Value*, llvm::Value*, bool, bool, llvm::SimplifyQuery const&, unsigned int)", "simplifyAddInst"],
    ["bool llvm::PatternMatch::match<llvm::Value, llvm::PatternMatch::bind_ty<llvm::Value> >(llvm::Value*, llvm::PatternMatch::bind_ty<llvm::Value> const&)", "PatternMatch::match<llvm::Value, llvm::PatternMatch::bind_ty<llvm::Value> >"],
    ["main", "main"],
  ])("%s", (full, short) => {
    expect(shortName(full)).toBe(short);
  });
});
