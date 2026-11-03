import { describe, expect, it } from "vitest";
import type { RawEvent } from "../../src/core/host.ts";
import type { Symbols } from "../../src/core/symbolize.ts";
import { buildTrace, segmentsOf, shortName, stackAddresses } from "../../src/core/trace.ts";

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
  { data: { type: "iteration_end", iteration: 1, ir: "; module after 1" }, stack: [] },
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

  it("keeps the module after each iteration", () => {
    expect(trace.iterations.map((it) => it.irAfter)).toEqual(["; module after 1", ""]);
  });

  it("drops the observatory's frames and falls back to V8 names", () => {
    const { frames } = trace.iterations[0].values[0];
    expect(frames.map((f) => f.function)).toEqual([
      "llvm::simplifyAddInst(...)",
      "llvm::InstCombinerImpl::visitAdd(llvm::BinaryOperator&)",
      "main",
    ]);
  });

  it("does not take a helper from an InstCombine header as the rule", () => {
    const helper = frame("llvm::InstCombiner::replaceInstUsesWith(...)", "lib/Transforms/InstCombine/InstCombineInternal.h", 616);
    const withHelper: Symbols = new Map([...symbols, [5, [helper]]]);
    const [first] = buildTrace([events[0], { ...events[1], stack: [{ offset: 5, name: null }, ...stack] }], withHelper).iterations;
    expect(first.values[0].rule?.function).toContain("visitAdd");
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

describe("visits, match calls and segments", () => {
  const instruction = { ptr: "0x20", ir: "%a = add i32 %x, 0" };
  const run = { name: "is_zero", line: 600, value: "i32 0", result: true, bound: [], matchers: [] };
  const raw: RawEvent[] = [
    { data: { type: "iteration_begin", iteration: 1, pass: "instcombine" }, stack: [] },
    { data: { type: "segment", iteration: 1, segment: 1 }, stack: [] },
    { data: { type: "visit_begin", iteration: 1, visit: 1, instruction }, stack: [] },
    { data: { type: "value", iteration: 1, visit: 1, value }, stack: [] },
    {
      data: { type: "match", iteration: 1, visit: 1, file: "/t/llvm/lib/Analysis/InstructionSimplify.cpp", line: 608, column: 8, matchers: [run] },
      stack: [],
    },
    { data: { type: "segment", iteration: 1, visit: 1, segment: 2 }, stack: [] },
    { data: { type: "visit_end", iteration: 1, visit: 1 }, stack: [] },
    { data: { type: "segment", iteration: 1, segment: 3 }, stack: [] },
    { data: { type: "iteration_end", iteration: 1 }, stack: [] },
  ];

  it("records each visit, each match call, and the visit of each record", () => {
    const [it1] = buildTrace(raw, new Map()).iterations;
    expect(it1.visits).toEqual([{ number: 1, instruction }]);
    const column = 8 + "llvm_obs::match_begin(), llvm_obs::match_end(".length; // at `match`
    expect(it1.matches).toEqual([{ visit: 1, site: { path: "lib/Analysis/InstructionSimplify.cpp", line: 608, column }, matchers: [run] }]);
    expect(it1.values[0].visit).toBe(1);
  });

  it("lists the coverage segments by iteration and visit", () => {
    expect(segmentsOf(raw)).toEqual([
      { segment: 1, iteration: 1, visit: null },
      { segment: 2, iteration: 1, visit: 1 },
      { segment: 3, iteration: 1, visit: null },
    ]);
  });
});

describe("values described again once inserted", () => {
  const unplaced = { ptr: "0x30", ir: "<badref> = shl i32 %x, 1", opcode: "shl" };
  const placed = { ptr: "0x30", ir: "  %1 = shl i32 %x, 1", opcode: "shl", fn: "f", bb: "%0" };
  const other = { ptr: "0x40", ir: "<badref> = add i32 %x, 1", opcode: "add" };
  const trace = buildTrace(
    [
      { data: { type: "iteration_begin", iteration: 1, pass: "instcombine" }, stack: [] },
      { data: { type: "value", iteration: 1, visit: 1, value: unplaced }, stack: [] },
      { data: { type: "value", iteration: 1, visit: 1, value: other }, stack: [] },
      { data: { type: "replace", iteration: 1, old: { ptr: "0x20", ir: "%b = mul i32 %x, 2" }, new: unplaced }, stack: [] },
      { data: { type: "describe", iteration: 1, value: placed }, stack: [] },
      { data: { type: "iteration_end", iteration: 1 }, stack: [] },
    ],
    new Map(),
  );

  it("take the new description in every record of the value", () => {
    const [it1] = trace.iterations;
    expect(it1.values.map((v) => v.value)).toEqual([placed, other]);
    expect(it1.replacements[0].new).toEqual(placed);
  });
});
