import { describe, expect, it } from "vitest";
import { classOf, highlightLines, lineSpans, type Capture } from "../../src/web/model/highlight.ts";

const cap = (start: number, end: number, name: string, pattern: number): Capture => ({ start, end, name, pattern });

describe("highlightLines", () => {
  const source = "if (f(x))\n  return X;";

  it("splits the source into lines of spans, by capture", () => {
    const lines = highlightLines(source, [cap(0, 2, "keyword", 5), cap(4, 5, "function", 7), cap(12, 18, "keyword", 5)]);
    expect(lines).toEqual([
      [
        { text: "if", cls: "hl-keyword" },
        { text: " (", cls: "" },
        { text: "f", cls: "hl-function" },
        { text: "(x))", cls: "" },
      ],
      [
        { text: "  ", cls: "" },
        { text: "return", cls: "hl-keyword" },
        { text: " X;", cls: "" },
      ],
    ]);
  });

  it("lets the later pattern win on the same node and the inner node win over an outer one", () => {
    // `f` is a variable (pattern 0) and a function (pattern 7); the call (pattern 9) is outer.
    const [first] = highlightLines(source, [cap(4, 5, "function", 7), cap(4, 5, "variable", 0), cap(4, 8, "string", 9)]);
    expect(first).toEqual([
      { text: "if (", cls: "" },
      { text: "f", cls: "hl-function" },
      { text: "(x)", cls: "hl-string" },
      { text: ")", cls: "" },
    ]);
  });
});

describe("classOf", () => {
  it("colors categories, not variables or LLVM's capitalized names", () => {
    expect(classOf("function.method")).toBe("hl-function");
    expect(classOf("type.builtin")).toBe("hl-type");
    expect(classOf("variable")).toBe("");
    expect(classOf("constant")).toBe("");
  });
});

describe("lineSpans", () => {
  it("keeps highlighted spans when their text is the line, and plain text otherwise", () => {
    const spans = [{ text: "int", cls: "hl-type" }, { text: " x;", cls: "" }];
    expect(lineSpans("int x;", spans)).toBe(spans);
    expect(lineSpans("int y;", spans)).toEqual([{ text: "int y;", cls: "" }]);
    expect(lineSpans("", undefined)).toEqual([]);
  });
});
