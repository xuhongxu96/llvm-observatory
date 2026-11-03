// Syntax highlighting for the text trace (src/core/text.ts) in Monaco.
import type * as monacoApi from "monaco-editor";

type Monaco = typeof monacoApi;

export const TRACE = "observatory-trace";

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
}
