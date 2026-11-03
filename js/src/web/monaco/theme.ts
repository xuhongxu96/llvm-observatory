// The app's Monaco themes. Monaco's theme is global to the page, so every editor uses
// these: they hold the rules of the app's own tokens (the C++ semantic tokens of the
// source view; LLVM IR and JSON use the base themes' rules).
import type * as monacoApi from "monaco-editor";

type Monaco = typeof monacoApi;

export const THEME = { light: "observatory-light", dark: "observatory-dark" } as const;

// token -> [light, dark] foreground; the C++ categories are the source view's semantic
// token types (src/web/model/highlight.ts).
export const COLORS: Record<string, [string, string]> = {
  keyword: ["0000FF", "569CD6"],
  type: ["267F99", "4EC9B0"],
  function: ["795E26", "DCDCAA"],
  property: ["001080", "9CDCFE"],
  string: ["A31515", "CE9178"],
  number: ["098658", "B5CEA8"],
  comment: ["008000", "6A9955"],
  operator: ["3B3B3B", "D4D4D4"],
  label: ["AF00DB", "C586C0"],
};

export function defineThemes(monaco: Monaco): void {
  const rules = (scheme: 0 | 1) =>
    Object.entries(COLORS).map(([token, colors]) => ({
      token,
      foreground: colors[scheme],
      fontStyle: token === "comment" ? "italic" : "",
    }));
  monaco.editor.defineTheme(THEME.light, { base: "vs", inherit: true, colors: {}, rules: rules(0) });
  monaco.editor.defineTheme(THEME.dark, { base: "vs-dark", inherit: true, colors: {}, rules: rules(1) });
}
