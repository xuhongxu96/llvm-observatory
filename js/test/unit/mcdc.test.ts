import { describe, expect, it } from "vitest";
import { conditionTexts, decisions, singleConditions, stripGroupingParens, summarize, valueLabel } from "../../src/core/mcdc.ts";

const SOURCE = [
  "Value *f(Value *A, Value *B) {",
  "  if (match(A, m_Zero()) && (B || isa<Constant>(A)))",
  "    return B;",
  "  if (A)",
  "    return A;",
  "}",
].join("\n");

const FILE = "/t/llvm/lib/Analysis/InstructionSimplify.cpp";

// An llvm-cov export with one executed decision (line 2) and one plain if (line 4).
const report = {
  data: [
    {
      functions: [
        {
          filenames: [FILE],
          mcdc_records: [
            [2, 7, 2, 51, 0, 0, 0, 0, 5, [{}, {}, {}], [
              { executed: true, result: true, conditions: [true, true, null] },
              { executed: true, result: false, conditions: [false, null, null] },
              { executed: false, result: true, conditions: [true, false, true] },
            ]],
            [4, 7, 4, 7, 0, 0, 0, 0, 5, [{}, {}], [{ executed: false, result: true, conditions: [true, true] }]],
          ],
          branches: [
            [4, 7, 4, 7, 2, 0, 0, 0, 4],
            [4, 7, 4, 7, 2, 0, 0, 0, 4],
            [5, 1, 5, 2, 0, 0, 0, 0, 4],
          ],
        },
        { filenames: ["/t/runtime.cpp"], mcdc_records: [], branches: [[1, 1, 1, 2, 1, 1, 0, 0, 4]] },
      ],
    },
  ],
};

describe("summarize", () => {
  const files = summarize(report as never);

  it("keeps executed records of LLVM sources only", () => {
    expect([...files.keys()]).toEqual(["lib/Analysis/InstructionSimplify.cpp"]);
    const file = files.get("lib/Analysis/InstructionSimplify.cpp")!;
    expect(file.decisions).toHaveLength(1);
    expect(file.decisions[0].vectors).toEqual([[true, true, null], [false, null, null]]);
    expect(file.branches).toEqual([{ line: 4, col: 7, endLine: 4, endCol: 7, trueCount: 4, falseCount: 0 }]); // two records, summed
  });

  it("places decisions and their conditions in the source", () => {
    const [d] = decisions(files.get("lib/Analysis/InstructionSimplify.cpp")!, SOURCE);
    expect(d.conditionNames).toEqual(["match(A, m_Zero())", "B", "isa<Constant>(A)"]);
    expect(d.conditions[1]).toMatchObject({ start: { line: 2, col: 30 }, end: { line: 2, col: 31 }, values: [true, null] });
    expect(d.results).toEqual([true, false]);
  });

  it("finds plain conditions over several lines", () => {
    const source = "  while (A &&\n         B)\n    f();\n  if (Value *V =\n          g())\n    h();";
    const file = { decisions: [], branches: [{ line: 4, col: 7, endLine: 5, endCol: 13, trueCount: 1, falseCount: 0 }] };
    expect(singleConditions(file, source)).toMatchObject([{ keyword: "if", text: "Value *V =\n          g()", values: [true] }]);
  });

  it("finds conditions that declare a variable", () => {
    const source = "  if (Value *V = f(A))\n    g();\n  if (const APInt *C = h())\n    k();";
    const file = {
      decisions: [],
      branches: [
        { line: 1, col: 14, endLine: 1, endCol: 14, trueCount: 1, falseCount: 0 },
        { line: 3, col: 20, endLine: 3, endCol: 20, trueCount: 0, falseCount: 2 },
      ],
    };
    expect(singleConditions(file, source).map((c) => [c.keyword, c.text, c.values])).toEqual([
      ["if", "V", [true]],
      ["if", "C", [false]],
    ]);
  });

  it("finds plain if conditions", () => {
    const [c] = singleConditions(files.get("lib/Analysis/InstructionSimplify.cpp")!, SOURCE);
    expect(c).toMatchObject({ keyword: "if", text: "A", line: 4, values: [true] });
  });
});

describe("decisions in a return statement", () => {
  it("leave out the semicolon", () => {
    const file = { decisions: [{ line: 1, col: 10, endLine: 1, endCol: 18, conditionCount: 2, vectors: [[true, true]], results: [true] }], branches: [] };
    expect(decisions(file, "  return a && b();").map((d) => d.conditionNames)).toEqual([["a", "b()"]]);
  });
});

describe("condition text", () => {
  it("splits at && and || outside literals", () => {
    expect(conditionTexts("a && (b || c == '|') && s != \"&&\"")).toEqual(["a", "b", "c == '|'", "s != \"&&\""]);
  });

  it("strips only unmatched grouping parentheses", () => {
    expect(stripGroupingParens("((a)")).toBe("(a)");
    expect(stripGroupingParens("f(x))")).toBe("f(x)");
  });

  it("labels values", () => {
    expect(valueLabel([true, true])).toBe("T");
    expect(valueLabel([null])).toBe("-");
    expect(valueLabel([true, false, true])).toBe("T/F");
  });
});

describe("summarize with a decision's own branch region", () => {
  it("does not repeat the decision as a plain condition", () => {
    const rec = [2, 7, 2, 51, 0, 0, 0, 0, 5, [{}, {}], [{ executed: true, result: true, conditions: [true, null] }]];
    const files = summarize({ data: [{ functions: [{ filenames: [FILE], mcdc_records: [rec], branches: [[2, 7, 2, 51, 1, 0, 0, 0, 4]] }] }] } as never);
    expect(files.get("lib/Analysis/InstructionSimplify.cpp")!.branches).toEqual([]);
  });
});

describe("summarize with one header function instantiated twice", () => {
  const HEADER = "/t/llvm/include/llvm/IR/PatternMatch.h";
  const instantiation = (vector: (boolean | null)[], result: boolean, counts: [number, number]) => ({
    filenames: [HEADER],
    mcdc_records: [[10, 5, 10, 20, 0, 0, 0, 0, 5, [{}, {}], [{ executed: true, result, conditions: vector }]]],
    branches: [[12, 9, 12, 12, counts[0], counts[1], 0, 0, 4]],
  });
  const files = summarize({
    data: [{ functions: [instantiation([true, true], true, [1, 0]), instantiation([false, null], false, [0, 2]), instantiation([true, true], true, [1, 0])] }],
  } as never);
  const file = files.get("include/llvm/IR/PatternMatch.h")!;

  it("merges the decision's distinct test vectors", () => {
    expect(file.decisions).toHaveLength(1);
    expect(file.decisions[0].vectors).toEqual([[true, true], [false, null]]);
    expect(file.decisions[0].results).toEqual([true, false]);
  });

  it("sums the branch counts", () => {
    expect(file.branches).toEqual([{ line: 12, col: 9, endLine: 12, endCol: 12, trueCount: 2, falseCount: 2 }]);
  });
});

describe("regions that do not fit the source", () => {
  it("are skipped, not placed", () => {
    const file = {
      decisions: [{ line: 40, col: 1, endLine: 41, endCol: 5, conditionCount: 2, vectors: [[true, true]], results: [true] }],
      branches: [{ line: 50, col: 7, endLine: 50, endCol: 8, trueCount: 1, falseCount: 0 }],
    };
    expect(decisions(file, "short\nsource")).toEqual([]);
    expect(singleConditions(file, "short\nsource")).toEqual([]);
  });
});
