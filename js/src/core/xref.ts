// The cross-references of the build's sources (scripts/xref.py), as clang resolved them:
// what each call calls (overloads, templates and methods included), and the pattern of
// each match(V, P) call, as written.
import type { Location } from "./tags.ts";
import type { Site } from "./types.ts";

// A matcher in a pattern: `m_Add(m_Value(X), m_One())` is m_Add with two sub-patterns.
export interface Pattern {
  name: string; // m_Add
  text: string; // as written
  classes: string[]; // the matcher's class and its bases, e.g. BinaryOp_match
  args: Pattern[]; // the sub-patterns
  vars: { text: string; out: boolean }[]; // the other arguments; out: it binds them (X)
}

// xref.json as written by scripts/xref.py.
export interface XrefFile {
  paths: string[];
  calls: Record<string, [line: number, column: number, path: number, line: number][]>;
  patterns: Record<string, Record<string, Pattern>>;
}

// The definition of what the name at `line`:`column` (1-based, its first character)
// calls, if clang resolved it to one in the sources.
export function definitionAt(file: XrefFile, path: string, line: number, column: number): Location | null {
  const call = file.calls[path]?.find(([l, c]) => l === line && c === column);
  return call ? { path: file.paths[call[2]], line: call[3] } : null;
}

// The pattern of the match call at `site`, if it is written in the call.
export function patternAt(file: XrefFile, site: Site): Pattern | null {
  return file.patterns[site.path]?.[`${site.line}:${site.column}`] ?? null;
}
