import { describe, expect, it } from "vitest";
import type { FileCoverage } from "../../src/core/mcdc.ts";
import { sourceMarks, splitLine } from "../../src/web/model/badges.ts";

const SOURCE = ["int f(int a, int b) {", "  if (a && b)", "    return 1;", "  while (a)", "    a--;", "}"].join("\n");

const FILE: FileCoverage = {
  decisions: [{ line: 2, col: 7, endLine: 2, endCol: 12, conditionCount: 2, vectors: [[true, false], [false, null]], results: [false, false] }],
  branches: [{ line: 4, col: 10, endLine: 4, endCol: 10, trueCount: 3, falseCount: 1 }],
};

describe("sourceMarks", () => {
  const { badges } = sourceMarks(FILE, SOURCE);

  it("marks each condition with its values and the decision with its outcome", () => {
    expect(badges.get(2)?.map((b) => [b.column, b.text, b.kind])).toEqual([
      [7, "T/F", "M"],
      [12, "F/-", "M"],
      [12, "→ false", "result"],
    ]);
  });

  it("marks plain while conditions", () => {
    expect(badges.get(4)?.map((b) => [b.text, b.kind])).toEqual([["T/F", "M"]]);
  });
});

describe("splitLine", () => {
  const badge = (column: number) => ({ column, text: "T", kind: "T" as const, title: "" });
  const kw = (text: string) => ({ text, cls: "mtk6" });
  const plain = (text: string) => ({ text, cls: "" });

  it("places badges between spans, splitting the span they fall in", () => {
    expect(splitLine([kw("if"), plain(" (abc)")], [badge(2), badge(6)])).toEqual([
      kw("if"),
      badge(2),
      plain(" (ab"),
      badge(6),
      plain("c)"),
    ]);
  });

  it("puts badges at or past the end of the line last, in order", () => {
    expect(splitLine([plain("ab")], [badge(2), badge(9)])).toEqual([plain("ab"), badge(2), badge(9)]);
    expect(splitLine([], [badge(0)])).toEqual([badge(0)]);
  });
});
