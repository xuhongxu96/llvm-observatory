// A source's lines highlighted as C++ with tree-sitter (cached per path), or null until
// the parser has loaded and run.
import { useEffect, useState } from "react";
import cHighlights from "tree-sitter-c/queries/highlights.scm?raw";
import cppHighlights from "tree-sitter-cpp/queries/highlights.scm?raw";
import cppWasm from "tree-sitter-cpp/tree-sitter-cpp.wasm?url";
import { Language, Parser, Query } from "web-tree-sitter";
import parserWasm from "web-tree-sitter/web-tree-sitter.wasm?url";
import { highlightLines, type Span } from "../model/highlight.ts";

interface Highlighter {
  parser: Parser;
  query: Query;
}

let highlighter: Promise<Highlighter> | null = null;
const cache = new Map<string, Promise<Span[][]>>();

// C++'s query extends C's: it is meant to follow it.
function loadHighlighter(): Promise<Highlighter> {
  highlighter ??= (async () => {
    await Parser.init({ locateFile: () => parserWasm });
    const cpp = await Language.load(cppWasm);
    const parser = new Parser();
    parser.setLanguage(cpp);
    return { parser, query: new Query(cpp, `${cHighlights}\n${cppHighlights}`) };
  })();
  return highlighter;
}

async function highlight(source: string): Promise<Span[][]> {
  const { parser, query } = await loadHighlighter();
  const tree = parser.parse(source);
  if (!tree) throw new Error("cannot parse");
  try {
    const captures = query.captures(tree.rootNode).map((c) => ({
      start: c.node.startIndex,
      end: c.node.endIndex,
      name: c.name,
      pattern: c.patternIndex,
    }));
    return highlightLines(source, captures);
  } finally {
    tree.delete();
  }
}

export function useHighlight(path: string, source: string | null | undefined): Span[][] | null {
  const [state, setState] = useState<{ path: string; lines: Span[][] } | null>(null);
  useEffect(() => {
    if (!source) return;
    let lines = cache.get(path);
    if (!lines) cache.set(path, (lines = highlight(source)));
    let cancelled = false;
    lines.then(
      (result) => !cancelled && setState({ path, lines: result }),
      (err: unknown) => console.warn(`cannot highlight ${path}`, err), // plain text then
    );
    return () => {
      cancelled = true;
    };
  }, [path, source]);
  return state?.path === path ? state.lines : null;
}
