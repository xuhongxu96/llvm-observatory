// C++ highlighting for the source view: tree-sitter's highlight queries (C's, then C++'s,
// which extends it) as a semantic tokens provider. Monaco's own C++ grammar is a lexer:
// it colors keywords and literals but not types, functions or members.
import type * as monacoApi from "monaco-editor";
import cHighlights from "tree-sitter-c/queries/highlights.scm?raw";
import cppHighlights from "tree-sitter-cpp/queries/highlights.scm?raw";
import cppWasm from "tree-sitter-cpp/tree-sitter-cpp.wasm?url";
import { Language, Parser, Query } from "web-tree-sitter";
import parserWasm from "web-tree-sitter/web-tree-sitter.wasm?url";
import { CATEGORIES, semanticTokens } from "../model/highlight.ts";

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

async function tokens(source: string): Promise<Uint32Array> {
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
    return semanticTokens(source, captures);
  } finally {
    tree.delete();
  }
}

export function registerCppHighlighting(monaco: Monaco): void {
  monaco.languages.registerDocumentSemanticTokensProvider(CPP, {
    getLegend: () => ({ tokenTypes: CATEGORIES, tokenModifiers: [] }),
    provideDocumentSemanticTokens: async (model) => ({ data: await tokens(model.getValue()) }),
    releaseDocumentSemanticTokens: () => {},
  });
}
