import { describe, expect, it } from "vitest";
import type { FileCoverage } from "../../src/core/mcdc.ts";
import { sourceMarks } from "../../src/web/model/badges.ts";

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
