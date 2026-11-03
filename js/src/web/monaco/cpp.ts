// C++ highlighting for the source view: tree-sitter's highlight queries (C's, then C++'s,
// which extends it) as a semantic tokens provider. Monaco's own C++ grammar is a lexer:
// it colors keywords and literals but not types, functions or members.
import type * as monacoApi from "monaco-editor";
import cHighlights from "tree-sitter-c/queries/highlights.scm?raw";
import cppHighlights from "tree-sitter-cpp/queries/highlights.scm?raw";
import cppWasm from "tree-sitter-cpp/tree-sitter-cpp.wasm?url";
import { Language, Parser, Query } from "web-tree-sitter";
import parserWasm from "web-tree-sitter/web-tree-sitter.wasm?url";
import { CATEGORIES, categoryRuns, semanticTokens, type Capture } from "../model/highlight.ts";

type Monaco = typeof monacoApi;

export const CPP = "cpp";

interface Highlighter {
  parser: Parser;
  query: Query;
}

let highlighter: Promise<Highlighter> | null = null;

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

async function captures(source: string): Promise<Capture[]> {
  const { parser, query } = await loadHighlighter();
  const tree = parser.parse(source);
  if (!tree) throw new Error("cannot parse");
  try {
    return query.captures(tree.rootNode).map((c) => ({
      start: c.node.startIndex,
      end: c.node.endIndex,
      name: c.name,
      pattern: c.patternIndex,
    }));
  } finally {
    tree.delete();
  }
}

const tokens = async (source: string) => semanticTokens(source, await captures(source));

// C++ in runs of one highlight category, as the source view colors it (for code shown
// outside an editor).
export const cppRuns = async (source: string) => categoryRuns(source, await captures(source));

export function registerCppHighlighting(monaco: Monaco): void {
  monaco.languages.registerDocumentSemanticTokensProvider(CPP, {
    getLegend: () => ({ tokenTypes: CATEGORIES, tokenModifiers: [] }),
    provideDocumentSemanticTokens: async (model) => ({ data: await tokens(model.getValue()) }),
    releaseDocumentSemanticTokens: () => {},
  });
}
