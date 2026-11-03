// Syntax highlighting for the source view: tree-sitter's C++ highlight captures turned
// into a line's spans of text, each with a CSS class for its category.

// A run of text and its class ("" for plain text).
export interface Span {
  text: string;
  cls: string;
}

// One capture of a highlight query: [start, end) in the source (UTF-16 offsets), its
// name (e.g. "function.method"), and the index of the pattern that made it.
export interface Capture {
  start: number;
  end: number;
  name: string;
  pattern: number;
}

// The categories that get a color. The others (variable, constant, delimiter, ...)
// stay plain: in LLVM's naming style, C's "constant" pattern (all capitals) matches
// variables such as I and C.
const COLORED = new Set(["keyword", "type", "function", "property", "string", "number", "comment", "operator", "label"]);

export function classOf(captureName: string): string {
  const category = captureName.split(".")[0];
  return COLORED.has(category) ? `hl-${category}` : "";
}

// The lines of `source` as spans. Where captures overlap, the innermost wins, and for
// the same range the later pattern (the queries put specific patterns after general ones).
export function highlightLines(source: string, captures: Capture[]): Span[][] {
  const classes: string[] = new Array(source.length).fill("");
  const ordered = [...captures].sort((a, b) => b.end - b.start - (a.end - a.start) || a.pattern - b.pattern);
  for (const c of ordered) classes.fill(classOf(c.name), c.start, Math.min(c.end, source.length));

  const lines: Span[][] = [[]];
  let start = 0;
  for (let i = 0; i <= source.length; i++) {
    const atEnd = i === source.length || source[i] === "\n";
    if (atEnd || classes[i] !== classes[start]) {
      if (i > start) lines[lines.length - 1].push({ text: source.slice(start, i), cls: classes[start] });
      start = i;
    }
    if (atEnd && i < source.length) {
      lines.push([]);
      start = i + 1;
    }
  }
  return lines;
}

// The spans of a line, or the line as plain text without highlighting.
export function lineSpans(line: string, highlighted: Span[] | undefined): Span[] {
  if (highlighted && highlighted.map((s) => s.text).join("") === line) return highlighted;
  return line ? [{ text: line, cls: "" }] : [];
}
