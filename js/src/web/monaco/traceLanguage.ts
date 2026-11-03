// Syntax highlighting for the text trace (src/core/text.ts) in Monaco.
import type * as monacoApi from "monaco-editor";

type Monaco = typeof monacoApi;

export const TRACE = "observatory-trace";
export const TRACE_THEME = { dark: "observatory-trace-dark", light: "observatory-trace-light" } as const;

export function registerTraceLanguage(monaco: Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === TRACE)) return;
  monaco.languages.register({ id: TRACE });
  monaco.languages.setMonarchTokensProvider(TRACE, {
    defaultToken: "",
    tokenizer: {
      root: [
        [/^=== .* ===$/, "trace-marker"],
        [/^(value|replace)\b/, "keyword"],
        [/\[(fn|dbg|rule)=[^\]]*\]/, "trace-meta"],
        [/->/, "trace-arrow"],
        [/^\s*#\d+/, "trace-frame"],
        [/`[^`]*`/, "string"],
        [/[\w./-]+\.(cpp|h|inc|def):\d+/, "trace-srcloc"],
        [/0x[0-9A-Fa-f]+/, "number.hex"],
      ],
    },
  });

  const rules = (colors: Record<string, string>) =>
    Object.entries(colors).map(([token, foreground]) => ({
      token,
      foreground,
      fontStyle: token === "trace-marker" || token === "trace-arrow" ? "bold" : "",
    }));
  monaco.editor.defineTheme(TRACE_THEME.dark, {
    base: "vs-dark",
    inherit: true,
    colors: {},
    rules: rules({
      "trace-marker": "C586C0", "trace-arrow": "D7BA7D", "trace-frame": "B5CEA8", "trace-srcloc": "9CDCFE",
      "trace-meta": "C586C0", "number.hex": "B5CEA8", keyword: "569CD6", string: "CE9178",
    }),
  });
  monaco.editor.defineTheme(TRACE_THEME.light, {
    base: "vs",
    inherit: true,
    colors: {},
    rules: rules({
      "trace-marker": "AF00DB", "trace-arrow": "AF5F00", "trace-frame": "098658", "trace-srcloc": "0451A5",
      "trace-meta": "AF00DB", "number.hex": "098658", keyword: "0000FF", string: "A31515",
    }),
  });
}
