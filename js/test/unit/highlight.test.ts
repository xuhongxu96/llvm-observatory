import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryOf, semanticTokens, type Capture } from "../../src/web/model/highlight.ts";

const cap = (start: number, end: number, name: string, pattern: number): Capture => ({ start, end, name, pattern });
const type = (name: string) => CATEGORIES.indexOf(name);

// Decodes Monaco's relative encoding into [line, start, length, category] tuples.
function decode(data: Uint32Array): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i];
    start = data[i] === 0 ? start + data[i + 1] : data[i + 1];
    out.push([line, start, data[i + 2], CATEGORIES[data[i + 3]]]);
  }
  return out;
}

describe("semanticTokens", () => {
  const source = "if (f(x))\n  return X;";

  it("encodes colored captures as tokens, line by line", () => {
    const data = semanticTokens(source, [cap(0, 2, "keyword", 5), cap(4, 5, "function", 7), cap(12, 18, "keyword", 5), cap(19, 20, "constant", 1)]);
    expect(decode(data)).toEqual([
      [0, 0, 2, "keyword"],
      [0, 4, 1, "function"],
      [1, 2, 6, "keyword"],
    ]);
  });

  it("lets the later pattern win on the same node and the inner node win over an outer one", () => {
    // `f` is a variable (pattern 0) and a function (pattern 7); the call (pattern 9) is outer.
    const data = semanticTokens(source, [cap(4, 5, "function", 7), cap(4, 5, "variable", 0), cap(4, 8, "string", 9)]);
    expect(decode(data)).toEqual([
      [0, 4, 1, "function"],
      [0, 5, 3, "string"],
    ]);
  });

  it("splits a capture over several lines into one token per line", () => {
    expect(decode(semanticTokens("/* a\n b */", [cap(0, 10, "comment", 0)]))).toEqual([
      [0, 0, 4, "comment"],
      [1, 0, 5, "comment"],
    ]);
  });
});

describe("categoryOf", () => {
  it("colors categories, not variables or LLVM's capitalized names", () => {
    expect(categoryOf("function.method")).toBe(type("function"));
    expect(categoryOf("type.builtin")).toBe(type("type"));
    expect(categoryOf("variable")).toBe(-1);
    expect(categoryOf("constant")).toBe(-1);
  });
});
