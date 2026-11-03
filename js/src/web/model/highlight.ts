// Syntax highlighting of C++ sources from tree-sitter's highlight captures, as Monaco
// semantic tokens.

// One capture of a highlight query: [start, end) in the source (UTF-16 offsets), its
// name (e.g. "function.method"), and the index of the pattern that made it.
export interface Capture {
  start: number;
  end: number;
  name: string;
  pattern: number;
}

// The categories that get a color (the semantic token types; src/web/monaco/theme.ts
// colors them). The others (variable, constant, delimiter, ...) stay plain: in LLVM's
// naming style, C's "constant" pattern (all capitals) matches variables such as I and C.
export const CATEGORIES = ["keyword", "type", "function", "property", "string", "number", "comment", "operator", "label"];

// The category of a capture name, or -1 if it is not colored.
export function categoryOf(captureName: string): number {
  return CATEGORIES.indexOf(captureName.split(".")[0]);
}

// Monaco's semantic token encoding: five numbers per token (line delta, start delta,
// length, type, modifiers), tokens in order and within one line. Where captures overlap,
// the innermost wins, and for the same range the later pattern (the queries put specific
// patterns after general ones).
export function semanticTokens(source: string, captures: Capture[]): Uint32Array {
  const category = new Int8Array(source.length).fill(-1);
  const ordered = [...captures].sort((a, b) => b.end - b.start - (a.end - a.start) || a.pattern - b.pattern);
  for (const c of ordered) category.fill(categoryOf(c.name), c.start, Math.min(c.end, source.length));

  const data: number[] = [];
  let line = 0;
  let lineStart = 0;
  let lastLine = 0;
  let lastStart = 0;
  for (let i = 0; i < source.length; ) {
    if (source[i] === "\n") {
      line++;
      lineStart = ++i;
      continue;
    }
    let end = i + 1;
    while (end < source.length && source[end] !== "\n" && category[end] === category[i]) end++;
    if (category[i] >= 0) {
      const start = i - lineStart;
      data.push(line - lastLine, line === lastLine ? start - lastStart : start, end - i, category[i], 0);
      lastLine = line;
      lastStart = start;
    }
    i = end;
  }
  return Uint32Array.from(data);
}
